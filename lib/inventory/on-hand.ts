import "server-only"
import { Prisma } from "@prisma/client"

/** Anything that can run a raw query: the client or an interactive transaction. */
type Db = Pick<Prisma.TransactionClient, "$queryRaw">

export type LocationCount = {
  locationId: number
  locationName: string
  quantity: number
  /** Ledger day of that location's latest count. */
  date: Date
}

export type OnHand = {
  /** Latest count per location, summed. */
  total: number
  /** The most recent of those counts. */
  asOf: Date
  byLocation: LocationCount[]
}

/** Map key for a grower × item pair. */
export const onHandKey = (growerId: number, itemId: string) => `${growerId}:${itemId}`

/**
 * Current on-hand per grower × item: the latest ledger row per location,
 * summed — the same maths as the grower-stock and low-inventory reports, so a
 * number never disagrees between screens. Pairs never counted are absent.
 *
 * `itemIds` narrows the scan; past ~1000 it is dropped (SQL Server caps a
 * statement at 2100 parameters) and the caller's own list does the narrowing.
 */
export async function currentOnHand(
  db: Db,
  opts: { growerIds: number[]; itemIds?: string[] }
): Promise<Map<string, OnHand>> {
  const out = new Map<string, OnHand>()
  if (opts.growerIds.length === 0) return out
  const items = opts.itemIds && opts.itemIds.length > 0 && opts.itemIds.length <= 1000 ? opts.itemIds : null
  if (opts.itemIds && opts.itemIds.length === 0) return out

  const rows = await db.$queryRaw<
    { growerId: number; itemId: string; locationId: number; locationName: string; finalQuantity: Prisma.Decimal; date: Date }[]
  >`
    WITH latest AS (
      SELECT l.[growerId], l.[itemId], l.[locationId], l.[finalQuantity], l.[date],
        ROW_NUMBER() OVER (
          PARTITION BY l.[growerId], l.[itemId], l.[locationId]
          ORDER BY l.[date] DESC, l.[id] DESC
        ) AS rn
      FROM [dbo].[InventoryLedger] l
      WHERE l.[growerId] IN (${Prisma.join(opts.growerIds)})
        ${items ? Prisma.sql`AND l.[itemId] IN (${Prisma.join(items)})` : Prisma.empty}
    )
    SELECT lt.[growerId], lt.[itemId], lt.[locationId], loc.[locationName], lt.[finalQuantity], lt.[date]
    FROM latest lt
    INNER JOIN [dbo].[Location] loc ON loc.[id] = lt.[locationId]
    WHERE lt.rn = 1
    ORDER BY loc.[locationName] ASC
  `

  for (const r of rows) {
    const key = onHandKey(r.growerId, r.itemId)
    const quantity = Number(r.finalQuantity)
    const entry = out.get(key) ?? { total: 0, asOf: r.date, byLocation: [] }
    entry.total += quantity
    if (r.date > entry.asOf) entry.asOf = r.date
    entry.byLocation.push({ locationId: r.locationId, locationName: r.locationName, quantity, date: r.date })
    out.set(key, entry)
  }
  return out
}
