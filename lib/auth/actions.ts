"use server"

import { redirect } from "next/navigation"
import { getCurrentUser, destroySession } from "@/lib/auth/session"
import { isEntraConfigured, entraLogoutUrl } from "@/lib/auth/entra"
import { isInternal } from "@/lib/rbac"

/**
 * Sign out.
 *
 * Internal users get sent on to Entra's end-session endpoint. Dropping our own
 * cookie is not enough for them: the tenant's SSO session survives it, so the
 * next "Sign in with Microsoft" click silently signs the same person straight
 * back in — which does not look like signing out to anyone watching, least of
 * all on a shared machine. External users have no upstream session to end.
 */
export async function logout(): Promise<void> {
  const user = await getCurrentUser()
  const federated = Boolean(user && isInternal(user.roleName) && isEntraConfigured())

  await destroySession()
  redirect(federated ? entraLogoutUrl() : "/login")
}
