import "server-only"
import { prisma } from "@/lib/db"
import { ORDER_STATUS } from "@/lib/constants"
import { ACTIVE_ITEM } from "@/lib/items/active"
import { currentOnHand, onHandKey, type LocationCount } from "@/lib/inventory/on-hand"
import { loadItemTranslations, localizedItemText } from "@/lib/items/translations"

export type GrowerItemRow = {
  itemId: string
  itemName: string
  legacyId: string | null
  hasImage: boolean
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
            ? { OR: [{ id: { contains: q } }, { itemName: { contains: q } }, { legacyFamousId: { contains: q } }] }
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
  const translations = await loadItemTranslations(
    auths.map((a) => a.itemId),
    locale
  )
  const onOrder = new Map(openOrders.map((o) => [o.itemId, Number(o._sum.quantity ?? 0)]))

  return {
    locations: sites.map((s) => ({ id: s.location.id, name: s.location.locationName })),
    rows: auths.map((a): GrowerItemRow => {
      const held = onHand.get(onHandKey(growerId, a.itemId))
      return {
        itemId: a.itemId,
        itemName: a.item.itemName,
        legacyId: a.item.legacyFamousId,
        hasImage: Boolean(a.item.imageKey),
        commodityName: a.item.commodity?.name ?? null,
        categoryName: a.item.materialCategory?.name ?? null,
        notes: localizedItemText(translations, a.itemId, "notes", a.item.notes),
        byLocation: new Map((held?.byLocation ?? []).map((l) => [l.locationId, l])),
        onHand: held?.total ?? null,
        asOf: held?.asOf ?? null,
        onOrder: onOrder.get(a.itemId) ?? 0,
      }
    }),
  }
}
