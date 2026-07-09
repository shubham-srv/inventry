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
  itemId: z.string().trim().min(1, "Item is required"),
})

export async function createAuthorization(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(schema, fd)
  if (error) return error
  const growerId = Number(data.growerId)
  try {
    await prisma.growerItemAuthorization.upsert({
      where: { growerId_itemId: { growerId, itemId: data.itemId } },
      update: { isActive: true, updatedBy: user.id },
      create: { growerId, itemId: data.itemId, isActive: true, createdBy: user.id, updatedBy: user.id },
    })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.CREATE, entityType: "GrowerItemAuthorization", entityId: `${growerId}:${data.itemId}`, changes: data })
    revalidatePath(PATH)
    return ok("Authorization added")
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
