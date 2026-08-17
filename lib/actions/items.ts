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
import { AUDIT_ACTIONS, UNITS_OF_MEASURE } from "@/lib/constants"
import { nextItemId } from "@/lib/items/item-id"

const PATH = "/admin/items"

// Commodity, category, sub-category, country of origin and unit are all
// required:
// the first two build the item id, and the unit is inherited by every quantity
// entered for the item later on. `legacyFamousId` is intentionally absent — it
// only ever comes from the initial data upload, never from this form.
const baseSchema = z.object({
  itemName: z.string().trim().min(1, "Name is required"),
  commodityCode: z.string().trim().min(1, "Commodity is required"),
  materialCategoryCode: z.string().trim().min(1, "Category is required"),
  subCategoryId: z.string().trim().min(1, "Sub-category is required"),
  countryOfOriginId: z.string().trim().min(1, "Country of origin is required"),
  unitOfMeasure: z
    .string()
    .trim()
    .min(1, "Unit of measure is required")
    .refine(
      (u) => (UNITS_OF_MEASURE as readonly string[]).includes(u),
      "Unknown unit of measure"
    ),
  applicationMethod: z.string().trim().optional().default(""),
  status: z.string().trim().min(1, "Status is required"),
  notes: z.string().trim().optional().default(""),
  // Comma-joined id lists from the mapping multi-selects.
  growerIds: z.string().trim().optional().default(""),
  vendorIds: z.string().trim().optional().default(""),
})

// Create posts no id (it is generated); update posts the immutable PK.
const createSchema = baseSchema
const updateSchema = baseSchema.extend({
  id: z.string().trim().min(1, "Item ID is missing"),
})

type ItemInput = z.infer<typeof baseSchema>

function toData(d: ItemInput) {
  return {
    itemName: d.itemName,
    commodityCode: d.commodityCode,
    materialCategoryCode: d.materialCategoryCode,
    subCategoryId: Number(d.subCategoryId),
    countryOfOriginId: Number(d.countryOfOriginId),
    unitOfMeasure: d.unitOfMeasure,
    applicationMethod: d.applicationMethod || null,
    status: d.status,
    notes: d.notes || null,
  }
}

/** The sub-category dropdown is filtered client-side; re-check it server-side. */
async function subCategoryMismatch(d: ItemInput): Promise<ActionState | null> {
  const sub = await prisma.subCategory.findUnique({
    where: { id: Number(d.subCategoryId) },
    select: { materialCategoryCode: true },
  })
  if (!sub) return fail("Please fix the highlighted fields.", { subCategoryId: ["Sub-category not found"] })
  if (sub.materialCategoryCode !== d.materialCategoryCode)
    return fail("Please fix the highlighted fields.", {
      subCategoryId: ["This sub-category belongs to a different category"],
    })
  return null
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
  const { data, error } = parseForm(createSchema, fd)
  if (error) return error
  const mismatch = await subCategoryMismatch(data)
  if (mismatch) return mismatch

  // The id is derived from commodity+category+sequence. Two admins creating an
  // item at the same instant can compute the same sequence, so a duplicate-key
  // collision just means "recompute and try again".
  let lastError: unknown = null
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const id = await prisma.$transaction(async (tx) => {
        const generated = await nextItemId(tx, data.commodityCode, data.materialCategoryCode)
        await tx.item.create({
          data: { id: generated, ...toData(data), createdBy: user.id, updatedBy: user.id },
        })
        await syncItemMappings(tx, generated, parseIds(data.growerIds), parseIds(data.vendorIds), user.id)
        return generated
      })
      await recordAudit({
        userId: user.id,
        action: AUDIT_ACTIONS.CREATE,
        entityType: "Item",
        entityId: id,
        changes: toData(data),
      })
      revalidatePath(PATH)
      return ok(`Item ${id} created`)
    } catch (e) {
      lastError = e
      if ((e as { code?: string })?.code !== "P2002") break
    }
  }
  return fail(prismaErrorMessage(lastError))
}

export async function updateItem(
  _prev: ActionState,
  fd: FormData
): Promise<ActionState> {
  const user = await guard(CAPABILITIES.MANAGE_MASTER_DATA)
  const { data, error } = parseForm(updateSchema, fd)
  if (error) return error
  const mismatch = await subCategoryMismatch(data)
  if (mismatch) return mismatch
  try {
    // The id is never re-derived on edit — history rows point at it.
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
