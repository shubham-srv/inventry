"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { guard, parseForm, prismaErrorMessage, type ActionState } from "@/lib/actions/_shared"
import { ok, fail } from "@/lib/actions/types"
import { recordAudit } from "@/lib/audit"
import { CAPABILITIES } from "@/lib/rbac"
import { AUDIT_ACTIONS } from "@/lib/constants"

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
    await prisma.missingItemRequest.update({
      where: { id: Number(data.id) },
      data: {
        status: data.status,
        reviewNotes: data.reviewNotes || null,
        reviewedBy: user.id,
        reviewedAt: new Date(),
        updatedBy: user.id,
      },
    })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.UPDATE, entityType: "MissingItemRequest", entityId: data.id, changes: { status: data.status } })
    revalidatePath("/admin/requests")
    return ok("Request updated")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}
