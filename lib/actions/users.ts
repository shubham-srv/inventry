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
import { AUDIT_ACTIONS, ROLES } from "@/lib/constants"

const CAP = CAPABILITIES.MANAGE_USERS
const PATH = "/admin/users"

const schema = z.object({
  id: z.string().trim().optional().default(""),
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z.string().trim().email("Enter a valid email"),
  roleId: z.string().trim().min(1, "Role is required"),
  growerId: z.string().trim().optional().default(""),
  vendorId: z.string().trim().optional().default(""),
  isActive: z.string().trim().optional().default("true"),
})

type UserInput = z.infer<typeof schema>

type Mapping =
  | { ok: true; growerId: number | null; vendorId: number | null }
  | { ok: false; error: ActionState }

/** Resolve grower/vendor mapping consistently with the chosen role. */
async function resolveMapping(d: UserInput): Promise<Mapping> {
  const role = await prisma.role.findUnique({ where: { id: Number(d.roleId) } })
  if (!role) return { ok: false, error: fail("Invalid role selected.") }

  if (role.roleName === ROLES.GROWER_USER) {
    if (!d.growerId)
      return { ok: false, error: fail("Select a grower for grower users.", { growerId: ["Required for grower users"] }) }
    return { ok: true, growerId: Number(d.growerId), vendorId: null }
  }
  if (role.roleName === ROLES.VENDOR_USER) {
    if (!d.vendorId)
      return { ok: false, error: fail("Select a vendor for vendor users.", { vendorId: ["Required for vendor users"] }) }
    return { ok: true, growerId: null, vendorId: Number(d.vendorId) }
  }
  return { ok: true, growerId: null, vendorId: null }
}

export async function createUser(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(schema, fd)
  if (error) return error
  const mapping = await resolveMapping(data)
  if (!mapping.ok) return mapping.error
  try {
    const created = await prisma.user.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email.toLowerCase(),
        roleId: Number(data.roleId),
        growerId: mapping.growerId,
        vendorId: mapping.vendorId,
        isActive: data.isActive === "true",
        createdBy: user.id,
        updatedBy: user.id,
      },
    })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.CREATE, entityType: "User", entityId: created.id, changes: { email: data.email, roleId: data.roleId } })
    revalidatePath(PATH)
    return ok("User created")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function updateUser(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard(CAP)
  const { data, error } = parseForm(schema, fd)
  if (error) return error
  const mapping = await resolveMapping(data)
  if (!mapping.ok) return mapping.error
  try {
    await prisma.user.update({
      where: { id: Number(data.id) },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email.toLowerCase(),
        roleId: Number(data.roleId),
        growerId: mapping.growerId,
        vendorId: mapping.vendorId,
        isActive: data.isActive === "true",
        updatedBy: user.id,
      },
    })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.UPDATE, entityType: "User", entityId: data.id, changes: { email: data.email, roleId: data.roleId } })
    revalidatePath(PATH)
    return ok("User updated")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}

export async function deleteUser(id: number): Promise<ActionState> {
  const user = await guard(CAP)
  if (id === user.id) return fail("You cannot delete your own account.")
  try {
    await prisma.user.delete({ where: { id } })
    await recordAudit({ userId: user.id, action: AUDIT_ACTIONS.DELETE, entityType: "User", entityId: id })
    revalidatePath(PATH)
    return ok("User deleted")
  } catch (e) {
    return fail(prismaErrorMessage(e))
  }
}
