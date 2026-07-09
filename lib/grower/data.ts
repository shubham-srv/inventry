import "server-only"
import { startOfDay, subDays } from "date-fns"
import { prisma } from "@/lib/db"
import { REQUEST_STATUS, SUBMISSION_STATUS, ORDER_STATUS } from "@/lib/constants"

const num = (d: unknown) => (d == null ? 0 : Number(d))

/** Effective threshold per item: grower-specific override wins over global (growerId null). */
async function effectiveThresholds(growerId: number, itemIds: string[]) {
  const rows = await prisma.itemThreshold.findMany({
    where: { itemId: { in: itemIds }, OR: [{ growerId }, { growerId: null }] },
  })
  const map = new Map<string, { qty: number; uom: string | null }>()
  // apply globals first, then override with grower-specific
  for (const r of rows.filter((r) => r.growerId === null))
    map.set(r.itemId, { qty: num(r.thresholdQuantity), uom: r.unitOfMeasure })
  for (const r of rows.filter((r) => r.growerId === growerId))
    map.set(r.itemId, { qty: num(r.thresholdQuantity), uom: r.unitOfMeasure })
  return map
}

export type OrderView = {
  id: number
  vendorName: string
  quantity: number
  uom: string | null
  status: string // Open, Received, Cancelled
  orderDate: string // ISO
  expectedDeliveryDate: string | null // ISO; grower-editable
  closedAt: string | null // ISO; set when Received/Cancelled
}

export type SubmitRow = {
  itemId: string
  itemName: string
  commodityName: string | null
  categoryName: string | null
  uom: string | null
  previousQty: number | null
  thresholdQty: number | null
  belowThreshold: boolean
  todayQty: number | null
  recordedToday: boolean // a detail row exists today (draft or submitted)
  submittedToday: boolean // detail exists AND today's submission is Approved
  lowFlagged: boolean
  orders: OrderView[] // open orders + anything closed today
  vendorOptions: { id: number; name: string }[] // vendors this item can be ordered from
}

export async function getGrowerSubmitData(growerId: number) {
  const auths = await prisma.growerItemAuthorization.findMany({
    where: { growerId, isActive: true, item: { status: "Active" } },
    include: { item: { include: { commodity: true, materialCategory: true } } },
    orderBy: { itemId: "asc" },
  })
  const itemIds = auths.map((a) => a.itemId)
  const todayStart = startOfDay(new Date())

  const [todaySub, prevLedger, thresholds, lowFlags, orders, itemVendors, activeVendors] =
    await Promise.all([
      prisma.growerSubmission.findFirst({
        where: { growerId, submissionDate: { gte: todayStart } },
        include: { details: true },
        orderBy: { submissionDate: "desc" },
      }),
      prisma.inventoryLedger.findMany({
        where: { growerId, itemId: { in: itemIds }, date: { lt: todayStart } },
        orderBy: { date: "desc" },
      }),
      effectiveThresholds(growerId, itemIds),
      prisma.lowInventoryFlag.findMany({ where: { growerId, isActive: true, itemId: { in: itemIds } } }),
      // Active order list: still Open, or closed today (visible through end of day).
      prisma.order.findMany({
        where: {
          growerId,
          itemId: { in: itemIds },
          OR: [{ status: ORDER_STATUS.OPEN }, { closedAt: { gte: todayStart } }],
        },
        include: { vendor: true },
        orderBy: { orderDate: "desc" },
      }),
      prisma.itemVendor.findMany({
        where: { itemId: { in: itemIds }, isActive: true, vendor: { status: "Active" } },
        include: { vendor: true },
        orderBy: { vendor: { vendorName: "asc" } },
      }),
      prisma.vendor.findMany({
        where: { status: "Active" },
        select: { id: true, vendorName: true },
        orderBy: { vendorName: "asc" },
      }),
    ])

  const prevByItem = new Map<string, number>()
  for (const l of prevLedger) if (!prevByItem.has(l.itemId)) prevByItem.set(l.itemId, num(l.finalQuantity))

  const todayDetail = new Map(todaySub?.details.map((d) => [d.itemId, d]) ?? [])
  const lowSet = new Set(lowFlags.map((f) => f.itemId))
  const todayStatus = todaySub?.status ?? null
  const isSubmittedToday = todayStatus === SUBMISSION_STATUS.APPROVED

  // Orders grouped by item (Open first, then most recent), and the per-item
  // vendor choices — mapped vendors, falling back to all active vendors.
  const ordersByItem = new Map<string, OrderView[]>()
  for (const o of orders) {
    const list = ordersByItem.get(o.itemId) ?? []
    list.push({
      id: o.id,
      vendorName: o.vendor.vendorName,
      quantity: num(o.quantity),
      uom: o.unitOfMeasure,
      status: o.status,
      orderDate: o.orderDate.toISOString(),
      expectedDeliveryDate: o.expectedDeliveryDate ? o.expectedDeliveryDate.toISOString() : null,
      closedAt: o.closedAt ? o.closedAt.toISOString() : null,
    })
    ordersByItem.set(o.itemId, list)
  }
  for (const list of ordersByItem.values())
    list.sort((a, b) => Number(a.status !== ORDER_STATUS.OPEN) - Number(b.status !== ORDER_STATUS.OPEN))

  const vendorsByItem = new Map<string, { id: number; name: string }[]>()
  for (const iv of itemVendors) {
    const list = vendorsByItem.get(iv.itemId) ?? []
    list.push({ id: iv.vendorId, name: iv.vendor.vendorName })
    vendorsByItem.set(iv.itemId, list)
  }
  const allVendorOptions = activeVendors.map((v) => ({ id: v.id, name: v.vendorName }))

  const rows: SubmitRow[] = auths.map((a) => {
    const t = thresholds.get(a.itemId)
    const prev = prevByItem.has(a.itemId) ? prevByItem.get(a.itemId)! : null
    const detail = todayDetail.get(a.itemId)
    const uom = detail?.unitOfMeasure ?? t?.uom ?? null
    return {
      itemId: a.itemId,
      itemName: a.item.itemName,
      commodityName: a.item.commodity?.name ?? null,
      categoryName: a.item.materialCategory?.name ?? null,
      uom,
      previousQty: prev,
      thresholdQty: t?.qty ?? null,
      belowThreshold: t != null && prev != null && prev < t.qty,
      todayQty: detail ? num(detail.quantityOnHand) : null,
      recordedToday: !!detail,
      submittedToday: !!detail && isSubmittedToday,
      lowFlagged: lowSet.has(a.itemId),
      orders: ordersByItem.get(a.itemId) ?? [],
      vendorOptions: vendorsByItem.get(a.itemId) ?? allVendorOptions,
    }
  })

  // Progress counts only SUBMITTED items — drafts don't move the bar.
  const submitted = rows.filter((r) => r.submittedToday).length
  return {
    rows,
    todayStatus,
    progress: { recorded: submitted, total: rows.length },
    submissionId: todaySub?.id ?? null,
  }
}

