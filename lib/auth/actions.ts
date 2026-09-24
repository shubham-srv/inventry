"use server"

import { redirect } from "next/navigation"
import { destroySession } from "@/lib/auth/session"

/**
 * Sign out of THIS APP only.
 *
 * We drop our own session cookie and stop there. Internal users stay signed in
 * to Microsoft, which is how people expect sign-out to behave everywhere else:
 * leaving a site does not sign you out of your Google or Microsoft account.
 *
 * The trade-off, so it is a known one. Because the tenant SSO session survives,
 * clicking "Sign in with Microsoft" again re-authenticates the same person
 * without a prompt. On a shared machine that can look like the sign-out did not
 * take. The fix for that is to sign out of Microsoft as well, which is the
 * user's own decision to make in their browser rather than something this app
 * imposes on them — ending the tenant session would also sign them out of
 * Outlook and Teams, which is a lot to do to somebody who just closed an
 * inventory app.
 *
 * (An earlier version redirected internal users to Entra's end-session endpoint.
 * Removed deliberately; `entraLogoutUrl` went with it.)
 */
export async function logout(): Promise<void> {
  await destroySession()
  redirect("/login")
}
