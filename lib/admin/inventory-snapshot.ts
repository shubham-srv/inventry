import "server-only"
import { Prisma } from "@prisma/client"
import { startOfDay } from "date-fns"
import { prisma } from "@/lib/db"
import { sqlPage } from "@/lib/admin/sql"
import { activeItemSql } from "@/lib/items/active"
import { ORDER_STATUS, SUBMISSION_STATUS } from "@/lib/constants"
import { currentOnHand, onHandKey, type LocationCount } from "@/lib/inventory/on-hand"
import {
  partnerOrderSql,
  submissionFlag,
  submissionFlagSql,
  type PartnerSort,
  type SubmissionFlag,
} from "@/lib/reports/submission-flag"

/**
 * What every grower has on hand right now, across every item they are
 * authorized for — and how long since each grower last submitted a count.
 *
 * Two shapes over ONE base query, so they cannot disagree:
 *  - getGrowerStockSummary: one row per grower (the report table), with the
 *    last submission and its overdue flag;
 *  - getInventorySnapshot: one row per grower × item (an expanded grower, and
 *    the Excel export).
 *
 * It is AUTHORIZATION-driven: the ledger is LEFT JOINed, so a pair nobody has
 * counted still appears as `onHand: null` — the gaps are the point. The
 * "current on-hand" CTE is the same maths as the low-inventory report (latest
 * ledger row per grower, item and location, summed across locations).
 *
 * "On order" is the open orders for the pair, summed across vendors (all in the
 * item's own unit). It is NOT added to on-hand: a receipt writes no ledger row,
 * and the next count is what moves stock.
 *
 * PERF: the `latest` CTE scans the whole ledger, the same cost the low-inventory
 * report pays. If it bites, the fix is a materialised on-hand table.
 */

export type SnapshotStockState = "Uncounted" | "Zero" | "Low" | "OK"

export type SnapshotFilters = {
  growerId?: number
  locationId?: number
  commodity?: string
  category?: string
  stock?: string
  /** Grower-level overdue flag: never | week | days3 | ok. */
  flag?: string
  q?: string
}

export type InventorySnapshotRow = {
  growerId: number
  growerName: string
  itemId: string
  itemName: string
  legacyId: string | null
  notes: string | null
  commodityName: string | null
  /** The item's material category — also what its quantities are counted in. */
  categoryName: string | null
  /** null = never counted (at the filtered location, when one is chosen). */
  onHand: number | null
  asOf: Date | null
  /** Open orders, summed across vendors. 0 when none. */
  onOrder: number
  threshold: number | null
  thresholdScope: "Grower" | "Global" | null
  state: SnapshotStockState
  /** The grower's last submitted count (any location, or the filtered one). */
  lastSubmittedAt: Date | null
}

export type GrowerStockSummaryRow = {
  growerId: number
  growerName: string
  locations: number
  /** Matching items, and how many of them are low / zero / never counted / on order. */
  items: number
  low: number
  zero: number
  uncounted: number
  onOrderItems: number
  lastSubmittedAt: Date | null
  daysSince: number | null
  flag: SubmissionFlag
}

type RawRow = {
  growerId: number
  growerName: string
  itemId: string
  itemName: string
  legacyId: string | null
  notes: string | null
  commodityName: string | null
  categoryName: string | null
  onHand: Prisma.Decimal | null
  asOf: Date | null
  onOrder: Prisma.Decimal
  threshold: Prisma.Decimal | null
  thresholdGrowerId: number | null
  lastSubmittedAt: Date | null
}

/**
 * The stock-state predicates, kept MUTUALLY EXCLUSIVE so the four filtered
 * counts add up to the unfiltered total. `state()` below applies the same
 * precedence in TS, so the badge and the filter can never disagree.
 */
function stockFilter(stock: string | undefined): Prisma.Sql {
  switch (stock) {
    case "uncounted":
      return Prisma.sql`AND [onHand] IS NULL`
    case "zero":
      return Prisma.sql`AND [onHand] = 0`
    case "low":
      return Prisma.sql`AND [onHand] > 0 AND [threshold] IS NOT NULL AND [onHand] < [threshold]`
    case "ok":
      return Prisma.sql`AND [onHand] > 0 AND ([threshold] IS NULL OR [onHand] >= [threshold])`
    default:
      return Prisma.empty
  }
}

