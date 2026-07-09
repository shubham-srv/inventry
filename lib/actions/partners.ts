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

const CAP = CAPABILITIES.MANAGE_GROWERS_VENDORS

// Item ids are strings (e.g. "AP-BX-00001") posted comma-joined from the
// mapping multi-select.
const parseItemIds = (s?: string): string[] =>
  (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)

/**
 * Reconcile a grower's item authorizations to match the selected item ids.
 * Selected rows are (re)activated via upsert; previously active rows no longer
 * selected are deactivated (kept for history). Mirrors syncItemMappings in
 * lib/actions/items.ts, from the grower side.
 */
async function syncGrowerItems(
  tx: Prisma.TransactionClient,
  growerId: number,
  itemIds: string[],
  userId: number
) {
  const want = new Set(itemIds)
  const existing = await tx.growerItemAuthorization.findMany({ where: { growerId } })
  for (const itemId of want) {
    await tx.growerItemAuthorization.upsert({
      where: { growerId_itemId: { growerId, itemId } },
      update: { isActive: true, updatedBy: userId },
      create: { growerId, itemId, isActive: true, createdBy: userId, updatedBy: userId },
    })
  }
  for (const a of existing) {
    if (a.isActive && !want.has(a.itemId)) {
      await tx.growerItemAuthorization.update({
        where: { id: a.id },
        data: { isActive: false, updatedBy: userId },
      })
    }
  }
}

/** Reconcile a vendor's item mappings (which items it can supply). */
async function syncVendorItems(
  tx: Prisma.TransactionClient,
  vendorId: number,
  itemIds: string[],
  userId: number
) {
  const want = new Set(itemIds)
  const existing = await tx.itemVendor.findMany({ where: { vendorId } })
  for (const itemId of want) {
    await tx.itemVendor.upsert({
      where: { vendorId_itemId: { vendorId, itemId } },
      update: { isActive: true, updatedBy: userId },
      create: { vendorId, itemId, isActive: true, createdBy: userId, updatedBy: userId },
    })
  }
  for (const iv of existing) {
    if (iv.isActive && !want.has(iv.itemId)) {
      await tx.itemVendor.update({
        where: { id: iv.id },
        data: { isActive: false, updatedBy: userId },
      })
    }
  }
}

/** Reconcile a vendor's material-category mappings (which categories it supplies). */
async function syncVendorMaterialCategories(
  tx: Prisma.TransactionClient,
  vendorId: number,
  codes: string[],
  userId: number
) {
  const want = new Set(codes)
  const existing = await tx.vendorMaterialCategory.findMany({ where: { vendorId } })
  for (const materialCategoryCode of want) {
    await tx.vendorMaterialCategory.upsert({
      where: { vendorId_materialCategoryCode: { vendorId, materialCategoryCode } },
      update: { isActive: true, updatedBy: userId },
      create: { vendorId, materialCategoryCode, isActive: true, createdBy: userId, updatedBy: userId },
    })
  }
  for (const vmc of existing) {
    if (vmc.isActive && !want.has(vmc.materialCategoryCode)) {
      await tx.vendorMaterialCategory.update({
        where: { id: vmc.id },
        data: { isActive: false, updatedBy: userId },
      })
    }
  }
}

// ---------------- Growers ----------------
const growerSchema = z.object({
  id: z.string().trim().optional().default(""),
  growerName: z.string().trim().min(1, "Name is required"),
  primaryEmail: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  status: z.string().trim().min(1),
  // Comma-joined item ids from the mapping multi-select.
  itemIds: z.string().trim().optional().default(""),
})

