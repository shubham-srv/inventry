"use server"

import { revalidatePath } from "next/cache"
import { startOfDay } from "date-fns"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireRole, type SessionUser } from "@/lib/auth/session"
import { ROLES, SUBMISSION_STATUS } from "@/lib/constants"
import { ok, fail, type ActionState } from "@/lib/actions/types"
import { parseForm, revalidateNavBadges } from "@/lib/actions/_shared"
import { resolveItemUnits } from "@/lib/items/uom"
import { getT } from "@/lib/i18n/server"
import {
  notifySubmissionReceived,
  notifyMissingItemRequest,
} from "@/lib/email/notify"

async function requireGrower(): Promise<{
  user: SessionUser
  growerId: number
}> {
  const user = await requireRole([ROLES.GROWER_USER])
  if (!user.growerId) throw new Error("This user is not mapped to a grower.")
  return { user, growerId: user.growerId }
}

function revalidateGrower() {
  revalidatePath("/grower")
  revalidatePath("/grower/submit")
  revalidatePath("/grower/history")
  revalidatePath("/grower/on-order")
  revalidatePath("/grower/requests")
  revalidateNavBadges()
}

// ---------------- Daily inventory submission ----------------
// Scoped to ONE location: the form posts a `locationId` alongside the payload,
// and the submission it lands on is the grower's row for that location today.
//
// Two modes, selected by the pressed button (`mode` form field):
//  - "draft": values are stored (and re-populate the form) but do NOT count —
//    no ledger rows, no notification, no low-flag sync, progress bar unmoved.
//  - "submit": today's submission for this location becomes Approved; its
//    ledger is rebuilt from all of its details, low flags sync, notification
//    fires, progress updates. Other locations are untouched — that is the whole
//    reason the location sits on the submission rather than only on the detail.
// `uom` is accepted for backwards compatibility but ignored — the unit stored
// on the detail row always comes from the item (see lib/items/uom.ts).
const submitItemSchema = z.object({
  itemId: z.string(),
  quantityOnHand: z.coerce.number().nonnegative(),
  uom: z.string().nullish(),
  low: z.boolean().optional().default(false),
})
const payloadSchema = z.array(submitItemSchema)

export async function submitInventory(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user, growerId } = await requireGrower()
  const t = await getT()
  const isDraft = String(formData.get("mode") ?? "submit") === "draft"

  let items: z.infer<typeof payloadSchema>
  try {
    items = payloadSchema.parse(
      JSON.parse(String(formData.get("payload") ?? "[]"))
    )
  } catch {
    return fail(t("grower.actions.invalidData"))
  }
  if (items.length === 0) return fail(t("grower.actions.noItems"))

  // Security: the location must be one this grower is mapped to. Checked the
  // same way as the item authorizations below — the picker only offers valid
  // locations, but the id arrives in a form field and cannot be trusted.
  const locationId = Number(formData.get("locationId"))
  if (!Number.isInteger(locationId) || locationId <= 0)
    return fail(t("grower.actions.noLocation"))
  const mapping = await prisma.growerLocation.findFirst({
    where: { growerId, locationId, isActive: true },
    select: { id: true },
  })
  if (!mapping) return fail(t("grower.actions.locationNotAllowed"))

  // Security: only allow items this grower is authorized for.
  const auths = await prisma.growerItemAuthorization.findMany({
    where: { growerId, isActive: true },
    select: { itemId: true },
  })
  const allowed = new Set(auths.map((a) => a.itemId))
  const valid = items.filter((i) => allowed.has(i.itemId))
  if (valid.length === 0) return fail(t("grower.actions.noAuthorized"))

  const todayStart = startOfDay(new Date())
  const newStatus = isDraft
    ? SUBMISSION_STATUS.DRAFT
    : SUBMISSION_STATUS.APPROVED
  let submittedCount = valid.length
  const units = await resolveItemUnits(
    valid.map((i) => i.itemId),
    growerId
  )

  await prisma.$transaction(async (tx) => {
    let sub = await tx.growerSubmission.findFirst({
      where: { growerId, locationId, submissionDate: { gte: todayStart } },
    })
    if (!sub) {
      sub = await tx.growerSubmission.create({
        data: {
          growerId,
          locationId,
          submittedBy: user.id,
          submissionDate: new Date(),
          status: newStatus,
          createdBy: user.id,
          updatedBy: user.id,
        },
      })
    } else {
      sub = await tx.growerSubmission.update({
        where: { id: sub.id },
        data: {
          status: newStatus,
          submittedBy: user.id,
          submissionDate: isDraft ? sub.submissionDate : new Date(),
          updatedBy: user.id,
        },
      })
    }

    // The submission is already scoped to one location, so (submissionId,
    // itemId) is unique — and now backed by a real DB constraint, which lets
    // this be a single upsert instead of a find-then-branch.
    for (const it of valid) {
      const data = {
        quantityOnHand: it.quantityOnHand,
        unitOfMeasure: units.get(it.itemId) ?? null,
        isLowFlagged: !!it.low,
        updatedBy: user.id,
      }
      await tx.growerSubmissionDetail.upsert({
        where: { submissionId_itemId: { submissionId: sub.id, itemId: it.itemId } },
        update: data,
        create: {
          submissionId: sub.id,
          itemId: it.itemId,
          locationId,
          createdBy: user.id,
          ...data,
        },
      })
    }

    if (isDraft) {
      // Draft numbers are not "real" yet — remove today's ledger rows so
      // analytics/thresholds keep using the last submitted values.
      await tx.inventoryLedger.deleteMany({ where: { submissionId: sub.id } })
      return
    }

    // SUBMIT: rebuild the ledger from ALL of this submission's details (covers
    // items saved in an earlier draft pass but not re-included in this
    // payload). Because the submission is one location's, this can no longer
    // reach across and promote another location's draft numbers.
    const allDetails = await tx.growerSubmissionDetail.findMany({
      where: { submissionId: sub.id },
    })
    submittedCount = allDetails.length
    await tx.inventoryLedger.deleteMany({ where: { submissionId: sub.id } })
    await tx.inventoryLedger.createMany({
      data: allDetails.map((d) => ({
        submissionId: sub.id,
        date: todayStart,
        growerId,
        itemId: d.itemId,
        locationId: d.locationId,
        transactionType: "Daily Count Update",
        finalQuantity: d.quantityOnHand,
        createdBy: user.id,
        updatedBy: user.id,
      })),
    })

    // Sync the standalone low-inventory flag with the per-row toggle.
    //
    // Flags stay keyed on (grower, item) rather than picking up the location:
    // a flag is a "come look at this" signal, and the admin review queue works
    // at item level. The trade-off is that if one item is counted at several
    // sites, whichever site is submitted last decides the flag — the same
    // reasoning that leaves thresholds comparing against the total across
    // locations (see latestPerItem in lib/grower/data.ts).
    for (const it of valid) {
      const flag = await tx.lowInventoryFlag.findFirst({
        where: { growerId, itemId: it.itemId, isActive: true },
      })
      if (it.low && !flag) {
        await tx.lowInventoryFlag.create({
          data: {
            growerId,
            itemId: it.itemId,
            flaggedBy: user.id,
            submissionId: sub.id,
            reason: "Flagged during daily submission",
            isActive: true,
            createdBy: user.id,
          },
        })
      } else if (!it.low && flag) {
        await tx.lowInventoryFlag.update({
          where: { id: flag.id },
          data: { isActive: false, updatedBy: user.id },
        })
      }
    }
  })

  if (!isDraft) {
    const [grower, location] = await Promise.all([
      prisma.grower.findUnique({ where: { id: growerId } }),
      prisma.location.findUnique({ where: { id: locationId } }),
    ])
    await notifySubmissionReceived({
      growerId,
      growerName: grower?.growerName ?? "",
      locationName: location?.locationName ?? "",
      toEmail: grower?.primaryEmail ?? null,
      locale: grower?.preferredLocale ?? null,
      submittedByName: `${user.firstName} ${user.lastName}`,
      itemCount: submittedCount,
    })
  }

  revalidateGrower()
  return ok(
    isDraft
      ? t("grower.actions.draftSaved", { count: valid.length })
      : t("grower.actions.recorded", { count: submittedCount })
  )
}

