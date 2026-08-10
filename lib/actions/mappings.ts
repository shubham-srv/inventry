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
const PATH = "/admin/mappings/vendors"

const createSchema = z.object({
  vendorId: z.string().trim().min(1, "Vendor is required"),
  // Posted by the multiselect field as a comma-joined string of item ids.
  itemIds: z.string().trim().min(1, "At least one item is required"),
})

export async function createItemVendor(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(createSchema, fd)
  if (error) return error
  const vendorId = Number(data.vendorId)
  const itemIds = [...new Set(data.itemIds.split(",").map((s) => s.trim()).filter(Boolean))]
  if (itemIds.length === 0) return fail("At least one item is required")
  try {
    await prisma.$transaction(
      itemIds.map((itemId) =>
        prisma.itemVendor.upsert({
          where: { vendorId_itemId: { vendorId, itemId } },
          update: { isActive: true, updatedBy: user.id },
          create: { vendorId, itemId, isActive: true, createdBy: user.id, updatedBy: user.id },
        })
      )
    )
    await recordAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.CREATE,
      entityType: "ItemVendor",
      entityId: `${vendorId}:${itemIds.join("+")}`,
      changes: { vendorId, itemIds },
    })
    revalidatePath(PATH)
    return ok(itemIds.length === 1 ? "Item mapped" : `${itemIds.length} items mapped`)
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function setItemVendorActive(id: number, active: boolean): Promise<ActionState> {
  const user = await guard(CAP)
  try {
    await prisma.itemVendor.update({ where: { id }, data: { isActive: active, updatedBy: user.id } })
    await recordAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: "ItemVendor",
      entityId: id,
      changes: { isActive: active },
    })
    revalidatePath(PATH)
    return ok(active ? "Mapping activated" : "Mapping deactivated")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function deleteItemVendor(id: number): Promise<ActionState> {
  const user = await guard(CAP)
  try {
    // Pack ratios cascade with the mapping.
    await prisma.itemVendor.delete({ where: { id } })
    await recordAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.DELETE,
      entityType: "ItemVendor",
      entityId: id,
    })
    revalidatePath(PATH)
    return ok("Mapping removed")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

/**
 * Assign a packaging chain to a vendor↔item mapping and record the ratios.
 *
 * Ratios post as one comma-separated field ("10, 5"), positionally matching the
 * chain's levels innermost-first — the same shape the chain editor uses. Passing
 * an empty chain clears the packaging setup entirely, which returns the mapping
 * to plain-units ordering.
 */
const packagingSchema = z.object({
  id: z.string().trim().min(1),
  packagingChainId: z.string().trim().optional().default(""),
  ratios: z.string().trim().optional().default(""),
  shipsInLevel: z.string().trim().optional().default("0"),
})

export async function setItemVendorPackaging(
  _p: ActionState,
  fd: FormData
): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(packagingSchema, fd)
  if (error) return error
  const id = Number(data.id)
  if (!id) return fail("Missing mapping id.")

  const mapping = await prisma.itemVendor.findUnique({
    where: { id },
    include: { item: { select: { unitOfMeasure: true } } },
  })
  if (!mapping) return fail("Mapping not found.")

  // Clearing packaging: drop the chain and every ratio.
  if (!data.packagingChainId || data.packagingChainId === "none") {
    try {
      await prisma.$transaction([
        prisma.vendorPackRatio.deleteMany({ where: { itemVendorId: id } }),
        prisma.itemVendor.update({
          where: { id },
          data: { packagingChainId: null, shipsInLevel: 0, updatedBy: user.id },
        }),
      ])
      revalidatePath(PATH)
      return ok("Packaging cleared")
    } catch (e) {
      return fail(prismaErrorMessage(e))
    }
  }

  const chainId = Number(data.packagingChainId)
  const chain = await prisma.packagingChain.findUnique({
    where: { id: chainId },
    include: { levels: { orderBy: { level: "asc" } } },
  })
  if (!chain) return fail("Packaging chain not found.")

  // The chain's base unit must match the item's own unit, otherwise the maths
  // would silently convert between unrelated units.
  if (mapping.item.unitOfMeasure && chain.baseUnit !== mapping.item.unitOfMeasure)
    return fail(
      `That chain starts from ${chain.baseUnit}, but this item is measured in ${mapping.item.unitOfMeasure}.`
    )

  const ratios = data.ratios
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
  if (ratios.length !== chain.levels.length)
    return fail(
      `This chain has ${chain.levels.length} level(s) (${chain.levels.map((l) => l.unitName).join(", ")}) — enter ${chain.levels.length} quantit${chain.levels.length === 1 ? "y" : "ies"}.`
    )
  if (ratios.some((n) => !Number.isInteger(n) || n < 1))
    return fail("Each quantity must be a whole number of 1 or more.")

  const shipsInLevel = Number(data.shipsInLevel) || 0
  if (shipsInLevel < 0 || shipsInLevel > chain.levels.length)
    return fail("Ships-in level is outside this chain.")

  try {
    await prisma.$transaction([
      prisma.vendorPackRatio.deleteMany({ where: { itemVendorId: id } }),
      prisma.itemVendor.update({
        where: { id },
        data: {
          packagingChainId: chainId,
          shipsInLevel,
          updatedBy: user.id,
          packRatios: {
            create: ratios.map((perParent, i) => ({
              level: i + 1,
              perParent,
              createdBy: user.id,
              updatedBy: user.id,
            })),
          },
        },
      }),
    ])
    await recordAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: "ItemVendor",
      entityId: id,
      changes: { packagingChainId: chainId, ratios, shipsInLevel },
    })
    revalidatePath(PATH)
    return ok("Packaging saved")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}
