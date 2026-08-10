import "server-only"
import { startOfDay, subDays, endOfDay } from "date-fns"
import { prisma } from "@/lib/db"
import { getLocale } from "@/lib/i18n/server"
import { REQUEST_STATUS, SUBMISSION_STATUS, ORDER_STATUS } from "@/lib/constants"

const num = (d: unknown) => (d == null ? 0 : Number(d))

type Ledgerish = {
  itemId: string
  locationId: number | null
  date: Date
  finalQuantity: unknown
}

/**
 * Latest quantity per item, summed across locations.
 *
 * Summing matters: a grower's on-hand for an item is the total over its
 * locations, and taking only the single most recent row would report whichever
 * location happened to be written last. The admin "currently low" query sums the
 * same way (lib/admin/low-inventory.ts), so the two views agree.
 *
 * `ledger` must be sorted date-descending. With `cutoff`, rows after it are
 * ignored — which is how the week-ago value is derived from the same fetch.
 */
function latestPerItem(ledger: Ledgerish[], cutoff?: Date): Map<string, number> {
  const seen = new Set<string>()
  const out = new Map<string, number>()
  for (const l of ledger) {
    if (cutoff && l.date > cutoff) continue
    const key = `${l.itemId}:${l.locationId ?? "none"}`
    if (seen.has(key)) continue
    seen.add(key)
    out.set(l.itemId, (out.get(l.itemId) ?? 0) + num(l.finalQuantity))
  }
  return out
}

/**
 * Cutoff for "a week ago": the END of the day seven days back.
 *
 * Deliberately end-of-day. Ledger rows are stamped at noon, so comparing against
 * midnight would exclude the count taken exactly seven days ago and silently
 * reach back to day eight instead.
 */
function weekAgoCutoff(todayStart: Date): Date {
  return endOfDay(subDays(todayStart, 7))
}

/**
 * On-hand a week ago, per item, summed across locations.
 *
 * Skips each item's most recent observation date before applying the cutoff.
 * Without that, a grower who counts weekly compares their latest count against
 * itself — the cutoff lands on the very same row — and every item reports "no
 * change". Growers who count daily are unaffected: their newest row is already
 * well after the cutoff.
 */
function weekAgoPerItem(ledger: Ledgerish[], todayStart: Date): Map<string, number> {
  const newest = new Map<string, number>()
  for (const l of ledger) {
    const t = l.date.getTime()
    if (!newest.has(l.itemId) || t > newest.get(l.itemId)!) newest.set(l.itemId, t)
  }
  return latestPerItem(
    ledger.filter((l) => l.date.getTime() !== newest.get(l.itemId)),
    weekAgoCutoff(todayStart)
  )
}

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
  /** What the pack maths says will arrive; >= quantity when it rounded up. */
  expectedQuantity: number | null
  /** What actually arrived, once the grower confirms receipt. */
  receivedQuantity: number | null
  /** "350 Bags · 35 Boxes · 7 Cases" — snapshot taken when the order was raised. */
  packSummary: string | null
}

export type ItemMessageView = {
  id: number
  type: string // translatable key (see itemMessage.type.* in the dictionaries)
  severity: string // info, warning, critical
  body: string | null // optional free-text note, shown as-authored
}

export type SubmitRow = {
  itemId: string
  itemName: string
  commodityName: string | null
  categoryName: string | null
  uom: string | null
  previousQty: number | null
  /** On-hand a week ago, and the change since — null when there's no history yet. */
  weekAgoQty: number | null
  weekDelta: number | null
  thresholdQty: number | null
  belowThreshold: boolean
  todayQty: number | null
  recordedToday: boolean // a detail row exists today (draft or submitted)
  submittedToday: boolean // detail exists AND today's submission is Approved
  lowFlagged: boolean
  orders: OrderView[] // open orders + anything closed today
  vendorOptions: { id: number; name: string }[] // vendors this item can be ordered from
  messages: ItemMessageView[] // admin notices shown under this item
}