// ---------------- Standalone low-inventory flag toggle ----------------
export async function toggleLowFlag(
  itemId: string,
  active: boolean
): Promise<ActionState> {
  const { user, growerId } = await requireGrower()
  const t = await getT()
  const existing = await prisma.lowInventoryFlag.findFirst({
    where: { growerId, itemId, isActive: true },
  })
  if (active && !existing) {
    // Raising a flag does NOT email anyone — it surfaces in the admin
    // low-inventory review queue. The grower is emailed only once an admin
    // reviews it (see reviewLowFlag / notifyLowInventoryReviewed).
    await prisma.lowInventoryFlag.create({
      data: {
        growerId,
        itemId,
        flaggedBy: user.id,
        reason: "Manually flagged low",
        isActive: true,
        createdBy: user.id,
      },
    })
  } else if (!active && existing) {
    await prisma.lowInventoryFlag.update({
      where: { id: existing.id },
      data: { isActive: false, updatedBy: user.id },
    })
  }
  revalidateGrower()
  return ok(
    active ? t("grower.actions.flagged") : t("grower.actions.flagCleared")
  )
}

// ---------------- Missing item request ----------------
const requestSchema = z.object({
  itemName: z.string().trim().min(1, "Item name is required"),
  commodityHint: z.string().trim().optional().default(""),
  categoryHint: z.string().trim().optional().default(""),
  notes: z.string().trim().optional().default(""),
})

export async function createMissingItemRequest(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user, growerId } = await requireGrower()
  const t = await getT()
  const { data, error } = parseForm(requestSchema, formData)
  if (error) return error

  await prisma.missingItemRequest.create({
    data: {
      growerId,
      requestedBy: user.id,
      itemName: data.itemName,
      commodityHint: data.commodityHint || null,
      categoryHint: data.categoryHint || null,
      notes: data.notes || null,
      status: "Open",
      createdBy: user.id,
    },
  })

  const grower = await prisma.grower.findUnique({ where: { id: growerId } })
  await notifyMissingItemRequest({
    growerId,
    growerName: grower?.growerName ?? "",
    requestedByName: `${user.firstName} ${user.lastName}`,
    itemName: data.itemName,
  })

  revalidateGrower()
  return ok(t("grower.actions.requestSubmitted"))
}
