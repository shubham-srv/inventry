"use server"

import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { createSession } from "@/lib/auth/session"
import { isDemoLoginEnabled } from "@/lib/auth/demo-gate"
import { homePathForRole } from "@/lib/rbac"
import { type RoleName } from "@/lib/constants"
import { PARTNER_STATUS_SELECT, partnerAccessBlocked } from "@/lib/auth/partner-access"

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
    include: { role: true, ...PARTNER_STATUS_SELECT },
  })
  if (!user || !user.isActive) {
    throw new Error("Cannot log in as this user.")
  }
  // Same gate as the real doors, so the picker can be used to verify it.
  if (partnerAccessBlocked(user)) redirect("/login?error=partnerdisabled")
  await createSession(user.id)
  redirect(homePathForRole(user.role.roleName as RoleName))
}
