"use server"

import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { createSession } from "@/lib/auth/session"
import { isDemoLoginEnabled } from "@/lib/auth/demo-gate"
import { homePathForRole } from "@/lib/rbac"
import { type RoleName } from "@/lib/constants"

/**
 * DEVELOPMENT ONLY — impersonate a seeded user with no credential of any kind.
 *
 * Production sign-in is Entra (lib/auth/entra.ts) for staff and a magic link
 * (lib/auth/magic-link.ts) for growers and vendors. This exists so the app can
 * be driven on a laptop without a tenant or a mail provider.
 *
 * Hiding the picker on the login page is NOT sufficient protection: a server
 * action is a reachable HTTP endpoint whether or not anything renders a form for
 * it, so this one logs in as any user id it is handed. Hence the re-check below,
 * which repeats the page's condition rather than trusting it.
 */
export async function loginAs(userId: number): Promise<void> {
  if (!isDemoLoginEnabled()) {
    throw new Error("Demo login is disabled. Sign in with Microsoft or an emailed link.")
  }

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
