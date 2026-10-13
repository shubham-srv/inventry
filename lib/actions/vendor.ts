"use server"

import { revalidatePath } from "next/cache"
import { startOfDay } from "date-fns"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { ACTIVE_ITEM } from "@/lib/items/active"
import { requireRole, type SessionUser } from "@/lib/auth/session"
import { AUDIT_ACTIONS, ORDER_STATUS, ROLES } from "@/lib/constants"
import { ok, fail, type ActionState } from "@/lib/actions/types"
import { getT } from "@/lib/i18n/server"
import { notifyOrderDeliveryConfirmed, notifyVendorSubmissionReceived } from "@/lib/email/notify"
import { revalidateNavBadges } from "@/lib/actions/_shared"
import { recordAudit } from "@/lib/audit"
import { parseDay } from "@/lib/orders/dates"
import { saveConversions } from "@/lib/packaging/save"

async function requireVendor(): Promise<{ user: SessionUser; vendorId: number }> {
  const user = await requireRole([ROLES.VENDOR_USER])
  if (!user.vendorId) throw new Error("This user is not mapped to a vendor.")
  return { user, vendorId: user.vendorId }
}

const allocSchema = z.object({
  growerId: z.coerce.number().int(),
  quantity: z.coerce.number().nonnegative(),
})
// No unit: a reported quantity is expressed in the item's material category.
const itemSchema = z.object({
  itemId: z.string(),
  quantity: z.coerce.number().nonnegative(),
  allocations: z.array(allocSchema).default([]),
})
const payloadSchema = z.array(itemSchema)

export async function submitVendorReport(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user, vendorId } = await requireVendor()
  const t = await getT()

  let items: z.infer<typeof payloadSchema>
  try {
    items = payloadSchema.parse(JSON.parse(String(formData.get("payload") ?? "[]")))
  } catch {
    return fail(t("vendor.actions.invalidData"))
  }
  if (items.length === 0) return fail(t("vendor.actions.noItems"))

  // Security: only live items this vendor supplies.
  const supplied = await prisma.itemVendor.findMany({
    where: { vendorId, isActive: true, item: ACTIVE_ITEM },
    select: { itemId: true },
  })
  const allowedItems = new Set(supplied.map((s) => s.itemId))
  const valid = items.filter((i) => allowedItems.has(i.itemId))
  if (valid.length === 0) return fail(t("vendor.actions.noSupplied"))

  // Eligible growers per item (for validating allocations).
  const auths = await prisma.growerItemAuthorization.findMany({
    where: { itemId: { in: valid.map((v) => v.itemId) }, isActive: true },
    select: { itemId: true, growerId: true },
  })
  const growersByItem = new Map<string, Set<number>>()
  for (const a of auths) {
    const set = growersByItem.get(a.itemId) ?? new Set<number>()
    set.add(a.growerId)
    growersByItem.set(a.itemId, set)
  }

  // Validate allocations: only eligible growers, and sum must not exceed quantity.
  for (const it of valid) {
    const eligible = growersByItem.get(it.itemId) ?? new Set<number>()
    it.allocations = it.allocations.filter((a) => eligible.has(a.growerId) && a.quantity > 0)
    const allocated = it.allocations.reduce((s, a) => s + a.quantity, 0)
    if (allocated > it.quantity + 1e-6) {
      return fail(
        t("vendor.actions.overAllocated", {
          item: it.itemId,
          allocated,
          quantity: it.quantity,
        })
      )
    }
  }

  const todayStart = startOfDay(new Date())

  await prisma.$transaction(async (tx) => {
    let sub = await tx.vendorSubmission.findFirst({
      where: { vendorId, submissionDate: { gte: todayStart } },
    })
    if (!sub) {
      sub = await tx.vendorSubmission.create({
        data: {
          vendorId,
          submittedBy: user.id,
          submissionDate: new Date(),
          status: "Approved",
          createdBy: user.id,
          updatedBy: user.id,
        },
      })
    }

    for (const it of valid) {
      let detail = await tx.vendorSubmissionDetail.findFirst({
        where: { submissionId: sub.id, itemId: it.itemId },
      })
      if (detail) {
        await tx.vendorSubmissionDetail.update({
          where: { id: detail.id },
          data: {
            quantity: it.quantity,
            updatedBy: user.id,
          },
        })
      } else {
        detail = await tx.vendorSubmissionDetail.create({
          data: {
            submissionId: sub.id,
            itemId: it.itemId,
            quantity: it.quantity,
            createdBy: user.id,
            updatedBy: user.id,
          },
        })
      }

      // Replace allocations for this detail.
      await tx.vendorAllocation.deleteMany({ where: { vendorSubmissionDetailId: detail.id } })
      if (it.allocations.length) {
        await tx.vendorAllocation.createMany({
          data: it.allocations.map((a) => ({
            vendorSubmissionDetailId: detail!.id,
            growerId: a.growerId,
            quantity: a.quantity,
            createdBy: user.id,
            updatedBy: user.id,
          })),
        })
      }
    }
  })

  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } })
  await notifyVendorSubmissionReceived({
    vendorId,
    vendorName: vendor?.vendorName ?? "",
    toEmail: vendor?.contactEmail ?? null,
    locale: vendor?.preferredLocale ?? null,
    submittedByName: `${user.firstName} ${user.lastName}`,
    itemCount: valid.length,
  })

  revalidatePath("/vendor")
  revalidatePath("/vendor/submit")
  revalidatePath("/vendor/history")
  revalidatePath("/vendor/items")
  return ok(t("vendor.actions.recorded", { count: valid.length }))
}