export async function getGrowerSubmitData(growerId: number) {
  // Item message notes are stored per locale (ItemMessageTranslation) and picked
  // here, so a Spanish-preference grower doesn't get a localized type label
  // followed by an English note.
  const locale = await getLocale()
  const auths = await prisma.growerItemAuthorization.findMany({
    where: { growerId, isActive: true, item: { status: "Active" } },
    include: { item: { include: { commodity: true, materialCategory: true } } },
    orderBy: { itemId: "asc" },
  })
  const itemIds = auths.map((a) => a.itemId)
  const todayStart = startOfDay(new Date())

  const [todaySub, prevLedger, thresholds, lowFlags, orders, itemVendors, activeVendors, itemMessages] =
    await Promise.all([
      prisma.growerSubmission.findFirst({
        where: { growerId, submissionDate: { gte: todayStart } },
        include: { details: true },
        orderBy: { submissionDate: "desc" },
      }),
      // Bounded on purpose: this only needs each item's most recent value, and
      // without a lower bound it pulls the grower's entire ledger history on
      // every page load — fine at a fortnight, not at a year. A count older than
      // the window is not a useful prefill anyway.
      prisma.inventoryLedger.findMany({
        where: {
          growerId,
          itemId: { in: itemIds },
          date: { lt: todayStart, gte: subDays(todayStart, 90) },
        },
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
        include: { vendor: true, packLines: { orderBy: { level: "asc" } } },
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
      // Active item messages for this grower: all-growers or specifically
      // targeted, within their optional start/end window.
      prisma.itemMessage.findMany({
        where: {
          itemId: { in: itemIds },
          isActive: true,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] },
          ],
          OR: [{ audience: "All" }, { targets: { some: { growerId } } }],
        },
        include: { translations: { select: { locale: true, body: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ])

  const prevByItem = latestPerItem(prevLedger)
  // Value as of a week ago, for the +/- change badge on each row.
  const weekAgoByItem = weekAgoPerItem(prevLedger, todayStart)

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
      expectedQuantity: o.expectedQuantity == null ? null : num(o.expectedQuantity),
      receivedQuantity: o.receivedQuantity == null ? null : num(o.receivedQuantity),
      // Only worth showing once there is packaging beyond the base unit.
      packSummary:
        o.packLines.length > 1
          ? o.packLines.map((l) => `${num(l.quantity)} ${l.unitName}`).join(" · ")
          : null,
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

  const messagesByItem = new Map<string, ItemMessageView[]>()
  for (const m of itemMessages) {
    const list = messagesByItem.get(m.itemId) ?? []
    // Localized note where one exists, otherwise the note as authored — never
    // blank, so a missing translation degrades to English rather than silence.
    const localized = m.translations.find((tr) => tr.locale === locale)?.body
    list.push({ id: m.id, type: m.type, severity: m.severity, body: localized ?? m.body })
    messagesByItem.set(m.itemId, list)
  }

  const rows: SubmitRow[] = auths.map((a) => {
    const t = thresholds.get(a.itemId)
    const prev = prevByItem.has(a.itemId) ? prevByItem.get(a.itemId)! : null
    const weekAgo = weekAgoByItem.has(a.itemId) ? weekAgoByItem.get(a.itemId)! : null
    const detail = todayDetail.get(a.itemId)
    // The item's own unit wins: it is what every count and order is recorded in.
    // Older items without one fall back to the unit on their threshold.
    const uom = a.item.unitOfMeasure ?? t?.uom ?? detail?.unitOfMeasure ?? null
    return {
      itemId: a.itemId,
      itemName: a.item.itemName,
      commodityName: a.item.commodity?.name ?? null,
      categoryName: a.item.materialCategory?.name ?? null,
      uom,
      previousQty: prev,
      weekAgoQty: weekAgo,
      // Compared against the last recorded count, not today's half-typed entry.
      weekDelta: prev != null && weekAgo != null ? prev - weekAgo : null,
      thresholdQty: t?.qty ?? null,
      belowThreshold: t != null && prev != null && prev < t.qty,
      todayQty: detail ? num(detail.quantityOnHand) : null,
      recordedToday: !!detail,
      submittedToday: !!detail && isSubmittedToday,
      lowFlagged: lowSet.has(a.itemId),
      orders: ordersByItem.get(a.itemId) ?? [],
      vendorOptions: vendorsByItem.get(a.itemId) ?? allVendorOptions,
      messages: messagesByItem.get(a.itemId) ?? [],
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

/**
 * Paged submission history. Returns the total so the caller can render a pager —
 * this used to `take: 30` with no count and no controls, which silently hid
 * everything older once a grower passed 30 submissions.
 */
export async function getGrowerHistory(growerId: number, skip = 0, take = 10) {
  const where = { growerId }
  const [submissions, total] = await Promise.all([
    prisma.growerSubmission.findMany({
      where,
      include: {
        submitter: true,
        details: { include: { item: true } },
        _count: { select: { details: true } },
      },
      orderBy: { submissionDate: "desc" },
      skip,
      take,
    }),
    prisma.growerSubmission.count({ where }),
  ])
  return { submissions, total }
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

  // Latest vs week-ago value per item → deltas. Same two helpers the submit view
  // uses, so the dashboard's "biggest changes" and the per-row badges can't drift.
  const latest = latestPerItem(recentLedger)
  const weekAgoVal = weekAgoPerItem(recentLedger, todayStart)
  const nameByItem = new Map(recentLedger.map((l) => [l.itemId, l.item.itemName]))
  const deltas = [...latest.entries()].map(([itemId, current]) => {
    const prev = weekAgoVal.get(itemId)
    return {
      itemId,
      name: nameByItem.get(itemId) ?? itemId,
      current,
      previous: prev ?? null,
      delta: prev == null ? null : current - prev,
    }
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
