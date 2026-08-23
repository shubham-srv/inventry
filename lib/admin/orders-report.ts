import "server-only"
import { Prisma } from "@prisma/client"
import { differenceInCalendarDays, startOfDay, subDays } from "date-fns"
import { prisma } from "@/lib/db"
import { sqlPage } from "@/lib/admin/sql"
import { ORDER_STATUS } from "@/lib/constants"

/**
 * Every grower order, across every grower and vendor.
 *
 * Orders have never had an admin-side view — they are raised, received and
 * cancelled entirely within the grower portal — so this is the first place the
 * receipt-discrepancy and lead-time data can actually be read.
 *
 * TWO THINGS THIS REPORT DOES NOT DO, both deliberate:
 *
 *  - It does NOT reconcile with the grower-stock report. Receiving an order
 *    writes no ledger row (see receiveOrder in lib/actions/orders.ts) because
 *    on-hand comes from the daily count and a receipt would double-count it. A
 *    received order for 343 does not move grower stock by 343; the next count does.
 *  - Its `delivery` and `receipt` filters do NOT partition the row set, unlike
 *    the stock filter in lib/admin/inventory-snapshot.ts. `delivery` says nothing
 *    about Cancelled orders and `receipt` covers Received ones only. Do not copy
 *    the snapshot's "the filtered counts add up" promise over here — only
 *    `status` has that property.
 *
 * PERF: `Order` has no index on `orderDate`, so the period filter and the sort
 * both scan. At this volume that is noise, and the codebase declines speculative
 * indexes elsewhere for the same reason.
 */

export type OrderDeliveryState =
  | "Overdue" // still Open and past its ETA
  | "Due" // still Open, ETA ahead
  | "Late" // Received after its ETA
  | "OnTime" // Received on or before its ETA
  | "Cancelled"
  | "Unknown" // no ETA was ever set — NOT the same as "on time"

export type OrderReceiptState = "Exact" | "Short" | "Over" | "Unrecorded" | "None"

export type OrdersFilters = {
  status?: string
  growerId?: number
  vendorId?: number
  /** Days back from today on `orderDate`; undefined = all history. */
  periodDays?: number
  delivery?: string
  receipt?: string
  q?: string
}

export type OrderReportRow = {
  id: number
  growerId: number
  growerName: string
  itemId: string
  itemName: string
  commodityName: string | null
  /** The item's material category — what the quantities are counted in. */
  categoryName: string | null
  vendorId: number
  vendorName: string
  quantity: number
  /** null on Open/Cancelled, and on a Received order nobody recorded. */
  receivedQuantity: number | null
  /** Signed: negative = short, positive = over. null when nothing was recorded. */
  variance: number | null
  /** The reason, which is OPTIONAL in the UI — see receiptState below. */
  receiptNote: string | null
  receiptState: OrderReceiptState
  status: string
  orderDate: Date
  expectedDeliveryDate: Date | null
  closedAt: Date | null
  delivery: OrderDeliveryState
  /** Days overdue / until due / late / early, paired with `delivery`. */
  deliveryDays: number | null
  /** Order → delivery, in days. Received only. */
  actualLeadDays: number | null
  /** The vendor's standing quote, which is a different promise from the ETA. */
  slaLeadDays: number | null
}

type RawRow = {
  id: number
  growerId: number
  growerName: string
  itemId: string
  itemName: string
  commodityName: string | null
  categoryName: string | null
  vendorId: number
  vendorName: string
  leadTimeDays: number | null
  quantity: Prisma.Decimal
  receivedQuantity: Prisma.Decimal | null
  receiptNote: string | null
  status: string
  orderDate: Date
  expectedDeliveryDate: Date | null
  closedAt: Date | null
}

/**
 * Receipt outcome.
 *
 * ⚠️ Derived from the QUANTITIES, never from `receiptNote`. The reason is a
 * free choice in the receive dialog, so a genuine short delivery can be recorded
 * with no reason at all — `receiptNote IS NOT NULL` implies a mismatch, but a
 * mismatch does not imply a reason. The seed plants one of these on purpose.
 */
