import "server-only"
import { prisma } from "@/lib/db"
import { ORDER_STATUS } from "@/lib/constants"
import { ACTIVE_ITEM } from "@/lib/items/active"
import { imageVersion } from "@/lib/items/image"
import { currentOnHand, onHandKey, type LocationCount } from "@/lib/inventory/on-hand"
import { loadNameLocalizer } from "@/lib/i18n/names"

export type GrowerItemRow = {
  itemId: string
  /** In the grower's language where translated (as are the names below). */
  itemName: string
  legacyId: string | null
  imageVersion: string | null
  commodityName: string | null
  /** The item's material category — what its quantities are counted in. */
  categoryName: string | null
  /** In the grower's language where translated. */
  notes: string | null
  byLocation: Map<number, LocationCount>
  /** Latest count per location, summed; null = never counted. */
  onHand: number | null
  asOf: Date | null
  /** Open orders, summed across vendors. */
  onOrder: number
}

/**
 * Every item a grower is authorized for, with what they currently hold at each
 * of their locations and what is on order — the grower's "My items" page and
 * its Excel export. Same on-hand maths as the admin reports.
 */
export async function getGrowerItems(growerId: number, locale: string, q?: string) {
  const [auths, sites, onHand, openOrders] = await Promise.all([
    prisma.growerItemAuthorization.findMany({
      where: {
        growerId,
        isActive: true,
        item: {
          ...ACTIVE_ITEM,
          ...(q
            ? {
                OR: [
                  { id: { contains: q } },
                  { itemName: { contains: q } },
                  { legacyFamousId: { contains: q } },
                  { translations: { some: { field: "itemName", locale, text: { contains: q } } } },
                ],
              }
            : {}),
        },
      },
      include: { item: { include: { commodity: true, materialCategory: true } } },
      orderBy: { itemId: "asc" },
    }),
    prisma.growerLocation.findMany({
      where: { growerId, isActive: true },
      include: { location: { select: { id: true, locationName: true } } },
      orderBy: { location: { locationName: "asc" } },
    }),
    currentOnHand(prisma, { growerIds: [growerId] }),
    prisma.order.groupBy({
      by: ["itemId"],
      where: { growerId, status: ORDER_STATUS.OPEN },
      _sum: { quantity: true },
    }),
  ])
  const names = await loadNameLocalizer(
    locale,
    auths.map((a) => a.itemId)
  )
  const onOrder = new Map(openOrders.map((o) => [o.itemId, Number(o._sum.quantity ?? 0)]))

  return {
    locations: sites.map((s) => ({ id: s.location.id, name: s.location.locationName })),
    rows: auths.map((a): GrowerItemRow => {
      const held = onHand.get(onHandKey(growerId, a.itemId))
      return {
        itemId: a.itemId,
        itemName: names.item(a.itemId, a.item.itemName),
        legacyId: a.item.legacyFamousId,
        imageVersion: imageVersion(a.item.imageKey),
        commodityName: names.commodity(a.item.commodityCode, a.item.commodity?.name),
        categoryName: names.category(a.item.materialCategoryCode, a.item.materialCategory?.name),
        notes: names.notes(a.itemId, a.item.notes),
        byLocation: new Map((held?.byLocation ?? []).map((l) => [l.locationId, l])),
        onHand: held?.total ?? null,
        asOf: held?.asOf ?? null,
        onOrder: onOrder.get(a.itemId) ?? 0,
      }
    }),
  }
}
