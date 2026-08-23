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
import { runReminderCheck } from "@/lib/scheduler/reminders"

const CAP = CAPABILITIES.ACCESS_SETTINGS

// ---------------- Scheduler settings ----------------
const schedulerSchema = z.object({
  id: z.string().trim().optional().default(""),
  scope: z.string().trim().min(1),
  growerId: z.string().trim().optional().default(""),
  cadenceType: z.string().trim().min(1),
  thresholdDays: z.coerce.number().int().min(1).max(90),
  isEnabled: z.string().trim().optional().default("true"),
})

function schedulerData(d: z.infer<typeof schedulerSchema>) {
  const isGrower = d.scope === "Grower"
  return {
    scope: d.scope,
    growerId: isGrower && d.growerId ? Number(d.growerId) : null,
    cadenceType: d.cadenceType,
    thresholdDays: d.thresholdDays,
    isEnabled: d.isEnabled === "true",
  }
}

export async function createScheduler(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(schedulerSchema, fd)
  if (error) return error
  const payload = schedulerData(data)
  if (payload.scope === "Grower" && !payload.growerId) return fail("Select a grower for a grower-scoped schedule.", { growerId: ["Required"] })
  try {
    const created = await prisma.schedulerSetting.create({ data: { ...payload, createdBy: user.id, updatedBy: user.id } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.CREATE, entityType: "SchedulerSetting", entityId: created.id, changes: payload })
    revalidatePath("/admin/settings/schedulers")
    return ok("Schedule created")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function updateScheduler(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(schedulerSchema, fd)
  if (error) return error
  const payload = schedulerData(data)
  try {
    await prisma.schedulerSetting.update({ where: { id: Number(data.id) }, data: { ...payload, updatedBy: user.id } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.UPDATE, entityType: "SchedulerSetting", entityId: data.id, changes: payload })
    revalidatePath("/admin/settings/schedulers")
    return ok("Schedule updated")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function deleteScheduler(id: number): Promise<ActionState> {
  const user = await guard(CAP)
  try {
    await prisma.schedulerSetting.delete({ where: { id } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.DELETE, entityType: "SchedulerSetting", entityId: id })
    revalidatePath("/admin/settings/schedulers")
    return ok("Schedule deleted")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function runRemindersAction(): Promise<ActionState> {
  const user = await guard(CAP)
  const result = await runReminderCheck()
  await recordAudit({ userId: user.id, action: "RunReminders", entityType: "SchedulerSetting", changes: result })
  revalidatePath("/admin/settings/outbox")
  revalidatePath("/admin/settings/schedulers")
  return ok(`Checked ${result.checked} grower(s); queued ${result.remindersCreated} reminder(s).`)
}

// ---------------- Item thresholds ----------------
// No unit: a quantity is expressed in the item's material category, so a
// threshold and the counts it is compared against can never disagree.
const thresholdSchema = z.object({
  id: z.string().trim().optional().default(""),
  itemId: z.string().trim().min(1, "Item is required"),
  growerId: z.string().trim().optional().default(""),
  thresholdQuantity: z.coerce.number().nonnegative(),
})

/**
 * A threshold carries no unit of its own.
 *
 * The form used to offer a free choice of unit, which let a threshold be
 * recorded in Cases while every count and order against the item was in Bags,
 * silently comparing two different quantities. The unit now comes from the
 * item's material category — the same place the counts get theirs — so the two
 * cannot diverge at all.
 */
function thresholdData(d: z.infer<typeof thresholdSchema>) {
  // "0" is the select sentinel for a global (all-growers) threshold.
  return {
    itemId: d.itemId,
    growerId: d.growerId && d.growerId !== "0" ? Number(d.growerId) : null,
    thresholdQuantity: d.thresholdQuantity,
  }
}

export async function createThreshold(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(thresholdSchema, fd)
  if (error) return error
  try {
    const row = thresholdData(data)
    await prisma.itemThreshold.create({ data: { ...row, createdBy: user.id, updatedBy: user.id } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.CREATE, entityType: "ItemThreshold", entityId: data.itemId, changes: row })
    revalidatePath("/admin/settings/thresholds")
    return ok("Threshold created")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function updateThreshold(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(thresholdSchema, fd)
  if (error) return error
  try {
    const row = thresholdData(data)
    await prisma.itemThreshold.update({ where: { id: Number(data.id) }, data: { ...row, updatedBy: user.id } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.UPDATE, entityType: "ItemThreshold", entityId: data.id, changes: row })
    revalidatePath("/admin/settings/thresholds")
    return ok("Threshold updated")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function deleteThreshold(id: number): Promise<ActionState> {
  const user = await guard(CAP)
  try {
    await prisma.itemThreshold.delete({ where: { id } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.DELETE, entityType: "ItemThreshold", entityId: id })
    revalidatePath("/admin/settings/thresholds")
    return ok("Threshold deleted")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}
