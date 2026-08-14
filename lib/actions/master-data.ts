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

const CAP = CAPABILITIES.MANAGE_MASTER_DATA

// ---------------- Commodities ----------------
const commoditySchema = z.object({
  code: z.string().trim().min(1, "Code is required").max(8),
  name: z.string().trim().min(1, "Name is required"),
})

export async function createCommodity(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(commoditySchema, fd)
  if (error) return error
  const code = data.code.toUpperCase()
  try {
    await prisma.commodity.create({ data: { code, name: data.name, createdBy: user.id, updatedBy: user.id } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.CREATE, entityType: "Commodity", entityId: code, changes: data })
    revalidatePath("/admin/commodities")
    return ok("Commodity created")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function updateCommodity(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(commoditySchema, fd)
  if (error) return error
  try {
    await prisma.commodity.update({ where: { code: data.code }, data: { name: data.name, updatedBy: user.id } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.UPDATE, entityType: "Commodity", entityId: data.code, changes: data })
    revalidatePath("/admin/commodities")
    return ok("Commodity updated")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function deleteCommodity(code: string): Promise<ActionState> {
  const user = await guard(CAP)
  try {
    await prisma.commodity.delete({ where: { code } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.DELETE, entityType: "Commodity", entityId: code })
    revalidatePath("/admin/commodities")
    return ok("Commodity deleted")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

// ---------------- Material Categories ----------------
const categorySchema = z.object({
  code: z.string().trim().min(1, "Code is required").max(8),
  name: z.string().trim().min(1, "Name is required"),
})

export async function createCategory(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(categorySchema, fd)
  if (error) return error
  const code = data.code.toUpperCase()
  try {
    await prisma.materialCategory.create({ data: { code, name: data.name, createdBy: user.id, updatedBy: user.id } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.CREATE, entityType: "MaterialCategory", entityId: code, changes: data })
    revalidatePath("/admin/categories")
    return ok("Category created")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function updateCategory(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(categorySchema, fd)
  if (error) return error
  try {
    await prisma.materialCategory.update({ where: { code: data.code }, data: { name: data.name, updatedBy: user.id } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.UPDATE, entityType: "MaterialCategory", entityId: data.code, changes: data })
    revalidatePath("/admin/categories")
    return ok("Category updated")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function deleteCategory(code: string): Promise<ActionState> {
  const user = await guard(CAP)
  try {
    await prisma.materialCategory.delete({ where: { code } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.DELETE, entityType: "MaterialCategory", entityId: code })
    revalidatePath("/admin/categories")
    return ok("Category deleted")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

// ---------------- Sub-categories ----------------
const subCategorySchema = z.object({
  id: z.string().trim().optional().default(""),
  materialCategoryCode: z.string().trim().min(1, "Category is required"),
  name: z.string().trim().min(1, "Name is required"),
})

export async function createSubCategory(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(subCategorySchema, fd)
  if (error) return error
  try {
    const created = await prisma.subCategory.create({
      data: { materialCategoryCode: data.materialCategoryCode, name: data.name, createdBy: user.id, updatedBy: user.id },
    })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.CREATE, entityType: "SubCategory", entityId: created.id, changes: data })
    revalidatePath("/admin/sub-categories")
    return ok("Sub-category created")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function updateSubCategory(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(subCategorySchema, fd)
  if (error) return error
  try {
    await prisma.subCategory.update({
      where: { id: Number(data.id) },
      data: { materialCategoryCode: data.materialCategoryCode, name: data.name, updatedBy: user.id },
    })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.UPDATE, entityType: "SubCategory", entityId: data.id, changes: data })
    revalidatePath("/admin/sub-categories")
    return ok("Sub-category updated")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function deleteSubCategory(id: number): Promise<ActionState> {
  const user = await guard(CAP)
  try {
    await prisma.subCategory.delete({ where: { id } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.DELETE, entityType: "SubCategory", entityId: id })
    revalidatePath("/admin/sub-categories")
    return ok("Sub-category deleted")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

// ---------------- Countries ----------------
const countrySchema = z.object({
  id: z.string().trim().optional().default(""),
  name: z.string().trim().min(1, "Name is required"),
  // Placeholder rows like "N/A" are valid as an item's origin but must not
  // appear in location / vendor / supply-to pickers. Defaults to selectable:
  // a country typed in by hand is a real one.
  isSelectable: z.string().trim().optional().default("true"),
})

export async function createCountry(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(countrySchema, fd)
  if (error) return error
  try {
    const created = await prisma.country.create({
      data: {
        name: data.name,
        isSelectable: data.isSelectable !== "false",
        createdBy: user.id,
        updatedBy: user.id,
      },
    })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.CREATE, entityType: "Country", entityId: created.id, changes: data })
    revalidatePath("/admin/countries")
    return ok("Country created")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function updateCountry(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(countrySchema, fd)
  if (error) return error
  try {
    await prisma.country.update({
      where: { id: Number(data.id) },
      data: {
        name: data.name,
        isSelectable: data.isSelectable !== "false",
        updatedBy: user.id,
      },
    })
    revalidatePath("/admin/locations")
    revalidatePath("/admin/vendors")
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.UPDATE, entityType: "Country", entityId: data.id, changes: data })
    revalidatePath("/admin/countries")
    revalidatePath("/admin/items")
    return ok("Country updated")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function deleteCountry(id: number): Promise<ActionState> {
  const user = await guard(CAP)
  // Four things now hold a country FK, not just items. Each would block the
  // delete anyway; counting first turns a raw constraint error into a message
  // that says which screen to go and fix.
  const [items, locations, vendors, supplyLinks] = await Promise.all([
    prisma.item.count({ where: { countryOfOriginId: id } }),
    prisma.location.count({ where: { countryId: id } }),
    prisma.vendor.count({ where: { countryId: id } }),
    prisma.vendorCountry.count({ where: { countryId: id } }),
  ])
  const used = [
    items && `${items} item(s)`,
    locations && `${locations} location(s)`,
    vendors && `${vendors} vendor(s)`,
    supplyLinks && `${supplyLinks} vendor supply list(s)`,
  ].filter(Boolean)
  if (used.length > 0)
    return fail(
      `This country is used by ${used.join(", ")}. Change those first, then delete it.`
    )
  try {
    await prisma.country.delete({ where: { id } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.DELETE, entityType: "Country", entityId: id })
    revalidatePath("/admin/countries")
    return ok("Country deleted")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

// ---------------- Locations ----------------
const locationSchema = z.object({
  id: z.string().trim().optional().default(""),
  locationName: z.string().trim().min(1, "Name is required"),
  locationType: z.string().trim().optional().default(""),
  regionId: z.string().trim().optional().default(""),
  countryId: z.string().trim().optional().default(""),
  commodityFocus: z.string().trim().optional().default(""),
  keyPersonnel: z.string().trim().optional().default(""),
  notes: z.string().trim().optional().default(""),
})

type LocationInput = z.infer<typeof locationSchema>
function locationData(d: LocationInput) {
  return {
    locationName: d.locationName,
    locationType: d.locationType || null,
    regionId: d.regionId ? Number(d.regionId) : null,
    countryId: d.countryId ? Number(d.countryId) : null,
    commodityFocus: d.commodityFocus || null,
    keyPersonnel: d.keyPersonnel || null,
    notes: d.notes || null,
  }
}

export async function createLocation(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(locationSchema, fd)
  if (error) return error
  try {
    const created = await prisma.location.create({ data: { ...locationData(data), createdBy: user.id, updatedBy: user.id } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.CREATE, entityType: "Location", entityId: created.id, changes: locationData(data) })
    revalidatePath("/admin/locations")
    return ok("Location created")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function updateLocation(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(locationSchema, fd)
  if (error) return error
  try {
    await prisma.location.update({ where: { id: Number(data.id) }, data: { ...locationData(data), updatedBy: user.id } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.UPDATE, entityType: "Location", entityId: data.id, changes: locationData(data) })
    revalidatePath("/admin/locations")
    return ok("Location updated")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function deleteLocation(id: number): Promise<ActionState> {
  const user = await guard(CAP)
  try {
    await prisma.location.delete({ where: { id } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.DELETE, entityType: "Location", entityId: id })
    revalidatePath("/admin/locations")
    return ok("Location deleted")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}