function receiptState(row: RawRow): OrderReceiptState {
  if (row.status !== ORDER_STATUS.RECEIVED) return "None"
  if (row.receivedQuantity == null) return "Unrecorded"
  const diff = Number(row.receivedQuantity) - Number(row.quantity)
  if (diff < 0) return "Short"
  if (diff > 0) return "Over"
  return "Exact"
}

/**
 * Delivery outcome, and the day count that goes with it.
 *
 * `closedAt` is set on CANCELLED orders too — it is the day it was cancelled,
 * not a delivery — so cancellations short-circuit before any date maths. Getting
 * that wrong turns every cancellation into a suspiciously fast delivery.
 */
function deliveryState(
  row: RawRow,
  today: Date
): { delivery: OrderDeliveryState; deliveryDays: number | null } {
  if (row.status === ORDER_STATUS.CANCELLED) return { delivery: "Cancelled", deliveryDays: null }
  // No ETA was ever set. Unknown — emphatically not "on time".
  if (!row.expectedDeliveryDate) return { delivery: "Unknown", deliveryDays: null }

  if (row.status === ORDER_STATUS.OPEN) {
    const days = differenceInCalendarDays(row.expectedDeliveryDate, today)
    return days < 0
      ? { delivery: "Overdue", deliveryDays: -days }
      : { delivery: "Due", deliveryDays: days }
  }
  if (!row.closedAt) return { delivery: "Unknown", deliveryDays: null }
  // Signed, and the sign is kept: "3 days early" is information.
  const days = differenceInCalendarDays(row.closedAt, row.expectedDeliveryDate)
  return days > 0
    ? { delivery: "Late", deliveryDays: days }
    : { delivery: "OnTime", deliveryDays: days }
}

/** SQL mirrors of the two functions above. Keep them in step. */
function deliveryFilter(delivery: string | undefined, today: Date): Prisma.Sql {
  switch (delivery) {
    case "overdue":
      // An ETA of *today* is not yet overdue.
      return Prisma.sql`AND [status] = 'Open' AND [expectedDeliveryDate] IS NOT NULL AND [expectedDeliveryDate] < ${today}`
    case "due":
      return Prisma.sql`AND [status] = 'Open' AND [expectedDeliveryDate] IS NOT NULL AND [expectedDeliveryDate] >= ${today}`
    case "late":
      return Prisma.sql`AND [status] = 'Received' AND [expectedDeliveryDate] IS NOT NULL AND [closedAt] IS NOT NULL AND [closedAt] > [expectedDeliveryDate]`
    case "ontime":
      return Prisma.sql`AND [status] = 'Received' AND [expectedDeliveryDate] IS NOT NULL AND [closedAt] IS NOT NULL AND [closedAt] <= [expectedDeliveryDate]`
    case "noeta":
      return Prisma.sql`AND [expectedDeliveryDate] IS NULL`
    default:
      return Prisma.empty
  }
}

function receiptFilter(receipt: string | undefined): Prisma.Sql {
  switch (receipt) {
    case "exact":
      return Prisma.sql`AND [receivedQuantity] IS NOT NULL AND [receivedQuantity] = [quantity]`
    case "short":
      return Prisma.sql`AND [receivedQuantity] IS NOT NULL AND [receivedQuantity] < [quantity]`
    case "over":
      return Prisma.sql`AND [receivedQuantity] IS NOT NULL AND [receivedQuantity] > [quantity]`
    case "unrecorded":
      return Prisma.sql`AND [status] = 'Received' AND [receivedQuantity] IS NULL`
    default:
      return Prisma.empty
  }
}

