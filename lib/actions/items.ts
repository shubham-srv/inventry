"use server"

import { revalidatePath } from "next/cache"
import { type Prisma } from "@prisma/client"
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

const PATH = "/admin/items"

const schema = z.object({
  id: z.string().trim().min(3, "Item ID is required (e.g. AP-BX-00001)"),
  itemName: z.string().trim().min(1, "Name is required"),
  commodityCode: z.string().trim().optional().default(""),
  materialCategoryCode: z.string().trim().optional().default(""),
  subCategoryId: z.string().trim().optional().default(""),
  countryOfOriginId: z.string().trim().optional().default(""),
  applicationMethod: z.string().trim().optional().default(""),
  status: z.string().trim().min(1, "Status is required"),
  region: z.string().trim().optional().default(""),
  legacyFamousId: z.string().trim().optional().default(""),
  notes: z.string().trim().optional().default(""),
  // Comma-joined id lists from the mapping multi-selects.
  growerIds: z.string().trim().optional().default(""),
  vendorIds: z.string().trim().optional().default(""),
})

type ItemInput = z.infer<typeof schema>

function toData(d: ItemInput) {
  return {
    itemName: d.itemName,
    commodityCode: d.commodityCode || null,
    materialCategoryCode: d.materialCategoryCode || null,
    subCategoryId: d.subCategoryId ? Number(d.subCategoryId) : null,
    countryOfOriginId: d.countryOfOriginId ? Number(d.countryOfOriginId) : null,
    applicationMethod: d.applicationMethod || null,
    status: d.status,
    region: d.region || null,
    legacyFamousId: d.legacyFamousId || null,
    notes: d.notes || null,
  }
}

const parseIds = (s?: string): number[] =>
  (s ?? "")
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)

/**
 * Reconcile an item's grower authorizations and vendor mappings to match the
 * selected id lists. Selected rows are (re)activated via upsert; previously
 * active rows that are no longer selected are deactivated (kept for history).
 */
async function syncItemMappings(
  tx: Prisma.TransactionClient,
  itemId: string,
  growerIds: number[],
  vendorIds: number[],
  userId: number
) {
  const wantGrowers = new Set(growerIds)
  const existingAuths = await tx.growerItemAuthorization.findMany({ where: { itemId } })
  for (const growerId of wantGrowers) {
    await tx.growerItemAuthorization.upsert({
      where: { growerId_itemId: { growerId, itemId } },
      update: { isActive: true, updatedBy: userId },
      create: { growerId, itemId, isActive: true, createdBy: userId, updatedBy: userId },
    })
  }
  for (const a of existingAuths) {
    if (a.isActive && !wantGrowers.has(a.growerId)) {
      await tx.growerItemAuthorization.update({
        where: { id: a.id },
        data: { isActive: false, updatedBy: userId },
      })
    }
  }

  const wantVendors = new Set(vendorIds)
  const existingVendors = await tx.itemVendor.findMany({ where: { itemId } })
  for (const vendorId of wantVendors) {
    await tx.itemVendor.upsert({
      where: { vendorId_itemId: { vendorId, itemId } },
      update: { isActive: true, updatedBy: userId },
      create: { vendorId, itemId, isActive: true, createdBy: userId, updatedBy: userId },
    })
  }
  for (const iv of existingVendors) {
    if (iv.isActive && !wantVendors.has(iv.vendorId)) {
      await tx.itemVendor.update({
        where: { id: iv.id },
        data: { isActive: false, updatedBy: userId },
      })
    }
  }
}

export async function createItem(
  _prev: ActionState,
  fd: FormData
): Promise<ActionState> {
  const user = await guard(CAPABILITIES.MANAGE_MASTER_DATA)
  const { data, error } = parseForm(schema, fd)
  if (error) return error
  const id = data.id.trim().toUpperCase()
  try {
    await prisma.$transaction(async (tx) => {
      await tx.item.create({
        data: { id, ...toData(data), createdBy: user.id, updatedBy: user.id },
      })
      await syncItemMappings(tx, id, parseIds(data.growerIds), parseIds(data.vendorIds), user.id)
    })
    await recordAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.CREATE,
      entityType: "Item",
      entityId: id,
      changes: toData(data),
    })
    revalidatePath(PATH)
    return ok("Item created")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function updateItem(
  _prev: ActionState,
  fd: FormData
): Promise<ActionState> {
  const user = await guard(CAPABILITIES.MANAGE_MASTER_DATA)
  const { data, error } = parseForm(schema, fd)
  if (error) return error
  try {
    await prisma.$transaction(async (tx) => {
      await tx.item.update({
        where: { id: data.id },
        data: { ...toData(data), updatedBy: user.id },
      })
      await syncItemMappings(tx, data.id, parseIds(data.growerIds), parseIds(data.vendorIds), user.id)
    })
    await recordAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: "Item",
      entityId: data.id,
      changes: toData(data),
    })
    revalidatePath(PATH)
    return ok("Item updated")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function deleteItem(id: string): Promise<ActionState> {
  const user = await guard(CAPABILITIES.MANAGE_MASTER_DATA)
  try {
    await prisma.item.delete({ where: { id } })
    await recordAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.DELETE,
      entityType: "Item",
      entityId: id,
    })
    revalidatePath(PATH)
    return ok("Item deleted")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}
