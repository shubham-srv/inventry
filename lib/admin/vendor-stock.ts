import "server-only"
import { Prisma } from "@prisma/client"
import { differenceInCalendarDays, startOfDay, subDays } from "date-fns"
import { prisma } from "@/lib/db"
import { sqlPage } from "@/lib/admin/sql"
import { ENTITY_STATUS } from "@/lib/constants"

/**
 * What every vendor last told us they are holding, per item.
 *
 * Driven off the vendor↔item MAPPINGS, not off the submissions, with the latest
 * report LEFT JOINed on. A mapping nobody has ever reported against therefore
 * still appears, as "Never reported" — the same reasoning as the grower snapshot
 * in lib/admin/inventory-snapshot.ts: the gaps are the point of the report.
 *
 * TWO THINGS THIS IS NOT:
 *
 *  - It is NOT comparable with grower stock, despite both tabs saying "stock".
 *    Grower stock is a counted quantity in the ledger. This is a vendor's own
 *    self-report, and an allocation is an INTENTION — earmarking 100 for Agribar
 *    moves nothing and writes no ledger row. Adding the two together is wrong.
 *  - There is no "low" state, because there is no vendor threshold to compare
 *    against — ItemThreshold is grower-scoped (itemId + nullable growerId). What
 *    matters for a vendor is how long ago they last told us anything, so the
 *    status column is STALENESS.
 *
 * PERF: the ROW_NUMBER partition has to see every detail row, and the partition
 * key is split across two tables so it joins then sorts. Same cost profile as
 * the grower snapshot; if it ever bites, the fix is a materialised current-stock
 * table rather than an index.
 */

/**
 * Staleness boundaries, in days. Tied to the weekly-ish cadence vendors actually
 * report on: one missed report is worth noticing, two is worth chasing.
 */
export const VENDOR_STOCK_STALENESS = { FRESH_DAYS: 7, AGEING_DAYS: 14 } as const

export type VendorStockState = "Fresh" | "Ageing" | "Stale" | "NeverReported"

export type VendorStockFilters = {
  vendorId?: number
  commodity?: string
  category?: string
  /** Narrows to items this grower has a share of on the LATEST report. */
  growerId?: number
  freshness?: string
  alloc?: string
  q?: string
}

export type VendorStockRow = {
  vendorId: number
  vendorName: string
  itemId: string
  itemName: string
  commodityName: string | null
  /** The item's material category — what the quantities are counted in. */
  categoryName: string | null
  /** null = never reported. Distinct from a reported zero. */
  reported: number | null
  asOf: Date | null
  /** null when never reported; 0 is a real "reported, none earmarked". */
  allocated: number | null
  unallocated: number | null
  growersServed: number | null
  state: VendorStockState
}

type RawRow = {
  vendorId: number
  vendorName: string
  itemId: string
  itemName: string
  commodityName: string | null
  categoryName: string | null
  reported: Prisma.Decimal | null
  asOf: Date | null
  allocated: Prisma.Decimal | null
  growersServed: number | null
}

function staleness(asOf: Date | null, today: Date): VendorStockState {
  if (asOf == null) return "NeverReported"
  const days = differenceInCalendarDays(today, asOf)
  if (days < VENDOR_STOCK_STALENESS.FRESH_DAYS) return "Fresh"
  if (days < VENDOR_STOCK_STALENESS.AGEING_DAYS) return "Ageing"
  return "Stale"
}

/**
 * SQL mirror of `staleness`. The boundary Dates are computed ONCE per call and
 * handed to both, so the page and the export cannot drift apart.
 *
 * These four DO partition the row set exactly, so the filtered counts add up to
 * the unfiltered total.
 */
