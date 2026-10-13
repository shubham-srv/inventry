"use server"

import { revalidatePath } from "next/cache"
import { format, startOfDay } from "date-fns"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { ACTIVE_ITEM } from "@/lib/items/active"
import { requireRole, type SessionUser } from "@/lib/auth/session"
import { ROLES, ORDER_STATUS } from "@/lib/constants"
import { ok, fail, type ActionState } from "@/lib/actions/types"
import { parseForm, revalidateNavBadges } from "@/lib/actions/_shared"
import { describePack, type PackLine } from "@/lib/packaging/resolve"
import { getT } from "@/lib/i18n/server"
import { notifyOrderPlaced, notifyVendorOrderPlaced } from "@/lib/email/notify"
import { earliestDelivery, parseDay } from "@/lib/orders/dates"

async function requireGrower(): Promise<{ user: SessionUser; growerId: number }> {
  const user = await requireRole([ROLES.GROWER_USER])
  if (!user.growerId) throw new Error("This user is not mapped to a grower.")
  return { user, growerId: user.growerId }
}

function revalidateGrower() {
  revalidatePath("/grower")
  revalidatePath("/grower/submit")
  revalidatePath("/grower/on-order")
  revalidatePath("/grower/items")
  // The vendor's Orders page and its sidebar badge.
  revalidateNavBadges()
}

type T = Awaited<ReturnType<typeof getT>>

/**
 * The requested delivery date: required, and no sooner than the vendor's
 * minimum lead time after the order date (lib/orders/dates.ts — the dialog's
 * date picker applies the same limit).
 */
function checkRequestedDate(
  t: T,
  raw: string,
  orderDay: Date,
  vendor: { vendorName: string; leadTimeDays: number | null }
): { date: Date } | { error: ActionState } {
  const date = parseDay(raw)
  if (!date) {
    const message = t("grower.orders.actions.deliveryRequired")
    return { error: fail(message, { expectedDeliveryDate: [message] }) }
  }
  const earliest = earliestDelivery(orderDay, vendor.leadTimeDays)
  if (startOfDay(date) < earliest) {
    const message = vendor.leadTimeDays
      ? t("grower.orders.actions.deliveryTooSoon", {
          vendor: vendor.vendorName,
          days: vendor.leadTimeDays,
          date: format(earliest, "MMM d, yyyy"),
        })
      : t("grower.orders.actions.deliveryBeforeOrder")
    return { error: fail(message, { expectedDeliveryDate: [message] }) }
  }
  return { date }
}

/**
 * Look up the vendor's packaging setup for an item and describe a quantity
 * through it. Falls back to a single line when the mapping has no chain, which
 * is the pre-packaging behaviour.
 *
 * The result is descriptive: it says what the ordered quantity occupies, and
 * never alters the quantity itself.
 */
async function resolveOrderPack(
  itemId: string,
  vendorId: number,
  quantity: number,
  categoryName: string | null
): Promise<PackLine[]> {
  const mapping = await prisma.itemVendor.findUnique({
    where: { vendorId_itemId: { vendorId, itemId } },
    include: {
      packagingChain: { include: { levels: { orderBy: { level: "asc" } } } },
      packRatios: { orderBy: { level: "asc" } },
    },
  })
  return describePack({
    requested: quantity,
    baseLabel: categoryName ?? "units",
    levels: mapping?.packagingChain?.levels ?? [],
    ratios: mapping?.packRatios ?? [],
  })
}

// No unit here on purpose: a quantity is expressed in the item's material
// category, which the form shows. Whatever the client posts is ignored.
const createSchema = z.object({
  itemId: z.string().trim().min(1),
  vendorId: z.coerce.number().int().positive("Select a vendor"),
  quantity: z.coerce.number().positive("Enter a quantity greater than zero"),
  // When the order was placed: today unless backdated (phone/email orders).
  orderDate: z.string().trim().optional().default(""),
  expectedDeliveryDate: z.string().trim().optional().default(""),
})