function state(onHand: number | null, threshold: number | null): SnapshotStockState {
  if (onHand == null) return "Uncounted"
  if (onHand === 0) return "Zero"
  if (threshold != null && onHand < threshold) return "Low"
  return "OK"
}

/** The shared CTE chain, ending in `base` (one row per matching grower × item). */
function prelude(filters: SnapshotFilters, today: Date): Prisma.Sql {
  // A location filter has three halves, and all are needed.
  //
  //  - Inside `latest`, it narrows the sum to that site. A pair counted only
  //    elsewhere then comes back NULL, i.e. "uncounted at this site".
  //  - On `base`, it restricts to growers who actually count at that site.
  //    Without it, filtering to one location lists every grower in the system.
  //  - On `lastsub`, "last submitted" becomes last submitted AT that site.
  const ledgerLocation = filters.locationId
    ? Prisma.sql`WHERE l.[locationId] = ${filters.locationId}`
    : Prisma.empty
  const submissionLocation = filters.locationId
    ? Prisma.sql`AND s.[locationId] = ${filters.locationId}`
    : Prisma.empty
  const growerAtLocation = filters.locationId
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM [dbo].[GrowerLocation] gl
        WHERE gl.[growerId] = a.[growerId] AND gl.[locationId] = ${filters.locationId} AND gl.[isActive] = 1
      )`
    : Prisma.empty
  const growerFilter = filters.growerId
    ? Prisma.sql`AND a.[growerId] = ${filters.growerId}`
    : Prisma.empty
  const commodityFilter = filters.commodity
    ? Prisma.sql`AND i.[commodityCode] = ${filters.commodity}`
    : Prisma.empty
  const categoryFilter = filters.category
    ? Prisma.sql`AND i.[materialCategoryCode] = ${filters.category}`
    : Prisma.empty
  // Grower name is searchable here because the grower is a row dimension.
  const qFilter = filters.q
    ? Prisma.sql`AND (i.[itemName] LIKE ${"%" + filters.q + "%"} OR a.[itemId] LIKE ${"%" + filters.q + "%"} OR i.[legacyFamousId] LIKE ${"%" + filters.q + "%"} OR g.[growerName] LIKE ${"%" + filters.q + "%"})`
    : Prisma.empty
  const flagFilter = submissionFlagSql(Prisma.sql`ls.[lastSubmittedAt]`, filters.flag, today)

  return Prisma.sql`
    WITH latest AS (
      SELECT
        l.[growerId], l.[itemId], l.[locationId], l.[finalQuantity], l.[date],
        ROW_NUMBER() OVER (
          PARTITION BY l.[growerId], l.[itemId], l.[locationId]
          ORDER BY l.[date] DESC, l.[id] DESC
        ) AS rn
      FROM [dbo].[InventoryLedger] l
      ${ledgerLocation}
    ),
    onhand AS (
      SELECT [growerId], [itemId], SUM([finalQuantity]) AS [onHand], MAX([date]) AS [asOf]
      FROM latest
      WHERE rn = 1
      GROUP BY [growerId], [itemId]
    ),
    onorder AS (
      SELECT o.[growerId], o.[itemId], SUM(o.[quantity]) AS [onOrder]
      FROM [dbo].[Order] o
      WHERE o.[status] = ${ORDER_STATUS.OPEN}
      GROUP BY o.[growerId], o.[itemId]
    ),
    lastsub AS (
      -- Drafts are not submissions: only Approved counts, as on the dashboard.
      SELECT s.[growerId], MAX(s.[submissionDate]) AS [lastSubmittedAt]
      FROM [dbo].[GrowerSubmission] s
      WHERE s.[status] = ${SUBMISSION_STATUS.APPROVED}
        ${submissionLocation}
      GROUP BY s.[growerId]
    ),
    base AS (
      SELECT
        a.[growerId],
        g.[growerName],
        a.[itemId],
        i.[itemName],
        i.[legacyFamousId] AS [legacyId],
        i.[notes],
        c.[name] AS [commodityName],
        mc.[name] AS [categoryName],
        oh.[onHand],
        oh.[asOf],
        ISNULL(oo.[onOrder], 0) AS [onOrder],
        th.[thresholdQuantity] AS [threshold],
        th.[growerId] AS [thresholdGrowerId],
        ls.[lastSubmittedAt]
      FROM [dbo].[GrowerItemAuthorization] a
      INNER JOIN [dbo].[Grower] g ON g.[id] = a.[growerId]
      INNER JOIN [dbo].[Item] i ON i.[id] = a.[itemId]
      LEFT JOIN [dbo].[Commodity] c ON c.[code] = i.[commodityCode]
      LEFT JOIN [dbo].[MaterialCategory] mc ON mc.[code] = i.[materialCategoryCode]
      -- LEFT, so never-counted pairs survive as NULL rather than dropping out.
      LEFT JOIN onhand oh ON oh.[growerId] = a.[growerId] AND oh.[itemId] = a.[itemId]
      LEFT JOIN onorder oo ON oo.[growerId] = a.[growerId] AND oo.[itemId] = a.[itemId]
      LEFT JOIN lastsub ls ON ls.[growerId] = a.[growerId]
      -- Grower-specific threshold wins over the global one.
      OUTER APPLY (
        SELECT TOP 1 t.[thresholdQuantity], t.[growerId]
        FROM [dbo].[ItemThreshold] t
        WHERE t.[itemId] = a.[itemId]
          AND (t.[growerId] = a.[growerId] OR t.[growerId] IS NULL)
        ORDER BY CASE WHEN t.[growerId] IS NULL THEN 1 ELSE 0 END
      ) th
      WHERE a.[isActive] = 1
        AND ${activeItemSql("i")}
        AND g.[status] = 'Active'
        ${growerFilter}
        ${growerAtLocation}
        ${commodityFilter}
        ${categoryFilter}
        ${qFilter}
        ${flagFilter}
    )`
}

/** One row per grower × item. Unpaged (the export) unless `page` is given. */
export async function getInventorySnapshot(
  filters: SnapshotFilters,
  page?: { skip: number; take: number }
): Promise<{ rows: InventorySnapshotRow[]; total: number }> {
  const base = prelude(filters, startOfDay(new Date()))
  // The stock filter predicates on computed columns, so it can only be applied
  // outside the CTE that defines them.
  const stock = stockFilter(filters.stock)

  const [rows, counted] = await Promise.all([
    prisma.$queryRaw<RawRow[]>`
      ${base}
      SELECT * FROM base WHERE 1 = 1 ${stock}
      ORDER BY [growerName] ASC, [itemName] ASC, [itemId] ASC
      ${sqlPage(page)}
    `,
    prisma.$queryRaw<{ total: number }[]>`
      ${base}
      SELECT COUNT(*) AS [total] FROM base WHERE 1 = 1 ${stock}
    `,
  ])

  return {
    rows: rows.map((r) => {
      const onHand = r.onHand == null ? null : Number(r.onHand)
      const threshold = r.threshold == null ? null : Number(r.threshold)
      return {
        growerId: r.growerId,
        growerName: r.growerName,
        itemId: r.itemId,
        itemName: r.itemName,
        legacyId: r.legacyId,
        notes: r.notes,
        commodityName: r.commodityName,
        categoryName: r.categoryName,
        onHand,
        asOf: r.asOf,
        onOrder: Number(r.onOrder),
        threshold,
        thresholdScope:
          r.threshold == null ? null : r.thresholdGrowerId == null ? "Global" : "Grower",
        state: state(onHand, threshold),
        lastSubmittedAt: r.lastSubmittedAt,
      }
    }),
    total: Number(counted[0]?.total ?? 0),
  }
}

/** One row per grower with any matching item — the report table. */
export async function getGrowerStockSummary(
  filters: SnapshotFilters,
  sort: PartnerSort,
  page?: { skip: number; take: number }
): Promise<{ rows: GrowerStockSummaryRow[]; total: number }> {
  const today = startOfDay(new Date())
  const base = prelude(filters, today)
  const stock = stockFilter(filters.stock)
  const order = partnerOrderSql(sort, Prisma.sql`b.[lastSubmittedAt]`, Prisma.sql`b.[growerName]`)

  const [rows, counted] = await Promise.all([
    prisma.$queryRaw<
      {
        growerId: number
        growerName: string
        lastSubmittedAt: Date | null
        items: number
        uncounted: number
        zero: number
        low: number
        onOrderItems: number
        locations: number
      }[]
    >`
      ${base}
      SELECT
        b.[growerId], b.[growerName], b.[lastSubmittedAt],
        COUNT(*) AS [items],
        SUM(CASE WHEN b.[onHand] IS NULL THEN 1 ELSE 0 END) AS [uncounted],
        SUM(CASE WHEN b.[onHand] = 0 THEN 1 ELSE 0 END) AS [zero],
        SUM(CASE WHEN b.[onHand] > 0 AND b.[threshold] IS NOT NULL AND b.[onHand] < b.[threshold] THEN 1 ELSE 0 END) AS [low],
        SUM(CASE WHEN b.[onOrder] > 0 THEN 1 ELSE 0 END) AS [onOrderItems],
        (SELECT COUNT(*) FROM [dbo].[GrowerLocation] gl WHERE gl.[growerId] = b.[growerId] AND gl.[isActive] = 1) AS [locations]
      FROM base b
      WHERE 1 = 1 ${stock}
      GROUP BY b.[growerId], b.[growerName], b.[lastSubmittedAt]
      ${order}
      ${sqlPage(page)}
    `,
    prisma.$queryRaw<{ total: number }[]>`
      ${base}
      SELECT COUNT(*) AS [total]
      FROM (SELECT b.[growerId] FROM base b WHERE 1 = 1 ${stock} GROUP BY b.[growerId]) x
    `,
  ])

  return {
    rows: rows.map((r) => ({
      growerId: r.growerId,
      growerName: r.growerName,
      locations: Number(r.locations),
      items: Number(r.items),
      low: Number(r.low),
      zero: Number(r.zero),
      uncounted: Number(r.uncounted),
      onOrderItems: Number(r.onOrderItems),
      lastSubmittedAt: r.lastSubmittedAt,
      ...submissionFlag(r.lastSubmittedAt, today),
    })),
    total: Number(counted[0]?.total ?? 0),
  }
}

export type GrowerLocationColumn = {
  locationId: number
  locationName: string
  /** Last submitted count at this site. */
  lastSubmittedAt: Date | null
}

export type GrowerStockDetail = {
  locations: GrowerLocationColumn[]
  rows: (InventorySnapshotRow & { byLocation: Map<number, LocationCount> })[]
}

/** An expanded grower: its items, with on-hand split by location. */
export async function getGrowerStockDetail(
  growerId: number,
  filters: SnapshotFilters
): Promise<GrowerStockDetail> {
  const [{ rows }, onHand, sites, lastByLocation] = await Promise.all([
    getInventorySnapshot({ ...filters, growerId }),
    currentOnHand(prisma, { growerIds: [growerId] }),
    prisma.growerLocation.findMany({
      where: { growerId, isActive: true, ...(filters.locationId ? { locationId: filters.locationId } : {}) },
      include: { location: { select: { id: true, locationName: true } } },
      orderBy: { location: { locationName: "asc" } },
    }),
    prisma.growerSubmission.groupBy({
      by: ["locationId"],
      where: { growerId, status: SUBMISSION_STATUS.APPROVED },
      _max: { submissionDate: true },
    }),
  ])
  const last = new Map(lastByLocation.map((l) => [l.locationId, l._max.submissionDate]))

  return {
    locations: sites.map((s) => ({
      locationId: s.location.id,
      locationName: s.location.locationName,
      lastSubmittedAt: last.get(s.location.id) ?? null,
    })),
    rows: rows.map((r) => ({
      ...r,
      byLocation: new Map(
        (onHand.get(onHandKey(growerId, r.itemId))?.byLocation ?? []).map((l) => [l.locationId, l])
      ),
    })),
  }
}

/** On-hand by location as text, for the export ("Yuma 40 · Salinas 12"). */
export async function onHandByLocationText(rows: InventorySnapshotRow[]): Promise<Map<string, string>> {
  const onHand = await currentOnHand(prisma, {
    growerIds: [...new Set(rows.map((r) => r.growerId))],
    itemIds: [...new Set(rows.map((r) => r.itemId))],
  })
  const out = new Map<string, string>()
  for (const [key, v] of onHand) out.set(key, v.byLocation.map((l) => `${l.locationName} ${l.quantity}`).join(" · "))
  return out
}
