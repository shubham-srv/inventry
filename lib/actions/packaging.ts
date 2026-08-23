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

/**
 * Packaging chains describe HOW a SKU is packed for shipping — "Bags → Boxes →
 * Cases" — and carry no numbers. The per-vendor ratios live on the vendor↔item
 * mapping (see lib/actions/mappings.ts).
 *
 * Levels are entered as one comma-separated field, innermost first, because the
 * shared EntityFormDialog is flat-field based and a chain is only ever two or
 * three levels deep. They are stored as ordered PackagingChainLevel rows.
 */
const chainSchema = z.object({
  id: z.string().trim().optional().default(""),
  materialCategoryCode: z.string().trim().min(1, "Category is required"),
  name: z.string().trim().min(1, "Name is required"),
  levels: z.string().trim().min(1, "Add at least one packaging level"),
})

/**
 * A chain starts from its material category — that is what level 0 is labelled
 * with, so a packaging level of the same name would produce "Boxes → Boxes".
 * Returns an error message, or null when the levels are fine.
 */
async function levelNameClash(
  materialCategoryCode: string,
  levels: string[]
): Promise<string | null> {
  const category = await prisma.materialCategory.findUnique({
    where: { code: materialCategoryCode },
    select: { name: true },
  })
  if (!category) return "That material category no longer exists."
  const base = category.name.trim().toLowerCase()
  return levels.some((l) => l.toLowerCase() === base)
    ? `A packaging level cannot repeat the category it starts from ("${category.name}").`
    : null
}

/** "Boxes, Cases" -> ["Boxes", "Cases"], trimmed and de-duplicated. */
function parseLevels(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(",")) {
    const name = part.trim()
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    out.push(name)
  }
  return out
}

export async function createPackagingChain(
  _p: ActionState,
  fd: FormData
): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(chainSchema, fd)
  if (error) return error
  const levels = parseLevels(data.levels)
  if (levels.length === 0) return fail("Add at least one packaging level.")
  const clash = await levelNameClash(data.materialCategoryCode, levels)
  if (clash) return fail(clash)

  try {
    const chain = await prisma.packagingChain.create({
      data: {
        materialCategoryCode: data.materialCategoryCode,
        name: data.name,
        createdBy: user.id,
        updatedBy: user.id,
        levels: { create: levels.map((unitName, i) => ({ level: i + 1, unitName })) },
      },
    })
    await recordAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.CREATE,
      entityType: "PackagingChain",
      entityId: String(chain.id),
      changes: { ...data, levels },
    })
    revalidatePath("/admin/packaging")
    return ok("Packaging chain created")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function updatePackagingChain(
  _p: ActionState,
  fd: FormData
): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(chainSchema, fd)
  if (error) return error
  const id = Number(data.id)
  if (!id) return fail("Missing chain id.")
  const levels = parseLevels(data.levels)
  if (levels.length === 0) return fail("Add at least one packaging level.")
  const clash = await levelNameClash(data.materialCategoryCode, levels)
  if (clash) return fail(clash)

  // Vendors store one ratio per level. Shortening a chain would orphan ratios
  // for levels that no longer exist, and shift the meaning of the rest, so
  // refuse rather than silently corrupting existing pack maths.
  const inUse = await prisma.itemVendor.count({ where: { packagingChainId: id } })
  const current = await prisma.packagingChainLevel.count({ where: { chainId: id } })
  if (inUse > 0 && levels.length !== current)
    return fail(
      `This chain is used by ${inUse} vendor mapping(s); its number of levels cannot change. Unassign it first, or create a new chain.`
    )

  try {
    // Replace levels wholesale — simplest correct edit for a 2–3 row list.
    await prisma.$transaction([
      prisma.packagingChainLevel.deleteMany({ where: { chainId: id } }),
      prisma.packagingChain.update({
        where: { id },
        data: {
          materialCategoryCode: data.materialCategoryCode,
          name: data.name,
          updatedBy: user.id,
          levels: { create: levels.map((unitName, i) => ({ level: i + 1, unitName })) },
        },
      }),
    ])
    await recordAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: "PackagingChain",
      entityId: String(id),
      changes: { ...data, levels },
    })
    revalidatePath("/admin/packaging")
    return ok("Packaging chain updated")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function deletePackagingChain(id: number): Promise<ActionState> {
  const user = await guard(CAP)
  const inUse = await prisma.itemVendor.count({ where: { packagingChainId: id } })
  if (inUse > 0)
    return fail(`Used by ${inUse} vendor mapping(s) — unassign it there first.`)
  try {
    // Levels cascade with the chain.
    await prisma.packagingChain.delete({ where: { id } })
    await recordAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.DELETE,
      entityType: "PackagingChain",
      entityId: String(id),
    })
    revalidatePath("/admin/packaging")
    return ok("Packaging chain deleted")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}