// ---------------- Orders: the vendor's delivery date ----------------

const confirmSchema = z.object({
  id: z.coerce.number().int().positive(),
  confirmedDeliveryDate: z.string().trim().optional().default(""),
})

/**
 * Confirm — or change — when this vendor will deliver an open order. Once set,
 * it is the date delivery is measured against (admin Orders report), and the
 * grower is emailed: "confirmed" the first time, "changed" after that.
 */
export async function confirmDeliveryDate(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, vendorId } = await requireVendor()
  const t = await getT()
  const parsed = confirmSchema.safeParse(Object.fromEntries(fd))
  if (!parsed.success) return fail(t("vendor.orders.actions.notFound"))
  const data = parsed.data

  const order = await prisma.order.findUnique({
    where: { id: data.id },
    include: {
      grower: { select: { primaryEmail: true, preferredLocale: true } },
      item: { select: { itemName: true, materialCategory: { select: { name: true } } } },
      vendor: { select: { vendorName: true } },
    },
  })
  // Scoped by the session: another vendor's order id is simply "not found".
  if (!order || order.vendorId !== vendorId) return fail(t("vendor.orders.actions.notFound"))
  if (order.status !== ORDER_STATUS.OPEN) return fail(t("vendor.orders.actions.closed"))

  const date = parseDay(data.confirmedDeliveryDate)
  if (!date) {
    const message = t("vendor.orders.actions.dateRequired")
    return fail(message, { confirmedDeliveryDate: [message] })
  }
  if (startOfDay(date) < startOfDay(order.orderDate)) {
    const message = t("vendor.orders.actions.beforeOrder")
    return fail(message, { confirmedDeliveryDate: [message] })
  }
  const previous = order.confirmedDeliveryDate
  if (previous && startOfDay(previous).getTime() === startOfDay(date).getTime())
    return ok(t("vendor.orders.actions.unchanged"))

  await prisma.order.update({
    where: { id: order.id },
    data: { confirmedDeliveryDate: date, confirmedAt: new Date(), confirmedBy: user.id, updatedBy: user.id },
  })
  await recordAudit({
    userId: user.id,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: "Order",
    entityId: order.id,
    changes: { confirmedDeliveryDate: data.confirmedDeliveryDate, previous: previous?.toISOString() ?? null },
  })
  await notifyOrderDeliveryConfirmed({
    growerId: order.growerId,
    vendorId,
    toEmail: order.grower.primaryEmail,
    locale: order.grower.preferredLocale,
    itemName: order.item.itemName,
    vendorName: order.vendor.vendorName,
    quantity: Number(order.quantity),
    categoryName: order.item.materialCategory?.name ?? null,
    requestedDate: order.expectedDeliveryDate,
    confirmedDate: date,
    previousDate: previous,
  })

  revalidatePath("/vendor/orders")
  revalidatePath("/grower/on-order")
  revalidatePath("/grower/submit")
  revalidateNavBadges()
  return ok(previous ? t("vendor.orders.actions.changed") : t("vendor.orders.actions.confirmed"))
}

// ---------------- Vendor self-service settings ----------------

const leadTimeSchema = z.object({ leadTimeDays: z.string().trim().optional().default("") })

/**
 * The vendor's minimum lead time, in whole days. Growers cannot request
 * delivery sooner than order date + this (lib/orders/dates.ts). Blank clears it.
 */
export async function setLeadTime(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, vendorId } = await requireVendor()
  const t = await getT()
  const raw = leadTimeSchema.parse(Object.fromEntries(fd)).leadTimeDays
  const days = raw === "" ? null : Number(raw)
  if (days != null && (!Number.isInteger(days) || days < 0 || days > 365)) {
    const message = t("vendor.orders.actions.leadTimeInvalid")
    return fail(message, { leadTimeDays: [message] })
  }
  await prisma.vendor.update({ where: { id: vendorId }, data: { leadTimeDays: days, updatedBy: user.id } })
  await recordAudit({
    userId: user.id,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: "Vendor",
    entityId: vendorId,
    changes: { leadTimeDays: days },
  })
  revalidatePath("/vendor/orders")
  revalidatePath("/grower/submit")
  revalidatePath("/admin/vendors")
  return ok(t("vendor.orders.actions.leadTimeSaved"))
}

const conversionsSchema = z.object({
  id: z.coerce.number().int().positive(),
  packagingChainId: z.string().trim().optional().default(""),
  ratios: z.string().trim().optional().default(""),
})

/** A vendor sets the conversion chain and ratios for one of its own items. */
export async function setMyConversions(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, vendorId } = await requireVendor()
  const t = await getT()
  const parsed = conversionsSchema.safeParse(Object.fromEntries(fd))
  if (!parsed.success) return fail(t("conversions.mappingNotFound"))
  const mapping = await prisma.itemVendor.findUnique({ where: { id: parsed.data.id }, select: { vendorId: true, isActive: true } })
  if (!mapping || mapping.vendorId !== vendorId || !mapping.isActive) return fail(t("conversions.mappingNotFound"))

  const result = await saveConversions(t, {
    mappingId: parsed.data.id,
    chainId: parsed.data.packagingChainId,
    ratios: parsed.data.ratios,
    userId: user.id,
  })
  if (result.ok) {
    revalidatePath("/vendor/items")
    revalidatePath("/admin/mappings/vendors")
  }
  return result
}