/** Raise a new order for an authorized item against one of its mapped vendors. */
export async function createOrder(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, growerId } = await requireGrower()
  const t = await getT()
  const { data, error } = parseForm(createSchema, fd)
  if (error) return error

  // Item must be authorized for this grower, and live.
  const auth = await prisma.growerItemAuthorization.findFirst({
    where: { growerId, itemId: data.itemId, isActive: true, item: ACTIVE_ITEM },
  })
  if (!auth) return fail(t("grower.orders.actions.notAuthorized"))

  // Vendor must be one of the item's active mapped vendors. If the item has no
  // active mapping yet, fall back to allowing any active vendor.
  const mapped = await prisma.itemVendor.findMany({
    where: { itemId: data.itemId, isActive: true, vendor: { status: "Active" } },
    select: { vendorId: true },
  })
  const allowed = mapped.length
    ? new Set(mapped.map((m) => m.vendorId))
    : new Set(
        (
          await prisma.vendor.findMany({ where: { status: "Active" }, select: { id: true } })
        ).map((v) => v.id)
      )
  if (!allowed.has(data.vendorId)) return fail(t("grower.orders.actions.invalidVendor"))

  // One fetch for the packaging label, the date checks and both emails.
  const [grower, item, vendor] = await Promise.all([
    prisma.grower.findUnique({
      where: { id: growerId },
      select: { growerName: true, primaryEmail: true, preferredLocale: true },
    }),
    prisma.item.findUnique({
      where: { id: data.itemId },
      select: { itemName: true, materialCategory: { select: { name: true } } },
    }),
    prisma.vendor.findUnique({ where: { id: data.vendorId }, select: { vendorName: true, leadTimeDays: true } }),
  ])
  if (!vendor) return fail(t("grower.orders.actions.invalidVendor"))
  const categoryName = item?.materialCategory?.name ?? null

  // Order date: today by default; earlier is fine, the future is not.
  const today = startOfDay(new Date())
  const pickedDay = data.orderDate ? parseDay(data.orderDate) : null
  if (data.orderDate && !pickedDay) {
    const message = t("grower.orders.actions.orderDateInvalid")
    return fail(message, { orderDate: [message] })
  }
  if (pickedDay && startOfDay(pickedDay) > today) {
    const message = t("grower.orders.actions.orderDateFuture")
    return fail(message, { orderDate: [message] })
  }
  // Today keeps the real time, so same-day orders still sort by when they came in.
  const orderDate = pickedDay && startOfDay(pickedDay) < today ? pickedDay : new Date()

  const requested = checkRequestedDate(t, data.expectedDeliveryDate, orderDate, vendor)
  if ("error" in requested) return requested.error

  // Describe the vendor's packaging for this item. The per-level breakdown is
  // snapshotted onto the order so later edits to the vendor's ratios — or a
  // renamed category — can never rewrite what this order said at the time.
  const packLines = await resolveOrderPack(data.itemId, data.vendorId, data.quantity, categoryName)

  const order = await prisma.order.create({
    data: {
      growerId,
      itemId: data.itemId,
      vendorId: data.vendorId,
      quantity: data.quantity,
      expectedDeliveryDate: requested.date,
      status: ORDER_STATUS.OPEN,
      orderDate,
      createdBy: user.id,
      updatedBy: user.id,
      packLines: {
        create: packLines.map((l) => ({
          level: l.level,
          unitName: l.unitName,
          quantity: l.quantity,
        })),
      },
    },
  })

  // Confirm the order to the grower, and ask the vendor for a delivery date —
  // each in their own language.
  await notifyOrderPlaced({
    growerId,
    toEmail: grower?.primaryEmail ?? null,
    locale: grower?.preferredLocale ?? null,
    itemName: item?.itemName ?? data.itemId,
    vendorName: vendor.vendorName,
    quantity: data.quantity,
    categoryName,
  })
  await notifyVendorOrderPlaced({
    vendorId: data.vendorId,
    growerId,
    orderId: order.id,
    growerName: grower?.growerName ?? "",
    itemName: item?.itemName ?? data.itemId,
    itemId: data.itemId,
    quantity: data.quantity,
    categoryName,
    orderDate,
    requestedDate: requested.date,
  })

  revalidateGrower()
  return ok(t("grower.orders.actions.created"))
}

