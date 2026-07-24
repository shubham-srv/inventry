"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/db"
import {
  guard,
  parseForm,
  prismaErrorMessage,
  type ActionState,
} from "@/lib/actions/_shared"
import { ok, fail } from "@/lib/actions/types"
import { recordAudit } from "@/lib/audit"
import { CAPABILITIES } from "@/lib/rbac"
import { AUDIT_ACTIONS } from "@/lib/constants"

const CAP = CAPABILITIES.MANAGE_GROWERS_VENDORS
const PATH = "/admin/authorizations"

const schema = z.object({
  growerId: z.string().trim().min(1, "Grower is required"),
  // Posted by the multiselect field as a comma-joined string of item ids.
  itemIds: z.string().trim().min(1, "At least one item is required"),
})

export async function createAuthorization(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(schema, fd)
  if (error) return error
  const growerId = Number(data.growerId)
  const itemIds = [...new Set(data.itemIds.split(",").map((s) => s.trim()).filter(Boolean))]
  if (itemIds.length === 0) return fail("At least one item is required")
  try {
    await prisma.$transaction(
      itemIds.map((itemId) =>
        prisma.growerItemAuthorization.upsert({
          where: { growerId_itemId: { growerId, itemId } },
          update: { isActive: true, updatedBy: user.id },
          create: { growerId, itemId, isActive: true, createdBy: user.id, updatedBy: user.id },
        })
      )
    )
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.CREATE, entityType: "GrowerItemAuthorization", entityId: `${growerId}:${itemIds.join("+")}`, changes: { growerId, itemIds } })
    revalidatePath(PATH)
    return ok(itemIds.length === 1 ? "Authorization added" : `${itemIds.length} authorizations added`)
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function setAuthorizationActive(id: number, active: boolean): Promise<ActionState> {
  const user = await guard(CAP)
  try {
    await prisma.growerItemAuthorization.update({ where: { id }, data: { isActive: active, updatedBy: user.id } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.UPDATE, entityType: "GrowerItemAuthorization", entityId: id, changes: { isActive: active } })
    revalidatePath(PATH)
    return ok(active ? "Authorization activated" : "Authorization revoked")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function deleteAuthorization(id: number): Promise<ActionState> {
  const user = await guard(CAP)
  try {
    await prisma.growerItemAuthorization.delete({ where: { id } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.DELETE, entityType: "GrowerItemAuthorization", entityId: id })
    revalidatePath(PATH)
    return ok("Authorization removed")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}
