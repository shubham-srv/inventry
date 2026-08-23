import "server-only"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { sqlPage } from "@/lib/admin/sql"

/**
 * What every grower has on hand right now, across every item they are
 * authorized for.
 *
 * Two things distinguish this from getCurrentlyLow (lib/admin/low-inventory.ts),
 * which it otherwise shares its maths with:
 *
 *  1. It is AUTHORIZATION-driven, not ledger-driven. The ledger is LEFT JOINed,
 *     so a grower×item pair nobody has ever counted still appears — as
 *     `onHand: null`. That is the point of a snapshot: you can see the gaps, not
 *     only what was reported.
 *  2. It pages. The unfiltered set is every authorized pair, which is far more
 *     rows than "the ones below threshold".
 *
 * The "current on-hand" CTE is deliberately identical to the low-inventory one —
 * latest ledger row per (grower, item, location), summed across locations — so
 * the two pages cannot disagree about a number.
 *
 * PERF: the `latest` CTE scans the whole ledger. That is the same cost the
 * existing low-inventory report already pays, so this is precedent-consistent.
 * If it ever bites, the fix is a materialised on-hand table, not an index —
 * ROW_NUMBER over the full partition has to see every row.
 */

export type SnapshotStockState = "Uncounted" | "Zero" | "Low" | "OK"

export type SnapshotFilters = {
  growerId?: number
  locationId?: number
  commodity?: string
  category?: string
  stock?: string
  q?: string
}

export type InventorySnapshotRow = {
  growerId: number
  growerName: string
  itemId: string
  itemName: string
  commodityName: string | null
  /** The item's material category — also what its quantities are counted in. */
  categoryName: string | null
  /** null = never counted (at the filtered location, when one is chosen). */
  onHand: number | null
  asOf: Date | null
  threshold: number | null
  thresholdScope: "Grower" | "Global" | null
  state: SnapshotStockState
}

type RawRow = {
  growerId: number
  growerName: string
  itemId: string
  itemName: string
  commodityName: string | null
  categoryName: string | null
  onHand: Prisma.Decimal | null
  asOf: Date | null
  threshold: Prisma.Decimal | null
  thresholdGrowerId: number | null
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

export async function getInventorySnapshot(
  filters: SnapshotFilters,
  page?: { skip: number; take: number }
): Promise<{ rows: InventorySnapshotRow[]; total: number }> {
  // A location filter has two halves, and both are needed.
  //
  //  - Inside `latest`, it narrows the sum to that site. A pair counted only
  //    elsewhere then comes back NULL, i.e. "uncounted at this site", which is
  //    the right answer to "what is on hand at Yuma".
  //  - On `base`, it restricts to growers who actually count at that site.
  //    Without it, filtering to one location lists every grower in the system
  //    with every authorized item, all uncounted.
  const ledgerLocation = filters.locationId
    ? Prisma.sql`WHERE l.[locationId] = ${filters.locationId}`
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
  // Grower name is searchable here (unlike low-inventory) because the grower is
  // a row dimension on this page, not a filter-only one.
  const qFilter = filters.q
    ? Prisma.sql`AND (i.[itemName] LIKE ${"%" + filters.q + "%"} OR a.[itemId] LIKE ${"%" + filters.q + "%"} OR g.[growerName] LIKE ${"%" + filters.q + "%"})`
    : Prisma.empty

  // Built once and interpolated into both the page query and the count query.
  // Nested Prisma.sql fragments rebind their parameters per execution.
  const prelude = Prisma.sql`
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
    base AS (
      SELECT
        a.[growerId],
        g.[growerName],
        a.[itemId],
        i.[itemName],
        c.[name] AS [commodityName],
        mc.[name] AS [categoryName],
        oh.[onHand],
        oh.[asOf],
        th.[thresholdQuantity] AS [threshold],
        th.[growerId] AS [thresholdGrowerId]
      FROM [dbo].[GrowerItemAuthorization] a
      INNER JOIN [dbo].[Grower] g ON g.[id] = a.[growerId]
      INNER JOIN [dbo].[Item] i ON i.[id] = a.[itemId]
      LEFT JOIN [dbo].[Commodity] c ON c.[code] = i.[commodityCode]
      LEFT JOIN [dbo].[MaterialCategory] mc ON mc.[code] = i.[materialCategoryCode]
      -- LEFT, so never-counted pairs survive as NULL rather than dropping out.
      LEFT JOIN onhand oh ON oh.[growerId] = a.[growerId] AND oh.[itemId] = a.[itemId]
      -- Grower-specific threshold wins over the global one.
      OUTER APPLY (
        SELECT TOP 1 t.[thresholdQuantity], t.[growerId]
        FROM [dbo].[ItemThreshold] t
        WHERE t.[itemId] = a.[itemId]
          AND (t.[growerId] = a.[growerId] OR t.[growerId] IS NULL)
        ORDER BY CASE WHEN t.[growerId] IS NULL THEN 1 ELSE 0 END
      ) th
      WHERE a.[isActive] = 1
        AND i.[status] = 'Active'
        AND g.[status] = 'Active'
        ${growerFilter}
        ${growerAtLocation}
        ${commodityFilter}
        ${categoryFilter}
        ${qFilter}
    )`

  // The stock filter predicates on computed columns, so it can only be applied
  // outside the CTE that defines them.
  const stock = stockFilter(filters.stock)

  const [rows, counted] = await Promise.all([
    prisma.$queryRaw<RawRow[]>`
      ${prelude}
      SELECT * FROM base WHERE 1 = 1 ${stock}
      ORDER BY [growerName] ASC, [itemName] ASC, [itemId] ASC
      ${sqlPage(page)}
    `,
    prisma.$queryRaw<{ total: number }[]>`
      ${prelude}
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
        commodityName: r.commodityName,
        categoryName: r.categoryName,
        onHand,
        asOf: r.asOf,
        threshold,
        thresholdScope:
          r.threshold == null ? null : r.thresholdGrowerId == null ? "Global" : "Grower",
        state: state(onHand, threshold),
      }
    }),
    total: Number(counted[0]?.total ?? 0),
  }
}