const deliverySchema = z.object({
  id: z.coerce.number().int().positive(),
  expectedDeliveryDate: z.string().trim().optional().default(""),
})

/**
 * Change the grower's REQUESTED delivery date on one of their open orders. The
 * vendor's confirmed date is theirs to change, not this.
 */
export async function updateOrderDelivery(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, growerId } = await requireGrower()
  const t = await getT()
  const { data, error } = parseForm(deliverySchema, fd)
  if (error) return error
  const order = await prisma.order.findUnique({
    where: { id: data.id },
    include: { vendor: { select: { vendorName: true, leadTimeDays: true } } },
  })
  if (!order || order.growerId !== growerId) return fail(t("grower.orders.actions.notFound"))
  if (order.status !== ORDER_STATUS.OPEN) return fail(t("grower.orders.actions.alreadyClosed"))
  const requested = checkRequestedDate(t, data.expectedDeliveryDate, order.orderDate, order.vendor)
  if ("error" in requested) return requested.error
  await prisma.order.update({
    where: { id: data.id },
    data: { expectedDeliveryDate: requested.date, updatedBy: user.id },
  })
  revalidateGrower()
  return ok(t("grower.orders.actions.deliveryUpdated"))
}

/** Move an Open order to a terminal status, stamping closedAt. */
async function closeOrder(
  orderId: number,
  status: string,
  messageKey: string
): Promise<ActionState> {
  const { user, growerId } = await requireGrower()
  const t = await getT()
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order || order.growerId !== growerId) return fail(t("grower.orders.actions.notFound"))
  if (order.status !== ORDER_STATUS.OPEN) return fail(t("grower.orders.actions.alreadyClosed"))
  await prisma.order.update({
    where: { id: orderId },
    data: { status, closedAt: new Date(), updatedBy: user.id },
  })
  revalidateGrower()
  return ok(t(messageKey))
}

const receiveSchema = z.object({
  id: z.coerce.number().int().positive(),
  receivedQuantity: z.string().trim().optional().default(""),
  receiptNote: z.string().trim().optional().default(""),
})

/**
 * Mark an order received, recording how much actually turned up.
 *
 * The quantity is prefilled with what was ORDERED, so the normal path is a
 * single confirm; editing it is the signal worth having — "we asked for 343 and
 * 340 arrived". Packaging plays no part: containers are discarded on receipt and
 * never changed the quantity in the first place.
 *
 * This deliberately writes NO inventory ledger entry. On-hand stock comes from
 * the grower's daily count, and adding a receipt to the ledger would double-count it.
 */
export async function receiveOrder(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, growerId } = await requireGrower()
  const t = await getT()
  const { data, error } = parseForm(receiveSchema, fd)
  if (error) return error

  const order = await prisma.order.findUnique({ where: { id: data.id } })
  if (!order || order.growerId !== growerId) return fail(t("grower.orders.actions.notFound"))
  if (order.status !== ORDER_STATUS.OPEN) return fail(t("grower.orders.actions.alreadyClosed"))

  const ordered = Number(order.quantity)
  const received = data.receivedQuantity === "" ? ordered : Number(data.receivedQuantity)
  if (!Number.isFinite(received) || received < 0)
    return fail(t("grower.orders.actions.invalidReceived"))

  const mismatch = received !== ordered
  await prisma.order.update({
    where: { id: data.id },
    data: {
      status: ORDER_STATUS.RECEIVED,
      closedAt: new Date(),
      receivedQuantity: received,
      // A note only means anything against a discrepancy.
      receiptNote: mismatch ? data.receiptNote || null : null,
      updatedBy: user.id,
    },
  })
  revalidateGrower()
  return ok(t("grower.orders.actions.received"))
}

export async function cancelOrder(orderId: number): Promise<ActionState> {
  return closeOrder(orderId, ORDER_STATUS.CANCELLED, "grower.orders.actions.cancelled")
}
