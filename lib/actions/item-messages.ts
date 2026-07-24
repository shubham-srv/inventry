"use server"

import { revalidatePath } from "next/cache"
import { type Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { guard, parseForm, prismaErrorMessage, type ActionState } from "@/lib/actions/_shared"
import { ok, fail } from "@/lib/actions/types"
import { recordAudit } from "@/lib/audit"
import { CAPABILITIES } from "@/lib/rbac"
import { AUDIT_ACTIONS } from "@/lib/constants"

const CAP = CAPABILITIES.MANAGE_GROWERS_VENDORS

// <input type="date"> posts "" or "YYYY-MM-DD". Parse at noon so the calendar
// day is preserved regardless of server timezone.
const parseDate = (s: string): Date | null => {
  const v = s.trim()
  if (!v) return null
  const d = new Date(`${v}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

const parseGrowerIds = (s?: string): number[] =>
  (s ?? "")
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)

const schema = z.object({
  id: z.string().trim().optional().default(""),
  itemId: z.string().trim().min(1, "Select an item"),
  type: z.string().trim().min(1),
  severity: z.string().trim().min(1).default("info"),
  audience: z.string().trim().min(1).default("All"),
  body: z.string().trim().optional().default(""),
  // Comma-joined grower ids from the multi-select (used when audience=Selected).
  growerIds: z.string().trim().optional().default(""),
  startsAt: z.string().trim().optional().default(""),
  endsAt: z.string().trim().optional().default(""),
  isActive: z.string().optional().default("true"),
})

type Input = z.infer<typeof schema>

function messageData(d: Input) {
  return {
    itemId: d.itemId,
    type: d.type,
    severity: d.severity,
    audience: d.audience,
    body: d.body || null,
    startsAt: parseDate(d.startsAt),
    endsAt: parseDate(d.endsAt),
    isActive: d.isActive !== "false",
  }
}

// Selected audience => sync targets to the chosen growers; All => clear them.
async function syncTargets(
  tx: Prisma.TransactionClient,
  messageId: number,
  audience: string,
  growerIds: number[]
) {
  await tx.itemMessageGrower.deleteMany({ where: { itemMessageId: messageId } })
  if (audience === "Selected" && growerIds.length) {
    await tx.itemMessageGrower.createMany({
      data: growerIds.map((growerId) => ({ itemMessageId: messageId, growerId })),
    })
  }
}

function revalidate() {
  revalidatePath("/admin/item-messages")
  revalidatePath("/grower")
  revalidatePath("/grower/submit")
}

export async function createItemMessage(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(schema, fd)
  if (error) return error
  try {
    const created = await prisma.$transaction(async (tx) => {
      const msg = await tx.itemMessage.create({
        data: { ...messageData(data), createdBy: user.id, updatedBy: user.id },
      })
      await syncTargets(tx, msg.id, data.audience, parseGrowerIds(data.growerIds))
      return msg
    })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.CREATE, entityType: "ItemMessage", entityId: created.id, changes: data })
    revalidate()
    return ok("Item message created")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function updateItemMessage(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(schema, fd)
  if (error) return error
  try {
    const id = Number(data.id)
    await prisma.$transaction(async (tx) => {
      await tx.itemMessage.update({ where: { id }, data: { ...messageData(data), updatedBy: user.id } })
      await syncTargets(tx, id, data.audience, parseGrowerIds(data.growerIds))
    })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.UPDATE, entityType: "ItemMessage", entityId: data.id, changes: data })
    revalidate()
    return ok("Item message updated")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function deleteItemMessage(id: number): Promise<ActionState> {
  const user = await guard(CAP)
  try {
    await prisma.itemMessage.delete({ where: { id } }) // cascade removes targets
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.DELETE, entityType: "ItemMessage", entityId: id })
    revalidate()
    return ok("Item message deleted")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}
