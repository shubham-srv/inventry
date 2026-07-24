"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { guard, parseForm, prismaErrorMessage, type ActionState } from "@/lib/actions/_shared"
import { ok, fail } from "@/lib/actions/types"
import { recordAudit } from "@/lib/audit"
import { CAPABILITIES } from "@/lib/rbac"
import { AUDIT_ACTIONS } from "@/lib/constants"
import { notifyLowInventoryReviewed } from "@/lib/email/notify"

const schema = z.object({
  id: z.string().trim().min(1),
  reviewNotes: z.string().trim().optional().default(""),
})

/**
 * Admin reviews a grower's low-inventory flag: clears it (isActive=false),
 * records who/when, and emails the grower — in their language — that it was
 * reviewed. Once cleared, the flag drops out of the grower's submit view.
 */
export async function reviewLowFlag(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAPABILITIES.MANAGE_GROWERS_VENDORS)
  const { data, error } = parseForm(schema, fd)
  if (error) return error
  try {
    const flag = await prisma.lowInventoryFlag.findUnique({
      where: { id: Number(data.id) },
      include: { grower: true, item: true },
    })
    if (!flag) return fail("Flag not found.")
    if (!flag.isActive) return fail("That flag has already been cleared.")

    await prisma.lowInventoryFlag.update({
      where: { id: flag.id },
      data: {
        isActive: false,
        reviewedBy: user.id,
        reviewedAt: new Date(),
        reviewNotes: data.reviewNotes || null,
        updatedBy: user.id,
      },
    })
    await recordAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: "LowInventoryFlag",
      entityId: data.id,
      changes: { reviewed: true },
    })

    await notifyLowInventoryReviewed({
      growerId: flag.growerId,
      toEmail: flag.grower.primaryEmail ?? null,
      locale: flag.grower.preferredLocale ?? null,
      itemName: flag.item.itemName,
      reviewNotes: data.reviewNotes || null,
    })

    revalidatePath("/admin/low-inventory")
    revalidatePath("/grower")
    revalidatePath("/grower/submit")
    return ok("Low-inventory flag reviewed")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}
