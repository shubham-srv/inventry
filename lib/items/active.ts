import { Prisma } from "@prisma/client"
import { ENTITY_STATUS } from "@/lib/constants"

/**
 * An item is live only while it AND its commodity are active.
 *
 * Disabling a commodity never rewrites Item.status — this is the one place
 * that combines the two, so re-enabling the commodity restores each item
 * exactly as it was. Use it wherever "active items" are read: grower and
 * vendor screens, pickers, reports, and the server actions behind them.
 *
 * Written as NOT(commodity inactive) rather than commodity.isActive = true so
 * an item with no commodity at all is not silently dropped.
 */
export const ACTIVE_ITEM: Prisma.ItemWhereInput = {
  status: ENTITY_STATUS.ACTIVE,
  NOT: { commodity: { is: { isActive: false } } },
}

/** Raw-SQL twin of ACTIVE_ITEM, for a query that aliases Item as `alias`. */
export function activeItemSql(alias = "i"): Prisma.Sql {
  const a = Prisma.raw(alias)
  return Prisma.sql`${a}.[status] = ${ENTITY_STATUS.ACTIVE} AND NOT EXISTS (
    SELECT 1 FROM [dbo].[Commodity] xc WHERE xc.[code] = ${a}.[commodityCode] AND xc.[isActive] = 0
  )`
}
