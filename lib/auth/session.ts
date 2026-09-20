import "server-only"
import { cookies } from "next/headers"
import { cache } from "react"
import { redirect } from "next/navigation"
import { SignJWT, jwtVerify } from "jose"
import { prisma } from "@/lib/db"
import { sessionSecret } from "@/lib/auth/secret"
import { type RoleName } from "@/lib/constants"
import { type Capability, can as roleCan } from "@/lib/rbac"
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/config"

// ============================================================
// The session layer — auth-provider agnostic on purpose.
//
// A signed (jose) httpOnly cookie holds the user id. Entra
// (lib/auth/entra.ts), magic link (lib/auth/magic-link.ts) and the
// dev-only picker (lib/auth/dummy.ts) all end by calling
// createSession(user.id); nothing downstream — roles, capabilities,
// grower/vendor data isolation — knows or cares which door someone
// came through.
// ============================================================

export const SESSION_COOKIE = "demo_session"
const MAX_AGE = 60 * 60 * 24 * 7 // 7 days

export type SessionUser = {
  id: number
  firstName: string
  lastName: string
  email: string
  roleId: number
  roleName: RoleName
  growerId: number | null
  vendorId: number | null
  growerName: string | null
  vendorName: string | null
}

export type SessionCookie = {
  name: string
  value: string
  options: {
    httpOnly?: boolean
    sameSite: "lax"
    secure?: boolean
    path: string
    maxAge: number
  }
}

/**
 * Builds the cookies that constitute a session, without setting them.
 *
 * Route handlers that finish with `NextResponse.redirect(...)` need the cookies
 * on THAT response object, so they call this and `res.cookies.set(...)`
 * themselves rather than relying on a `cookies()` mutation being merged into a
 * redirect. Server actions and pages use createSession() below.
 */
export async function sessionCookies(userId: number): Promise<SessionCookie[]> {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(sessionSecret())

  const list: SessionCookie[] = [
    {
      name: SESSION_COOKIE,
      value: token,
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: MAX_AGE,
      },
    },
  ]

  // Sync the UI language cookie to the user's saved preference, so a returning
  // user gets their language even in a fresh browser. Centralized here so every
  // auth path (dummy login, Entra, magic-link) inherits it. The switcher writes
  // preferredLocale back whenever they change it in-app.
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferredLocale: true },
  })
  if (u && isLocale(u.preferredLocale)) {
    list.push({
      name: LOCALE_COOKIE,
      value: u.preferredLocale,
      options: { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" },
    })
  }

  return list
}

export async function createSession(userId: number): Promise<void> {
  const store = await cookies()
  for (const c of await sessionCookies(userId)) {
    store.set(c.name, c.value, c.options)
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

async function readUserId(): Promise<number | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  // Outside the try on purpose: a missing SESSION_SECRET is a deployment fault,
  // not a bad cookie, and must not be swallowed as "not signed in".
  const key = sessionSecret()
  try {
    const { payload } = await jwtVerify(token, key)
    return typeof payload.userId === "number" ? payload.userId : null
  } catch {
    return null
  }
}

/** Loads the impersonated user once per request (React cache). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const userId = await readUserId()
  if (!userId) return null

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true, grower: true, vendor: true },
  })
  if (!user || !user.isActive) return null

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    roleId: user.roleId,
    roleName: user.role.roleName as RoleName,
    growerId: user.growerId,
    vendorId: user.vendorId,
    growerName: user.grower?.growerName ?? null,
    vendorName: user.vendor?.vendorName ?? null,
  }
})

/**
 * Reaching here with no user means the cookie verified but the account behind
 * it did not: deactivated, or deleted. Redirecting straight to /login would
 * leave that still-valid cookie in place, and the proxy would read it as a
 * session and send them back — the loop this route exists to break. The route
 * handler can delete cookies; a Server Component cannot.
 */
const SESSION_ENDED = "/api/auth/session-ended?error=unprovisioned"

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) redirect(SESSION_ENDED)
  return user
}

export async function requireRole(roles: RoleName[]): Promise<SessionUser> {
  const user = await requireUser()
  if (!roles.includes(user.roleName)) redirect("/")
  return user
}

export async function requireCapability(
  capability: Capability
): Promise<SessionUser> {
  const user = await requireUser()
  if (!roleCan(user.roleName, capability)) redirect("/")
  return user
}
