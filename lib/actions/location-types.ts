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
import { AUDIT_ACTIONS, LOCATION_APPLIES_TO } from "@/lib/constants"

const PATH = "/admin/location-types"
const CAP = CAPABILITIES.MANAGE_MASTER_DATA

const schema = z.object({
  id: z.string().trim().optional().default(""),
  name: z.string().trim().min(1, "Name is required").max(100),
  appliesTo: z.enum(LOCATION_APPLIES_TO),
  sortOrder: z.coerce.number().int().min(0).max(999).optional().default(0),
  isActive: z.string().trim().optional().default("true"),
})

function toData(d: z.infer<typeof schema>) {
  return {
    name: d.name,
    appliesTo: d.appliesTo,
    sortOrder: d.sortOrder,
    isActive: d.isActive === "true",
  }
}

export async function createLocationType(
  _p: ActionState,
  fd: FormData
): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(schema, fd)
  if (error) return error
  try {
    const created = await prisma.locationType.create({
      data: { ...toData(data), createdBy: user.id, updatedBy: user.id },
    })
    await recordAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.CREATE,
      entityType: "LocationType",
      entityId: created.id,
      changes: toData(data),
    })
    revalidatePath(PATH)
    revalidatePath("/admin/locations")
    return ok("Location type created")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function updateLocationType(
  _p: ActionState,
  fd: FormData
): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(schema, fd)
  if (error) return error
  const id = Number(data.id)
  if (!id) return fail("Location type not found.")

  try {
    await prisma.locationType.update({
      where: { id },
      data: { ...toData(data), updatedBy: user.id },
    })
    await recordAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: "LocationType",
      entityId: id,
      changes: toData(data),
    })
    // Sites show their type's name, so the change reaches further than this page.
    revalidatePath(PATH)
    revalidatePath("/admin/locations")
    revalidatePath("/admin/growers")
    revalidatePath("/admin/vendors")
    return ok("Location type updated")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

/**
 * Deleting is only allowed while nothing points at the type.
 *
 * The database would refuse anyway — the foreign key is NO ACTION — but the
 * resulting error says nothing useful. Counting first lets us say how many sites
 * are in the way and what to do instead, which is almost always "deactivate it":
 * that removes it from the picker for new sites without disturbing the ones
 * already using it.
 */
export async function deleteLocationType(id: number): Promise<ActionState> {
  const user = await guard(CAP)
  try {
    const inUse = await prisma.location.count({ where: { locationTypeId: id } })
    if (inUse > 0) {
      return fail(
        `${inUse} location${inUse === 1 ? " is" : "s are"} using this type. Deactivate it instead — existing sites keep working and it stops being offered for new ones.`
      )
    }
    await prisma.locationType.delete({ where: { id } })
    await recordAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.DELETE,
      entityType: "LocationType",
      entityId: id,
    })
    revalidatePath(PATH)
    revalidatePath("/admin/locations")
    return ok("Location type deleted")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}
