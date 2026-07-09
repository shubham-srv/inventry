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

const CAP = CAPABILITIES.MANAGE_CONVERSIONS

const schema = z.object({
  id: z.string().trim().optional().default(""),
  fromUnit: z.string().trim().min(1, "From unit is required"),
  toUnit: z.string().trim().min(1, "To unit is required"),
  factor: z.coerce.number().positive("Factor must be greater than 0"),
  itemId: z.string().trim().optional().default(""),
  commodityCode: z.string().trim().optional().default(""),
  notes: z.string().trim().optional().default(""),
})

// "none" is the select sentinel for an unscoped (global) conversion.
const clean = (v: string) => (v && v !== "none" ? v : null)

function toData(d: z.infer<typeof schema>) {
  return {
    fromUnit: d.fromUnit,
    toUnit: d.toUnit,
    factor: d.factor,
    itemId: clean(d.itemId),
    commodityCode: clean(d.commodityCode),
    notes: d.notes || null,
  }
}

export async function createConversion(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(schema, fd)
  if (error) return error
  try {
    await prisma.unitConversion.create({ data: { ...toData(data), createdBy: user.id, updatedBy: user.id } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.CREATE, entityType: "UnitConversion", changes: toData(data) })
    revalidatePath("/admin/conversions")
    return ok("Conversion created")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function updateConversion(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(schema, fd)
  if (error) return error
  try {
    await prisma.unitConversion.update({ where: { id: Number(data.id) }, data: { ...toData(data), updatedBy: user.id } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.UPDATE, entityType: "UnitConversion", entityId: data.id, changes: toData(data) })
    revalidatePath("/admin/conversions")
    return ok("Conversion updated")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function deleteConversion(id: number): Promise<ActionState> {
  const user = await guard(CAP)
  try {
    await prisma.unitConversion.delete({ where: { id } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.DELETE, entityType: "UnitConversion", entityId: id })
    revalidatePath("/admin/conversions")
    return ok("Conversion deleted")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}
