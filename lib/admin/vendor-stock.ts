import "server-only"
import { Prisma } from "@prisma/client"
import { startOfDay } from "date-fns"
import { prisma } from "@/lib/db"
import { sqlPage } from "@/lib/admin/sql"
import { activeItemSql } from "@/lib/items/active"
import { ENTITY_STATUS, ORDER_STATUS } from "@/lib/constants"
import {
  partnerOrderSql,
  submissionFlag,
  submissionFlagSql,
  type PartnerSort,
  type SubmissionFlag,
} from "@/lib/reports/submission-flag"

/**
 * What every vendor last told us they are holding, per item — and how long
 * since each vendor last reported. Mirrors lib/admin/inventory-snapshot.ts: one
 * base query, read either one row per vendor (the report table) or one row per
 * vendor × item (an expanded vendor, and the export).
 *
 * Driven off the vendor↔item MAPPINGS with the latest report LEFT JOINed, so a
 * mapping nobody has reported against still appears — the gaps are the point.
 *
 * TWO THINGS THIS IS NOT:
 *
 *  - It is NOT comparable with grower stock. Grower stock is a counted quantity
 *    in the ledger; this is a vendor's self-report, and an allocation is an
 *    INTENTION that moves nothing.
 *  - There is no "low" state: there is no vendor threshold. What matters for a
 *    vendor is how long ago they last reported, so the flag is staleness — the
 *    same 3-day / 1-week bands as growers (lib/reports/submission-flag.ts).
 *
 * PERF: the ROW_NUMBER partition sees every detail row; if it bites, the fix is
 * a materialised current-stock table rather than an index.
 */

export type VendorStockFilters = {
  vendorId?: number
  commodity?: string
  category?: string
  /** Narrows to items this grower has a share of on the LATEST report. */
  growerId?: number
  alloc?: string
  /** Vendor-level overdue flag: never | week | days3 | ok. */
  flag?: string
  q?: string
}

export type VendorStockRow = {
  vendorId: number
  vendorName: string
  itemId: string
  itemName: string
  legacyId: string | null
  notes: string | null
  commodityName: string | null
  /** The item's material category — what the quantities are counted in. */
  categoryName: string | null
  /** null = never reported. Distinct from a reported zero. */
  reported: number | null
  /** When this item was last reported (may predate the vendor's latest report). */
  asOf: Date | null
  /** null when never reported; 0 is a real "reported, none earmarked". */
  allocated: number | null
  unallocated: number | null
  growersServed: number | null
  /** The vendor's latest report of any item. */
  lastSubmittedAt: Date | null
}

export type VendorStockSummaryRow = {
  vendorId: number
  vendorName: string
  items: number
  neverReported: number
  /** Reported items with stock not yet earmarked for any grower. */
  unallocatedItems: number
  /** Open orders still waiting for this vendor to confirm a delivery date. */
  awaitingDate: number
  lastSubmittedAt: Date | null
  daysSince: number | null
  flag: SubmissionFlag
}

type RawRow = {
  vendorId: number
  vendorName: string
  itemId: string
  itemName: string
  legacyId: string | null
  notes: string | null
  commodityName: string | null
  categoryName: string | null
  reported: Prisma.Decimal | null
  asOf: Date | null
  allocated: Prisma.Decimal | null
  growersServed: number | null
  lastSubmittedAt: Date | null
}

function allocFilter(alloc: string | undefined): Prisma.Sql {
  switch (alloc) {
    case "full":
      return Prisma.sql`AND [reported] IS NOT NULL AND [allocated] >= [reported]`
    case "partial":
      return Prisma.sql`AND [reported] IS NOT NULL AND [allocated] < [reported]`
    case "none":
      return Prisma.sql`AND [reported] IS NOT NULL AND [allocated] = 0`
    case "unreported":
      return Prisma.sql`AND [reported] IS NULL`
    default:
      return Prisma.empty
  }
}

