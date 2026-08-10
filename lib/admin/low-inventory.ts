import "server-only"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"

export type CurrentlyLowRow = {
  growerId: number
  growerName: string
  itemId: string
  itemName: string
  unitOfMeasure: string | null
  onHand: number
  threshold: number
  thresholdScope: "Grower" | "Global"
  asOf: Date
  flagged: boolean // a grower-raised flag is already open for this pair
}

/**
 * Items currently below their effective threshold, across all growers.
 *
 * Computed live rather than stored — this is a report, not a queue, and there is
 * no state to keep. Two things make it non-trivial enough to be raw SQL:
 *
 *  1. "Current" on-hand is the LATEST ledger row per (grower, item, location),
 *     summed across locations. A plain "latest row per item" would silently
 *     report only whichever location was written last.
 *  2. The threshold is the grower-specific one when it exists, otherwise the
 *     global one — resolved per row by OUTER APPLY.
 *
 * Doing this in Prisma would mean pulling the whole ledger into memory, which
 * stops being viable the moment there is real history.
 */
export async function getCurrentlyLow(filters: {
  growerId?: number
  q?: string
}): Promise<CurrentlyLowRow[]> {
  const growerFilter = filters.growerId
    ? Prisma.sql`AND oh.[growerId] = ${filters.growerId}`
    : Prisma.empty
  const qFilter = filters.q
    ? Prisma.sql`AND (i.[itemName] LIKE ${"%" + filters.q + "%"} OR oh.[itemId] LIKE ${"%" + filters.q + "%"})`
    : Prisma.empty

  const rows = await prisma.$queryRaw<
    {
      growerId: number
      growerName: string
      itemId: string
      itemName: string
      unitOfMeasure: string | null
      onHand: Prisma.Decimal
      threshold: Prisma.Decimal
      thresholdGrowerId: number | null
      asOf: Date
      flagged: number
    }[]
  >`
    WITH latest AS (
      SELECT
        l.[growerId], l.[itemId], l.[locationId], l.[finalQuantity], l.[date],
        ROW_NUMBER() OVER (
          PARTITION BY l.[growerId], l.[itemId], l.[locationId]
          ORDER BY l.[date] DESC, l.[id] DESC
        ) AS rn
      FROM [dbo].[InventoryLedger] l
    ),
    onhand AS (
      SELECT [growerId], [itemId], SUM([finalQuantity]) AS [onHand], MAX([date]) AS [asOf]
      FROM latest
      WHERE rn = 1
      GROUP BY [growerId], [itemId]
    )
    SELECT
      oh.[growerId],
      g.[growerName],
      oh.[itemId],
      i.[itemName],
      i.[unitOfMeasure],
      oh.[onHand],
      th.[thresholdQuantity] AS [threshold],
      th.[growerId] AS [thresholdGrowerId],
      oh.[asOf],
      CASE WHEN EXISTS (
        SELECT 1 FROM [dbo].[LowInventoryFlag] f
        WHERE f.[growerId] = oh.[growerId] AND f.[itemId] = oh.[itemId] AND f.[isActive] = 1
      ) THEN 1 ELSE 0 END AS [flagged]
    FROM onhand oh
    INNER JOIN [dbo].[Item] i ON i.[id] = oh.[itemId]
    INNER JOIN [dbo].[Grower] g ON g.[id] = oh.[growerId]
    -- Grower-specific threshold wins over the global one.
    OUTER APPLY (
      SELECT TOP 1 t.[thresholdQuantity], t.[growerId]
      FROM [dbo].[ItemThreshold] t
      WHERE t.[itemId] = oh.[itemId]
        AND (t.[growerId] = oh.[growerId] OR t.[growerId] IS NULL)
      ORDER BY CASE WHEN t.[growerId] IS NULL THEN 1 ELSE 0 END
    ) th
    -- Only items that still have an active authorization for this grower.
    WHERE EXISTS (
        SELECT 1 FROM [dbo].[GrowerItemAuthorization] a
        WHERE a.[growerId] = oh.[growerId] AND a.[itemId] = oh.[itemId] AND a.[isActive] = 1
      )
      AND i.[status] = 'Active'
      AND th.[thresholdQuantity] IS NOT NULL
      AND oh.[onHand] < th.[thresholdQuantity]
      ${growerFilter}
      ${qFilter}
    ORDER BY (oh.[onHand] / NULLIF(th.[thresholdQuantity], 0)) ASC, g.[growerName] ASC
  `

  return rows.map((r) => ({
    growerId: r.growerId,
    growerName: r.growerName,
    itemId: r.itemId,
    itemName: r.itemName,
    unitOfMeasure: r.unitOfMeasure,
    onHand: Number(r.onHand),
    threshold: Number(r.threshold),
    thresholdScope: r.thresholdGrowerId == null ? "Global" : "Grower",
    asOf: r.asOf,
    flagged: Number(r.flagged) === 1,
  }))
}