function freshnessFilter(
  freshness: string | undefined,
  fresh: Date,
  ageing: Date
): Prisma.Sql {
  switch (freshness) {
    case "fresh":
      return Prisma.sql`AND [asOf] IS NOT NULL AND [asOf] >= ${fresh}`
    case "ageing":
      return Prisma.sql`AND [asOf] IS NOT NULL AND [asOf] < ${fresh} AND [asOf] >= ${ageing}`
    case "stale":
      return Prisma.sql`AND [asOf] IS NOT NULL AND [asOf] < ${ageing}`
    case "never":
      return Prisma.sql`AND [asOf] IS NULL`
    default:
      return Prisma.empty
  }
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

export async function getVendorStock(
  filters: VendorStockFilters,
  page?: { skip: number; take: number }
): Promise<{ rows: VendorStockRow[]; total: number }> {
  const today = startOfDay(new Date())
  const freshBoundary = subDays(today, VENDOR_STOCK_STALENESS.FRESH_DAYS)
  const ageingBoundary = subDays(today, VENDOR_STOCK_STALENESS.AGEING_DAYS)

  const vendorFilter = filters.vendorId
    ? Prisma.sql`AND iv.[vendorId] = ${filters.vendorId}`
    : Prisma.empty
  const commodityFilter = filters.commodity
    ? Prisma.sql`AND i.[commodityCode] = ${filters.commodity}`
    : Prisma.empty
  const categoryFilter = filters.category
    ? Prisma.sql`AND i.[materialCategoryCode] = ${filters.category}`
    : Prisma.empty
  // Reaches through the allocations on the LATEST report only. That is the right
  // answer to "what is any vendor currently holding for Agribar" — but note it
  // drops never-reported mappings and anything allocated to that grower in the
  // past but not now. It is the one filter that stops this being a complete
  // list of mappings.
  const growerFilter = filters.growerId
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM [dbo].[VendorAllocation] a
        WHERE a.[vendorSubmissionDetailId] = cur.[detailId] AND a.[growerId] = ${filters.growerId}
      )`
    : Prisma.empty
  const qFilter = filters.q
    ? Prisma.sql`AND (i.[itemName] LIKE ${"%" + filters.q + "%"} OR iv.[itemId] LIKE ${"%" + filters.q + "%"} OR v.[vendorName] LIKE ${"%" + filters.q + "%"})`
    : Prisma.empty

  const prelude = Prisma.sql`
    WITH curr AS (
      SELECT
        s.[vendorId], d.[itemId], d.[id] AS [detailId], d.[quantity], s.[submissionDate],
        ROW_NUMBER() OVER (
          PARTITION BY s.[vendorId], d.[itemId]
          -- The id tiebreak is load-bearing: VendorSubmissionDetail has NO
          -- unique on (submissionId, itemId), unlike its grower counterpart, so
          -- two rows for one item in one report are representable. Without this
          -- the report would be non-deterministic when that happens.
          ORDER BY s.[submissionDate] DESC, d.[id] DESC
        ) AS rn
      FROM [dbo].[VendorSubmissionDetail] d
      INNER JOIN [dbo].[VendorSubmission] s ON s.[id] = d.[submissionId]
    ),
    base AS (
      SELECT
        iv.[vendorId], v.[vendorName], iv.[itemId], i.[itemName],
        c.[name] AS [commodityName], mc.[name] AS [categoryName],
        cur.[quantity] AS [reported],
        cur.[submissionDate] AS [asOf],
        -- Zero allocations on a REPORTED item is a real zero; on a never-reported
        -- item it must stay NULL, or "nothing earmarked" and "nothing to earmark"
        -- render as the same cell.
        CASE WHEN cur.[detailId] IS NULL THEN NULL ELSE ISNULL(al.[allocated], 0) END AS [allocated],
        CASE WHEN cur.[detailId] IS NULL THEN NULL ELSE ISNULL(al.[growersServed], 0) END AS [growersServed]
      FROM [dbo].[ItemVendor] iv
      INNER JOIN [dbo].[Vendor] v ON v.[id] = iv.[vendorId]
      INNER JOIN [dbo].[Item] i ON i.[id] = iv.[itemId]
      LEFT JOIN [dbo].[Commodity] c ON c.[code] = i.[commodityCode]
      LEFT JOIN [dbo].[MaterialCategory] mc ON mc.[code] = i.[materialCategoryCode]
      -- LEFT, so a mapping never reported against survives as NULL.
      LEFT JOIN (SELECT * FROM curr WHERE rn = 1) cur
        ON cur.[vendorId] = iv.[vendorId] AND cur.[itemId] = iv.[itemId]
      -- Correlated to the winning detail only, so it never aggregates history.
      OUTER APPLY (
        SELECT SUM(a.[quantity]) AS [allocated], COUNT(DISTINCT a.[growerId]) AS [growersServed]
        FROM [dbo].[VendorAllocation] a
        WHERE a.[vendorSubmissionDetailId] = cur.[detailId]
      ) al
      WHERE iv.[isActive] = 1
        AND i.[status] = ${ENTITY_STATUS.ACTIVE}
        AND v.[status] = ${ENTITY_STATUS.ACTIVE}
        ${vendorFilter}
        ${commodityFilter}
        ${categoryFilter}
        ${growerFilter}
        ${qFilter}
    )`

  const freshness = freshnessFilter(filters.freshness, freshBoundary, ageingBoundary)
  const alloc = allocFilter(filters.alloc)

  const [rows, counted] = await Promise.all([
    prisma.$queryRaw<RawRow[]>`
      ${prelude}
      SELECT * FROM base WHERE 1 = 1 ${freshness} ${alloc}
      ORDER BY [vendorName] ASC, [itemName] ASC, [itemId] ASC
      ${sqlPage(page)}
    `,
    prisma.$queryRaw<{ total: number }[]>`
      ${prelude}
      SELECT COUNT(*) AS [total] FROM base WHERE 1 = 1 ${freshness} ${alloc}
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
        commodityName: r.commodityName,
        categoryName: r.categoryName,
        reported,
        asOf: r.asOf,
        allocated,
        // Not clamped. The submit action already enforces allocations <= quantity,
        // so a negative here would be a data bug worth seeing rather than hiding.
        unallocated: reported == null || allocated == null ? null : reported - allocated,
        growersServed: r.growersServed == null ? null : Number(r.growersServed),
        state: staleness(r.asOf, today),
      }
    }),
    total: Number(counted[0]?.total ?? 0),
  }
}