function prelude(filters: VendorStockFilters, today: Date): Prisma.Sql {
  const vendorFilter = filters.vendorId
    ? Prisma.sql`AND iv.[vendorId] = ${filters.vendorId}`
    : Prisma.empty
  const commodityFilter = filters.commodity
    ? Prisma.sql`AND i.[commodityCode] = ${filters.commodity}`
    : Prisma.empty
  const categoryFilter = filters.category
    ? Prisma.sql`AND i.[materialCategoryCode] = ${filters.category}`
    : Prisma.empty
  // Reaches through the allocations on the LATEST report only — the right answer
  // to "what is any vendor currently holding for Agribar". It drops
  // never-reported mappings, so it is the one filter that stops this being a
  // complete list of mappings.
  const growerFilter = filters.growerId
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM [dbo].[VendorAllocation] a
        WHERE a.[vendorSubmissionDetailId] = cur.[detailId] AND a.[growerId] = ${filters.growerId}
      )`
    : Prisma.empty
  const qFilter = filters.q
    ? Prisma.sql`AND (i.[itemName] LIKE ${"%" + filters.q + "%"} OR iv.[itemId] LIKE ${"%" + filters.q + "%"} OR i.[legacyFamousId] LIKE ${"%" + filters.q + "%"} OR v.[vendorName] LIKE ${"%" + filters.q + "%"})`
    : Prisma.empty
  const flagFilter = submissionFlagSql(Prisma.sql`lr.[lastSubmittedAt]`, filters.flag, today)

  return Prisma.sql`
    WITH curr AS (
      SELECT
        s.[vendorId], d.[itemId], d.[id] AS [detailId], d.[quantity], s.[submissionDate],
        ROW_NUMBER() OVER (
          PARTITION BY s.[vendorId], d.[itemId]
          -- The id tiebreak is load-bearing: VendorSubmissionDetail has NO
          -- unique on (submissionId, itemId), so two rows for one item in one
          -- report are representable. Without it the report is non-deterministic.
          ORDER BY s.[submissionDate] DESC, d.[id] DESC
        ) AS rn
      FROM [dbo].[VendorSubmissionDetail] d
      INNER JOIN [dbo].[VendorSubmission] s ON s.[id] = d.[submissionId]
    ),
    lastrep AS (
      SELECT s.[vendorId], MAX(s.[submissionDate]) AS [lastSubmittedAt]
      FROM [dbo].[VendorSubmission] s
      GROUP BY s.[vendorId]
    ),
    base AS (
      SELECT
        iv.[vendorId], v.[vendorName], iv.[itemId], i.[itemName],
        i.[legacyFamousId] AS [legacyId], i.[notes],
        c.[name] AS [commodityName], mc.[name] AS [categoryName],
        cur.[quantity] AS [reported],
        cur.[submissionDate] AS [asOf],
        -- Zero allocations on a REPORTED item is a real zero; on a never-reported
        -- item it must stay NULL, or "nothing earmarked" and "nothing to earmark"
        -- render as the same cell.
        CASE WHEN cur.[detailId] IS NULL THEN NULL ELSE ISNULL(al.[allocated], 0) END AS [allocated],
        CASE WHEN cur.[detailId] IS NULL THEN NULL ELSE ISNULL(al.[growersServed], 0) END AS [growersServed],
        lr.[lastSubmittedAt]
      FROM [dbo].[ItemVendor] iv
      INNER JOIN [dbo].[Vendor] v ON v.[id] = iv.[vendorId]
      INNER JOIN [dbo].[Item] i ON i.[id] = iv.[itemId]
      LEFT JOIN [dbo].[Commodity] c ON c.[code] = i.[commodityCode]
      LEFT JOIN [dbo].[MaterialCategory] mc ON mc.[code] = i.[materialCategoryCode]
      -- LEFT, so a mapping never reported against survives as NULL.
      LEFT JOIN (SELECT * FROM curr WHERE rn = 1) cur
        ON cur.[vendorId] = iv.[vendorId] AND cur.[itemId] = iv.[itemId]
      LEFT JOIN lastrep lr ON lr.[vendorId] = iv.[vendorId]
      -- Correlated to the winning detail only, so it never aggregates history.
      OUTER APPLY (
        SELECT SUM(a.[quantity]) AS [allocated], COUNT(DISTINCT a.[growerId]) AS [growersServed]
        FROM [dbo].[VendorAllocation] a
        WHERE a.[vendorSubmissionDetailId] = cur.[detailId]
      ) al
      WHERE iv.[isActive] = 1
        AND ${activeItemSql("i")}
        AND v.[status] = ${ENTITY_STATUS.ACTIVE}
        ${vendorFilter}
        ${commodityFilter}
        ${categoryFilter}
        ${growerFilter}
        ${qFilter}
        ${flagFilter}
    )`
}

/** One row per vendor × item. Unpaged (the export) unless `page` is given. */
export async function getVendorStock(
  filters: VendorStockFilters,
  page?: { skip: number; take: number }
): Promise<{ rows: VendorStockRow[]; total: number }> {
  const base = prelude(filters, startOfDay(new Date()))
  const alloc = allocFilter(filters.alloc)

  const [rows, counted] = await Promise.all([
    prisma.$queryRaw<RawRow[]>`
      ${base}
      SELECT * FROM base WHERE 1 = 1 ${alloc}
      ORDER BY [vendorName] ASC, [itemName] ASC, [itemId] ASC
      ${sqlPage(page)}
    `,
    prisma.$queryRaw<{ total: number }[]>`
      ${base}
      SELECT COUNT(*) AS [total] FROM base WHERE 1 = 1 ${alloc}
    `,
  ])

  return {
    rows: rows.map((r) => {
      const reported = r.reported == null ? null : Number(r.reported)
      const allocated = r.allocated == null ? null : Number(r.allocated)
      return {
        vendorId: r.vendorId,
        vendorName: r.vendorName,
        itemId: r.itemId,
        itemName: r.itemName,
        legacyId: r.legacyId,
        notes: r.notes,
        commodityName: r.commodityName,
        categoryName: r.categoryName,
        reported,
        asOf: r.asOf,
        allocated,
        // Not clamped. The submit action already enforces allocations <= quantity,
        // so a negative here would be a data bug worth seeing rather than hiding.
        unallocated: reported == null || allocated == null ? null : reported - allocated,
        growersServed: r.growersServed == null ? null : Number(r.growersServed),
        lastSubmittedAt: r.lastSubmittedAt,
      }
    }),
    total: Number(counted[0]?.total ?? 0),
  }
}

/** One row per vendor with any matching item — the report table. */
export async function getVendorStockSummary(
  filters: VendorStockFilters,
  sort: PartnerSort,
  page?: { skip: number; take: number }
): Promise<{ rows: VendorStockSummaryRow[]; total: number }> {
  const today = startOfDay(new Date())
  const base = prelude(filters, today)
  const alloc = allocFilter(filters.alloc)
  const order = partnerOrderSql(sort, Prisma.sql`b.[lastSubmittedAt]`, Prisma.sql`b.[vendorName]`)

  const [rows, counted] = await Promise.all([
    prisma.$queryRaw<
      {
        vendorId: number
        vendorName: string
        lastSubmittedAt: Date | null
        items: number
        neverReported: number
        unallocatedItems: number
        awaitingDate: number
      }[]
    >`
      ${base}
      SELECT
        b.[vendorId], b.[vendorName], b.[lastSubmittedAt],
        COUNT(*) AS [items],
        SUM(CASE WHEN b.[reported] IS NULL THEN 1 ELSE 0 END) AS [neverReported],
        SUM(CASE WHEN b.[reported] IS NOT NULL AND b.[allocated] < b.[reported] THEN 1 ELSE 0 END) AS [unallocatedItems],
        (
          SELECT COUNT(*) FROM [dbo].[Order] o
          WHERE o.[vendorId] = b.[vendorId] AND o.[status] = ${ORDER_STATUS.OPEN} AND o.[confirmedDeliveryDate] IS NULL
        ) AS [awaitingDate]
      FROM base b
      WHERE 1 = 1 ${alloc}
      GROUP BY b.[vendorId], b.[vendorName], b.[lastSubmittedAt]
      ${order}
      ${sqlPage(page)}
    `,
    prisma.$queryRaw<{ total: number }[]>`
      ${base}
      SELECT COUNT(*) AS [total]
      FROM (SELECT b.[vendorId] FROM base b WHERE 1 = 1 ${alloc} GROUP BY b.[vendorId]) x
    `,
  ])

  return {
    rows: rows.map((r) => ({
      vendorId: r.vendorId,
      vendorName: r.vendorName,
      items: Number(r.items),
      neverReported: Number(r.neverReported),
      unallocatedItems: Number(r.unallocatedItems),
      awaitingDate: Number(r.awaitingDate),
      lastSubmittedAt: r.lastSubmittedAt,
      ...submissionFlag(r.lastSubmittedAt, today),
    })),
    total: Number(counted[0]?.total ?? 0),
  }
}
