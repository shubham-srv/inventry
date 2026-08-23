"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireRole, type SessionUser } from "@/lib/auth/session"
import { ROLES, ORDER_STATUS } from "@/lib/constants"
import { ok, fail, type ActionState } from "@/lib/actions/types"
import { parseForm } from "@/lib/actions/_shared"
import { describePack, type PackLine } from "@/lib/packaging/resolve"
import { getT } from "@/lib/i18n/server"
import { notifyOrderPlaced } from "@/lib/email/notify"

async function requireGrower(): Promise<{ user: SessionUser; growerId: number }> {
  const user = await requireRole([ROLES.GROWER_USER])
  if (!user.growerId) throw new Error("This user is not mapped to a grower.")
  return { user, growerId: user.growerId }
}

function revalidateGrower() {
  revalidatePath("/grower")
  revalidatePath("/grower/submit")
  revalidatePath("/grower/on-order")
}

// An <input type="date"> posts "" when empty or "YYYY-MM-DD" otherwise. Parse
// at noon UTC so the calendar day is preserved regardless of server timezone.
const parseDeliveryDate = (s: string): Date | null => {
  const v = s.trim()
  if (!v) return null
  const d = new Date(`${v}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
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
  expectedDeliveryDate: z.string().trim().optional().default(""),
})

/** Raise a new order for an authorized item against one of its mapped vendors. */
export async function createOrder(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, growerId } = await requireGrower()
  const t = await getT()
  const { data, error } = parseForm(createSchema, fd)
  if (error) return error

  // Item must be authorized for this grower.
  const auth = await prisma.growerItemAuthorization.findFirst({
    where: { growerId, itemId: data.itemId, isActive: true },
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

  // One fetch for both the packaging label and the confirmation email — these
  // used to be two round trips for the same row.
  const [grower, item, vendor] = await Promise.all([
    prisma.grower.findUnique({ where: { id: growerId }, select: { primaryEmail: true, preferredLocale: true } }),
    prisma.item.findUnique({
      where: { id: data.itemId },
      select: { itemName: true, materialCategory: { select: { name: true } } },
    }),
    prisma.vendor.findUnique({ where: { id: data.vendorId }, select: { vendorName: true } }),
  ])
  const categoryName = item?.materialCategory?.name ?? null

  // Describe the vendor's packaging for this item. The per-level breakdown is
  // snapshotted onto the order so later edits to the vendor's ratios — or a
  // renamed category — can never rewrite what this order said at the time.
  const packLines = await resolveOrderPack(data.itemId, data.vendorId, data.quantity, categoryName)

  await prisma.order.create({
    data: {
      growerId,
      itemId: data.itemId,
      vendorId: data.vendorId,
      quantity: data.quantity,
      expectedDeliveryDate: parseDeliveryDate(data.expectedDeliveryDate),
      status: ORDER_STATUS.OPEN,
      orderDate: new Date(),
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

  // Confirm the order to the grower in their language.
  await notifyOrderPlaced({
    growerId,
    toEmail: grower?.primaryEmail ?? null,
    locale: grower?.preferredLocale ?? null,
    itemName: item?.itemName ?? data.itemId,
    vendorName: vendor?.vendorName ?? "",
    quantity: data.quantity,
    categoryName,
  })

  revalidateGrower()
  return ok(t("grower.orders.actions.created"))
}

const deliverySchema = z.object({
  id: z.coerce.number().int().positive(),
  expectedDeliveryDate: z.string().trim().optional().default(""),
})

/** Update the grower-editable expected delivery date on one of their orders. */
export async function updateOrderDelivery(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, growerId } = await requireGrower()
  const t = await getT()
  const { data, error } = parseForm(deliverySchema, fd)
  if (error) return error
  const order = await prisma.order.findUnique({ where: { id: data.id } })
  if (!order || order.growerId !== growerId) return fail(t("grower.orders.actions.notFound"))
  await prisma.order.update({
    where: { id: data.id },
    data: { expectedDeliveryDate: parseDeliveryDate(data.expectedDeliveryDate), updatedBy: user.id },
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
