import "server-only"
import { type Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { currentOnHand, onHandKey } from "@/lib/inventory/on-hand"

/** How a flag ended up — or that it hasn't. */
export type FlagOutcome = "Open" | "ClearedByGrower" | "Reviewed"

export const FLAG_OUTCOME_FILTERS = ["open", "grower", "reviewed"] as const

export type FlagHistoryRow = {
  id: number
  growerId: number
  growerName: string
  itemId: string
  itemName: string
  /** The item's material category — what quantities are counted in. */
  categoryName: string | null
  reason: string | null
  raisedAt: Date
  raisedBy: string | null
  /** Grower's on-hand total when raised; null for flags older than the snapshot. */
  onHandAtFlag: number | null
  /** On-hand total now (latest count per location), for comparison. */
  onHandNow: number | null
  outcome: FlagOutcome
  clearedAt: Date | null
  clearedBy: string | null
  reviewNotes: string | null
}

/**
 * Every low-inventory flag — open and cleared — newest first. One query shape
 * for the grower's "Flag history" page (scoped to their grower) and the admin
 * history tab (all growers), so the two always tell the same story.
 */
export async function getFlagHistory(
  filters: { growerId?: number; outcome?: string; q?: string },
  page: { skip: number; take: number }
): Promise<{ rows: FlagHistoryRow[]; total: number }> {
  const and: Prisma.LowInventoryFlagWhereInput[] = []
  if (filters.growerId) and.push({ growerId: filters.growerId })
  if (filters.q)
    and.push({ OR: [{ itemId: { contains: filters.q } }, { item: { itemName: { contains: filters.q } } }] })
  if (filters.outcome === "open") and.push({ isActive: true })
  else if (filters.outcome === "grower") and.push({ isActive: false, reviewedAt: null })
  else if (filters.outcome === "reviewed") and.push({ isActive: false, reviewedAt: { not: null } })
  const where: Prisma.LowInventoryFlagWhereInput = and.length ? { AND: and } : {}

  const [flags, total] = await Promise.all([
    prisma.lowInventoryFlag.findMany({
      where,
      include: {
        grower: { select: { growerName: true } },
        item: { select: { itemName: true, materialCategory: { select: { name: true } } } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: page.skip,
      take: page.take,
    }),
    prisma.lowInventoryFlag.count({ where }),
  ])

  // flaggedBy / clearedBy are plain audit columns — resolve names in one query.
  const userIds = [...new Set(flags.flatMap((f) => [f.flaggedBy, f.clearedBy ?? f.reviewedBy]).filter((v): v is number => v != null))]
  const [users, onHand] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
      : [],
    currentOnHand(prisma, {
      growerIds: [...new Set(flags.map((f) => f.growerId))],
      itemIds: [...new Set(flags.map((f) => f.itemId))],
    }),
  ])
  const name = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]))

  return {
    total,
    rows: flags.map((f) => {
      const clearedBy = f.clearedBy ?? f.reviewedBy
      return {
        id: f.id,
        growerId: f.growerId,
        growerName: f.grower.growerName,
        itemId: f.itemId,
        itemName: f.item.itemName,
        categoryName: f.item.materialCategory?.name ?? null,
        reason: f.reason,
        raisedAt: f.createdAt,
        raisedBy: name.get(f.flaggedBy) ?? null,
        onHandAtFlag: f.onHandAtFlag == null ? null : Number(f.onHandAtFlag),
        onHandNow: onHand.get(onHandKey(f.growerId, f.itemId))?.total ?? null,
        outcome: f.isActive ? "Open" : f.reviewedAt ? "Reviewed" : "ClearedByGrower",
        // Flags cleared before history was recorded fall back to their last update.
        clearedAt: f.isActive ? null : (f.clearedAt ?? f.reviewedAt ?? f.updatedAt),
        clearedBy: f.isActive || clearedBy == null ? null : (name.get(clearedBy) ?? null),
        reviewNotes: f.reviewNotes,
      }
    }),
  }
}
