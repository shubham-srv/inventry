import "server-only"
import { startOfDay, subDays } from "date-fns"
import { prisma } from "@/lib/db"

const num = (d: unknown) => (d == null ? 0 : Number(d))

export type VendorAllocTarget = { growerId: number; growerName: string }
export type VendorSubmitRow = {
  itemId: string
  itemName: string
  commodityName: string | null
  categoryName: string | null
  uom: string | null
  previousQty: number | null
  todayQty: number | null
  growers: VendorAllocTarget[]
  todayAllocations: Record<number, number>
}

export async function getVendorSubmitData(vendorId: number) {
  const itemVendors = await prisma.itemVendor.findMany({
    where: { vendorId, isActive: true, item: { status: "Active" } },
    include: { item: { include: { commodity: true, materialCategory: true } } },
    orderBy: { itemId: "asc" },
  })
  const itemIds = itemVendors.map((iv) => iv.itemId)
  const todayStart = startOfDay(new Date())

  const [auths, todaySub, prevDetails] = await Promise.all([
    prisma.growerItemAuthorization.findMany({
      where: { itemId: { in: itemIds }, isActive: true },
      include: { grower: true },
    }),
    prisma.vendorSubmission.findFirst({
      where: { vendorId, submissionDate: { gte: todayStart } },
      include: { details: { include: { allocations: true } } },
      orderBy: { submissionDate: "desc" },
    }),
    prisma.vendorSubmissionDetail.findMany({
      where: { submission: { vendorId, submissionDate: { lt: todayStart } } },
      include: { submission: true },
      orderBy: { submission: { submissionDate: "desc" } },
    }),
  ])

  const growersByItem = new Map<string, VendorAllocTarget[]>()
  for (const a of auths) {
    const list = growersByItem.get(a.itemId) ?? []
    if (!list.some((g) => g.growerId === a.growerId))
      list.push({ growerId: a.growerId, growerName: a.grower.growerName })
    growersByItem.set(a.itemId, list)
  }

  const prevByItem = new Map<string, number>()
  for (const d of prevDetails) if (!prevByItem.has(d.itemId)) prevByItem.set(d.itemId, num(d.quantity))

  const todayDetail = new Map(todaySub?.details.map((d) => [d.itemId, d]) ?? [])

  const rows: VendorSubmitRow[] = itemVendors.map((iv) => {
    const detail = todayDetail.get(iv.itemId)
    const todayAllocations: Record<number, number> = {}
    if (detail) for (const a of detail.allocations) todayAllocations[a.growerId] = num(a.quantity)
    return {
      itemId: iv.itemId,
      itemName: iv.item.itemName,
      commodityName: iv.item.commodity?.name ?? null,
      categoryName: iv.item.materialCategory?.name ?? null,
      // Fixed by the item — the vendor sees it, but cannot change it.
      uom: iv.item.unitOfMeasure ?? detail?.unitOfMeasure ?? null,
      previousQty: prevByItem.has(iv.itemId) ? prevByItem.get(iv.itemId)! : null,
      todayQty: detail ? num(detail.quantity) : null,
      growers: (growersByItem.get(iv.itemId) ?? []).sort((a, b) =>
        a.growerName.localeCompare(b.growerName)
      ),
      todayAllocations,
    }
  })

  const recorded = rows.filter((r) => r.todayQty != null).length
  return { rows, progress: { recorded, total: rows.length } }
}

/** Paged report history. See getGrowerHistory — same silent-truncation fix. */
export async function getVendorHistory(vendorId: number, skip = 0, take = 10) {
  const where = { vendorId }
  const [submissions, total] = await Promise.all([
    prisma.vendorSubmission.findMany({
      where,
      include: {
        submitter: true,
        details: { include: { item: true, allocations: { include: { grower: true } } } },
        _count: { select: { details: true } },
      },
      orderBy: { submissionDate: "desc" },
      skip,
      take,
    }),
    prisma.vendorSubmission.count({ where }),
  ])
  return { submissions, total }
}

export async function getVendorDashboard(vendorId: number) {
  const todayStart = startOfDay(new Date())
  const weekAgo = subDays(todayStart, 7)

  const [itemCount, weekSubs, lastSub, recentDetails] = await Promise.all([
    prisma.itemVendor.count({ where: { vendorId, isActive: true } }),
    prisma.vendorSubmission.count({ where: { vendorId, submissionDate: { gte: weekAgo } } }),
    prisma.vendorSubmission.findFirst({ where: { vendorId }, orderBy: { submissionDate: "desc" } }),
    prisma.vendorSubmissionDetail.findMany({
      where: { submission: { vendorId, submissionDate: { gte: subDays(todayStart, 21) } } },
      include: { item: true, submission: true, allocations: { include: { grower: true } } },
      orderBy: { submission: { submissionDate: "desc" } },
    }),
  ])

  // latest detail per item + growers served
  const latest = new Map<string, { qty: number; name: string }>()
  const growers = new Set<number>()
  for (const d of recentDetails) {
    if (!latest.has(d.itemId)) latest.set(d.itemId, { qty: num(d.quantity), name: d.item.itemName })
    for (const a of d.allocations) growers.add(a.growerId)
  }
  const totalLatestQty = [...latest.values()].reduce((s, v) => s + v.qty, 0)
  const topItems = [...latest.entries()]
    .map(([itemId, v]) => ({ itemId, name: v.name, qty: v.qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 6)

  return {
    itemCount,
    weekSubmissionCount: weekSubs,
    submittedThisWeek: weekSubs > 0,
    lastSubmissionDate: lastSub?.submissionDate ?? null,
    growersServed: growers.size,
    totalLatestQty,
    topItems,
  }
}