export async function createGrower(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(growerSchema, fd)
  if (error) return error
  try {
    const created = await prisma.$transaction(async (tx) => {
      const grower = await tx.grower.create({
        data: { growerName: data.growerName, primaryEmail: data.primaryEmail || null, status: data.status, createdBy: user.id, updatedBy: user.id },
      })
      await syncGrowerItems(tx, grower.id, parseItemIds(data.itemIds), user.id)
      return grower
    })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.CREATE, entityType: "Grower", entityId: created.id, changes: data })
    revalidatePath("/admin/growers")
    return ok("Grower created")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function updateGrower(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(growerSchema, fd)
  if (error) return error
  try {
    const growerId = Number(data.id)
    await prisma.$transaction(async (tx) => {
      await tx.grower.update({
        where: { id: growerId },
        data: { growerName: data.growerName, primaryEmail: data.primaryEmail || null, status: data.status, updatedBy: user.id },
      })
      await syncGrowerItems(tx, growerId, parseItemIds(data.itemIds), user.id)
    })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.UPDATE, entityType: "Grower", entityId: data.id, changes: data })
    revalidatePath("/admin/growers")
    return ok("Grower updated")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function deleteGrower(id: number): Promise<ActionState> {
  const user = await guard(CAP)
  try {
    await prisma.grower.delete({ where: { id } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.DELETE, entityType: "Grower", entityId: id })
    revalidatePath("/admin/growers")
    return ok("Grower deleted")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

// ---------------- Vendors ----------------
const vendorSchema = z.object({
  id: z.string().trim().optional().default(""),
  vendorName: z.string().trim().min(1, "Name is required"),
  vendorType: z.string().trim().optional().default(""),
  region: z.string().trim().optional().default(""),
  country: z.string().trim().optional().default(""),
  primaryContact: z.string().trim().optional().default(""),
  contactEmail: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  contactPhone: z.string().trim().optional().default(""),
  leadTime: z.string().trim().optional().default(""),
  paymentTerms: z.string().trim().optional().default(""),
  ptAccountNumber: z.string().trim().optional().default(""),
  notes: z.string().trim().optional().default(""),
  status: z.string().trim().min(1),
  // Comma-joined item ids the vendor can supply.
  itemIds: z.string().trim().optional().default(""),
  // Comma-joined material-category codes the vendor supplies.
  materialCategoryCodes: z.string().trim().optional().default(""),
})

type VendorInput = z.infer<typeof vendorSchema>
function vendorData(d: VendorInput) {
  return {
    vendorName: d.vendorName,
    vendorType: d.vendorType || null,
    region: d.region || null,
    country: d.country || null,
    primaryContact: d.primaryContact || null,
    contactEmail: d.contactEmail || null,
    contactPhone: d.contactPhone || null,
    leadTime: d.leadTime || null,
    paymentTerms: d.paymentTerms || null,
    ptAccountNumber: d.ptAccountNumber || null,
    notes: d.notes || null,
    status: d.status,
  }
}

export async function createVendor(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(vendorSchema, fd)
  if (error) return error
  try {
    const created = await prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.create({ data: { ...vendorData(data), createdBy: user.id, updatedBy: user.id } })
      await syncVendorItems(tx, vendor.id, parseItemIds(data.itemIds), user.id)
      await syncVendorMaterialCategories(tx, vendor.id, parseItemIds(data.materialCategoryCodes), user.id)
      return vendor
    })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.CREATE, entityType: "Vendor", entityId: created.id, changes: vendorData(data) })
    revalidatePath("/admin/vendors")
    return ok("Vendor created")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function updateVendor(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(vendorSchema, fd)
  if (error) return error
  try {
    const vendorId = Number(data.id)
    await prisma.$transaction(async (tx) => {
      await tx.vendor.update({ where: { id: vendorId }, data: { ...vendorData(data), updatedBy: user.id } })
      await syncVendorItems(tx, vendorId, parseItemIds(data.itemIds), user.id)
      await syncVendorMaterialCategories(tx, vendorId, parseItemIds(data.materialCategoryCodes), user.id)
    })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.UPDATE, entityType: "Vendor", entityId: data.id, changes: vendorData(data) })
    revalidatePath("/admin/vendors")
    return ok("Vendor updated")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function deleteVendor(id: number): Promise<ActionState> {
  const user = await guard(CAP)
  try {
    await prisma.vendor.delete({ where: { id } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.DELETE, entityType: "Vendor", entityId: id })
    revalidatePath("/admin/vendors")
    return ok("Vendor deleted")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}
