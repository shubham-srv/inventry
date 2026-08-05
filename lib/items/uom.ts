import "server-only"
import { prisma } from "@/lib/db"

// The unit a quantity is recorded in is a property of the ITEM, not of whoever
// types the number: growers and vendors see it, they don't choose it. Items
// created before `Item.unitOfMeasure` existed may not have one, so fall back to
// the unit on their threshold (grower-specific first, then the global one).

/** Resolve the unit for several items at once. Missing ids map to null. */
export async function resolveItemUnits(
  itemIds: string[],
  growerId?: number
): Promise<Map<string, string | null>> {
  const units = new Map<string, string | null>()
  if (itemIds.length === 0) return units

  const [items, thresholds] = await Promise.all([
    prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, unitOfMeasure: true },
    }),
    prisma.itemThreshold.findMany({
      where: {
        itemId: { in: itemIds },
        OR: growerId == null ? [{ growerId: null }] : [{ growerId }, { growerId: null }],
      },
      select: { itemId: true, growerId: true, unitOfMeasure: true },
    }),
  ])

  // Global thresholds first so a grower-specific one overwrites it.
  for (const t of thresholds.filter((t) => t.growerId === null))
    if (t.unitOfMeasure) units.set(t.itemId, t.unitOfMeasure)
  for (const t of thresholds.filter((t) => t.growerId !== null))
    if (t.unitOfMeasure) units.set(t.itemId, t.unitOfMeasure)
  for (const i of items) if (i.unitOfMeasure) units.set(i.id, i.unitOfMeasure)

  for (const id of itemIds) if (!units.has(id)) units.set(id, null)
  return units
}

/** Resolve the unit for a single item. */
export async function resolveItemUnit(
  itemId: string,
  growerId?: number
): Promise<string | null> {
  return (await resolveItemUnits([itemId], growerId)).get(itemId) ?? null
}
