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
const PATH = "/admin/mappings/growers"

const schema = z.object({
  growerId: z.string().trim().min(1, "Grower is required"),
  // Posted by the multiselect field as a comma-joined string of item ids.
  // Deliberately allowed to be EMPTY: the dialog now edits the grower's whole
  // authorization set, so clearing every box means "authorize nothing", which
  // is a legitimate instruction rather than a validation failure.
  itemIds: z.string().trim().optional().default(""),
})

/**
 * Set a grower's item authorizations to exactly the posted list.
 *
 * This used to be additive — it upserted the selected items and left everything
 * else alone, so the only way to remove one was the per-row Deactivate button.
 * The dialog now pre-ticks what is already mapped, which makes an unticked box
 * a deliberate "remove this", so the action reconciles both directions.
 *
 * Removal is soft, matching syncGrowerItems in lib/actions/partners.ts and the
 * per-row button: submissions and ledger rows still reference the item, and the
 * mapping list shows inactive rows so the history stays visible.
 */
export async function setGrowerAuthorizations(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(schema, fd)
  if (error) return error
  const growerId = Number(data.growerId)
  const itemIds = [...new Set(data.itemIds.split(",").map((s) => s.trim()).filter(Boolean))]
  const want = new Set(itemIds)
  try {
    const { added, removed } = await prisma.$transaction(async (tx) => {
      const existing = await tx.growerItemAuthorization.findMany({ where: { growerId } })
      const activeBefore = new Set(existing.filter((a) => a.isActive).map((a) => a.itemId))
      for (const itemId of want) {
        await tx.growerItemAuthorization.upsert({
          where: { growerId_itemId: { growerId, itemId } },
          update: { isActive: true, updatedBy: user.id },
          create: { growerId, itemId, isActive: true, createdBy: user.id, updatedBy: user.id },
        })
      }
      const toDeactivate = existing.filter((a) => a.isActive && !want.has(a.itemId))
      for (const a of toDeactivate) {
        await tx.growerItemAuthorization.update({
          where: { id: a.id },
          data: { isActive: false, updatedBy: user.id },
        })
      }
      return {
        added: [...want].filter((i) => !activeBefore.has(i)).length,
        removed: toDeactivate.length,
      }
    })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.UPDATE, entityType: "GrowerItemAuthorization", entityId: `grower:${growerId}`, changes: { growerId, itemIds } })
    revalidatePath(PATH)
    if (added === 0 && removed === 0) return ok("No changes")
    const parts = []
    if (added) parts.push(`${added} added`)
    if (removed) parts.push(`${removed} removed`)
    return ok(`Authorizations updated — ${parts.join(", ")}`)
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
    return ok(active ? "Authorization activated" : "Authorization deactivated")
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
