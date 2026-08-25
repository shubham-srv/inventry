import "server-only"
import { startOfDay, subDays } from "date-fns"
import { prisma } from "@/lib/db"

const num = (d: unknown) => (d == null ? 0 : Number(d))

export type VendorAllocTarget = { growerId: number; growerName: string }
export type VendorSubmitRow = {
  itemId: string
  itemName: string
  commodityName: string | null
  /** The item's material category — also what its quantities are counted in. */
  categoryName: string | null
  previousQty: number | null
  /**
   * The per-grower split from the same past report `previousQty` came from, so
   * "load previous" can restore a breakdown instead of blanking it. Keyed by
   * growerId, and narrowed to growers still authorized for the item today —
   * lib/actions/vendor.ts rejects a report that allocates to anyone else.
   */
  previousAllocations: Record<number, number>
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
    // Bounded on purpose: this only needs each item's most recent reported
    // quantity, and without a lower bound it pulls the vendor's entire
    // submission history on every page load. Matches the 90-day window the
    // grower ledger prefill uses (lib/grower/data.ts) — a value older than that
    // is not a useful prefill anyway.
    prisma.vendorSubmissionDetail.findMany({
      where: {
        itemId: { in: itemIds },
        submission: {
          vendorId,
          submissionDate: { lt: todayStart, gte: subDays(todayStart, 90) },
        },
      },
      include: { allocations: true },
      // The `id` tie-break matters: there is no unique on (submissionId, itemId),
      // so date alone leaves duplicate details in arbitrary order. The admin
      // vendor-stock report already orders `submissionDate DESC, d.id DESC`
      // (lib/admin/vendor-stock.ts) — without this the prefill and that report
      // can disagree about which row is "latest".
      orderBy: [{ submission: { submissionDate: "desc" } }, { id: "desc" }],
    }),
  ])

  const growersByItem = new Map<string, VendorAllocTarget[]>()
  for (const a of auths) {
    const list = growersByItem.get(a.itemId) ?? []
    if (!list.some((g) => g.growerId === a.growerId))
      list.push({ growerId: a.growerId, growerName: a.grower.growerName })
    growersByItem.set(a.itemId, list)
  }

  // Quantity and allocations both come from the FIRST detail seen for an item —
  // i.e. the same past report — so the split can never exceed the quantity it
  // was a breakdown of.
  const prevByItem = new Map<string, number>()
  const prevAllocByItem = new Map<string, Record<number, number>>()
  for (const d of prevDetails) {
    if (prevByItem.has(d.itemId)) continue
    prevByItem.set(d.itemId, num(d.quantity))
    const alloc: Record<number, number> = {}
    for (const a of d.allocations) alloc[a.growerId] = num(a.quantity)
    prevAllocByItem.set(d.itemId, alloc)
  }

  const todayDetail = new Map(todaySub?.details.map((d) => [d.itemId, d]) ?? [])

  const rows: VendorSubmitRow[] = itemVendors.map((iv) => {
    const detail = todayDetail.get(iv.itemId)
    const todayAllocations: Record<number, number> = {}
    if (detail) for (const a of detail.allocations) todayAllocations[a.growerId] = num(a.quantity)
    const growers = (growersByItem.get(iv.itemId) ?? []).sort((a, b) =>
      a.growerName.localeCompare(b.growerName)
    )
    // Drop anything allocated to a grower who has since lost authorization for
    // this item: prefilling a box the server would reject fails the whole report.
    const prevAlloc = prevAllocByItem.get(iv.itemId) ?? {}
    const previousAllocations: Record<number, number> = {}
    for (const g of growers) {
      if (prevAlloc[g.growerId] != null) previousAllocations[g.growerId] = prevAlloc[g.growerId]
    }
    return {
      itemId: iv.itemId,
      itemName: iv.item.itemName,
      commodityName: iv.item.commodity?.name ?? null,
      categoryName: iv.item.materialCategory?.name ?? null,
      previousQty: prevByItem.has(iv.itemId) ? prevByItem.get(iv.itemId)! : null,
      previousAllocations,
      todayQty: detail ? num(detail.quantity) : null,
      growers,
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
        details: {
          include: {
            item: { include: { materialCategory: true } },
            allocations: { include: { grower: true } },
          },
        },
        _count: { select: { details: true } },
      },
      // `id` breaks the tie so paging is stable: submissionDate alone leaves
      // same-day submissions in arbitrary order, and a row can then repeat on
      // one page and vanish from the next.
      orderBy: [{ submissionDate: "desc" }, { id: "desc" }],
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
