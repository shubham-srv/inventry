"use server"

import { revalidatePath } from "next/cache"
import { startOfDay } from "date-fns"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireRole, type SessionUser } from "@/lib/auth/session"
import { ROLES } from "@/lib/constants"
import { ok, fail, type ActionState } from "@/lib/actions/types"
import { resolveItemUnits } from "@/lib/items/uom"
import { getT } from "@/lib/i18n/server"
import { notifyVendorSubmissionReceived } from "@/lib/email/notify"

async function requireVendor(): Promise<{ user: SessionUser; vendorId: number }> {
  const user = await requireRole([ROLES.VENDOR_USER])
  if (!user.vendorId) throw new Error("This user is not mapped to a vendor.")
  return { user, vendorId: user.vendorId }
}

const allocSchema = z.object({
  growerId: z.coerce.number().int(),
  quantity: z.coerce.number().nonnegative(),
})
// `uom` is accepted but ignored: the unit comes from the item itself.
const itemSchema = z.object({
  itemId: z.string(),
  quantity: z.coerce.number().nonnegative(),
  uom: z.string().nullish(),
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

  // Security: only items this vendor supplies.
  const supplied = await prisma.itemVendor.findMany({
    where: { vendorId, isActive: true },
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
  const units = await resolveItemUnits(valid.map((v) => v.itemId))

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
            unitOfMeasure: units.get(it.itemId) ?? null,
            updatedBy: user.id,
          },
        })
      } else {
        detail = await tx.vendorSubmissionDetail.create({
          data: {
            submissionId: sub.id,
            itemId: it.itemId,
            quantity: it.quantity,
            unitOfMeasure: units.get(it.itemId) ?? null,
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
  return ok(t("vendor.actions.recorded", { count: valid.length }))
}
