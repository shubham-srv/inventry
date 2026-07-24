"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { guard, parseForm, prismaErrorMessage, type ActionState } from "@/lib/actions/_shared"
import { ok, fail } from "@/lib/actions/types"
import { recordAudit } from "@/lib/audit"
import { CAPABILITIES } from "@/lib/rbac"
import { AUDIT_ACTIONS } from "@/lib/constants"
import { notifyRequestReviewed } from "@/lib/email/notify"

const schema = z.object({
  id: z.string().trim().min(1),
  status: z.string().trim().min(1),
  reviewNotes: z.string().trim().optional().default(""),
})

export async function reviewRequest(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAPABILITIES.MANAGE_GROWERS_VENDORS)
  const { data, error } = parseForm(schema, fd)
  if (error) return error
  try {
    const updated = await prisma.missingItemRequest.update({
      where: { id: Number(data.id) },
      data: {
        status: data.status,
        reviewNotes: data.reviewNotes || null,
        reviewedBy: user.id,
        reviewedAt: new Date(),
        updatedBy: user.id,
      },
      include: { grower: true },
    })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.UPDATE, entityType: "MissingItemRequest", entityId: data.id, changes: { status: data.status } })
    // Notify the requesting grower (in their language) that it was reviewed.
    await notifyRequestReviewed({
      growerId: updated.growerId,
      toEmail: updated.grower.primaryEmail ?? null,
      locale: updated.grower.preferredLocale ?? null,
      itemName: updated.itemName,
      status: updated.status,
      reviewNotes: updated.reviewNotes,
    })
    revalidatePath("/admin/requests")
    return ok("Request updated")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}
