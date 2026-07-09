"use server"

import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { createSession, destroySession } from "@/lib/auth/session"
import { homePathForRole } from "@/lib/rbac"
import { type RoleName } from "@/lib/constants"

/**
 * Local demo login: impersonate a seeded user (no password).
 * The real Entra flow lives in lib/auth/entra and replaces only this step.
 */
export async function loginAs(userId: number): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  })
  if (!user || !user.isActive) {
    throw new Error("Cannot log in as this user.")
  }
  await createSession(user.id)
  redirect(homePathForRole(user.role.roleName as RoleName))
}

export async function logout(): Promise<void> {
  await destroySession()
  redirect("/login")
}