export async function getOrdersReport(
  filters: OrdersFilters,
  page?: { skip: number; take: number }
): Promise<{ rows: OrderReportRow[]; total: number }> {
  // Bound in TypeScript and passed as parameters. The seed stamps dates at LOCAL
  // noon, so a SQL-side SYSUTCDATETIME() "today" would be a day out for part of
  // the year — and the displayed day counts are computed from the same values.
  const today = startOfDay(new Date())

  const statusFilter = filters.status
    ? Prisma.sql`AND o.[status] = ${filters.status}`
    : Prisma.empty
  const growerFilter = filters.growerId
    ? Prisma.sql`AND o.[growerId] = ${filters.growerId}`
    : Prisma.empty
  const vendorFilter = filters.vendorId
    ? Prisma.sql`AND o.[vendorId] = ${filters.vendorId}`
    : Prisma.empty
  const periodFilter = filters.periodDays
    ? Prisma.sql`AND o.[orderDate] >= ${subDays(today, filters.periodDays)}`
    : Prisma.empty
  const qFilter = filters.q
    ? Prisma.sql`AND (i.[itemName] LIKE ${"%" + filters.q + "%"} OR o.[itemId] LIKE ${"%" + filters.q + "%"} OR g.[growerName] LIKE ${"%" + filters.q + "%"} OR v.[vendorName] LIKE ${"%" + filters.q + "%"} OR CAST(o.[id] AS VARCHAR(20)) LIKE ${"%" + filters.q + "%"})`
    : Prisma.empty

  // NOTE: no `status = 'Active'` filters on grower/item/vendor. The snapshot has
  // them because it reports on what is true NOW; this is history, and silently
  // dropping an inactive grower's past orders would change the totals.
  //
  // [Order] is a SQL Server reserved word — the brackets are mandatory.
  const prelude = Prisma.sql`
    WITH base AS (
      SELECT
        o.[id], o.[growerId], g.[growerName], o.[itemId], i.[itemName],
        c.[name] AS [commodityName], mc.[name] AS [categoryName],
        o.[vendorId], v.[vendorName], v.[leadTimeDays],
        o.[quantity], o.[receivedQuantity], o.[receiptNote],
        o.[status], o.[orderDate], o.[expectedDeliveryDate], o.[closedAt]
      FROM [dbo].[Order] o
      INNER JOIN [dbo].[Grower] g ON g.[id] = o.[growerId]
      INNER JOIN [dbo].[Item] i ON i.[id] = o.[itemId]
      INNER JOIN [dbo].[Vendor] v ON v.[id] = o.[vendorId]
      LEFT JOIN [dbo].[Commodity] c ON c.[code] = i.[commodityCode]
      LEFT JOIN [dbo].[MaterialCategory] mc ON mc.[code] = i.[materialCategoryCode]
      WHERE 1 = 1
        ${statusFilter}
        ${growerFilter}
        ${vendorFilter}
        ${periodFilter}
        ${qFilter}
    )`

  // Both of these predicate on columns the CTE computes, so they go outside it.
  const delivery = deliveryFilter(filters.delivery, today)
  const receipt = receiptFilter(filters.receipt)

  const [rows, counted] = await Promise.all([
    prisma.$queryRaw<RawRow[]>`
      ${prelude}
      SELECT * FROM base WHERE 1 = 1 ${delivery} ${receipt}
      ORDER BY [orderDate] DESC, [id] DESC
      ${sqlPage(page)}
    `,
    prisma.$queryRaw<{ total: number }[]>`
      ${prelude}
      SELECT COUNT(*) AS [total] FROM base WHERE 1 = 1 ${delivery} ${receipt}
    `,
  ])

  return {
    rows: rows.map((r) => {
      const quantity = Number(r.quantity)
      const receivedQuantity = r.receivedQuantity == null ? null : Number(r.receivedQuantity)
      const actualLeadDays =
        r.status === ORDER_STATUS.RECEIVED && r.closedAt
          ? differenceInCalendarDays(r.closedAt, r.orderDate)
          : null
      return {
        id: r.id,
        growerId: r.growerId,
        growerName: r.growerName,
        itemId: r.itemId,
        itemName: r.itemName,
        commodityName: r.commodityName,
        categoryName: r.categoryName,
        vendorId: r.vendorId,
        vendorName: r.vendorName,
        quantity,
        receivedQuantity,
        variance: receivedQuantity == null ? null : receivedQuantity - quantity,
        receiptNote: r.receiptNote,
        receiptState: receiptState(r),
        status: r.status,
        orderDate: r.orderDate,
        expectedDeliveryDate: r.expectedDeliveryDate,
        closedAt: r.closedAt,
        ...deliveryState(r, today),
        actualLeadDays,
        slaLeadDays: r.leadTimeDays,
      }
    }),
    total: Number(counted[0]?.total ?? 0),
  }
}