export async function getGrowerHistory(growerId: number, take = 30) {
  return prisma.growerSubmission.findMany({
    where: { growerId },
    include: {
      submitter: true,
      details: { include: { item: true } },
      _count: { select: { details: true } },
    },
    orderBy: { submissionDate: "desc" },
    take,
  })
}

export async function getGrowerDashboard(growerId: number) {
  const todayStart = startOfDay(new Date())
  const weekAgo = subDays(todayStart, 7)

  const [authCount, lowFlags, openRequests, lastSub, weekSubs, recentLedger] =
    await Promise.all([
      prisma.growerItemAuthorization.count({ where: { growerId, isActive: true } }),
      prisma.lowInventoryFlag.count({ where: { growerId, isActive: true } }),
      prisma.missingItemRequest.count({ where: { growerId, status: REQUEST_STATUS.OPEN } }),
      // Drafts are not real submissions — only Approved counts.
      prisma.growerSubmission.findFirst({
        where: { growerId, status: SUBMISSION_STATUS.APPROVED },
        orderBy: { submissionDate: "desc" },
      }),
      prisma.growerSubmission.count({
        where: { growerId, status: SUBMISSION_STATUS.APPROVED, submissionDate: { gte: weekAgo } },
      }),
      prisma.inventoryLedger.findMany({
        where: { growerId, date: { gte: subDays(todayStart, 21) } },
        orderBy: { date: "desc" },
        include: { item: true },
      }),
    ])

  // latest vs ~week-ago value per item → deltas
  const latest = new Map<string, { qty: number; name: string }>()
  const weekAgoVal = new Map<string, number>()
  for (const l of recentLedger) {
    if (!latest.has(l.itemId)) latest.set(l.itemId, { qty: num(l.finalQuantity), name: l.item.itemName })
    if (l.date <= weekAgo && !weekAgoVal.has(l.itemId)) weekAgoVal.set(l.itemId, num(l.finalQuantity))
  }
  const deltas = [...latest.entries()].map(([itemId, cur]) => {
    const prev = weekAgoVal.get(itemId)
    return { itemId, name: cur.name, current: cur.qty, previous: prev ?? null, delta: prev == null ? null : cur.qty - prev }
  })
  const noChange = deltas.filter((d) => d.delta === 0).length

  return {
    authCount,
    lowFlags,
    openRequests,
    lastSubmissionDate: lastSub?.submissionDate ?? null,
    submittedThisWeek: weekSubs > 0,
    weekSubmissionCount: weekSubs,
    deltas,
    noChange,
  }
}
