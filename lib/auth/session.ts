import "server-only"
import { cookies } from "next/headers"
import { cache } from "react"
import { redirect } from "next/navigation"
import { SignJWT, jwtVerify } from "jose"
import { prisma } from "@/lib/db"
import { type RoleName } from "@/lib/constants"
import { type Capability, can as roleCan } from "@/lib/rbac"

// ============================================================
// Local "dummy" session provider.
//
// A signed (jose) httpOnly cookie holds the impersonated user id.
// This mirrors the shape a real Entra session would expose
// (getCurrentUser / requireUser / requireRole), so swapping in
// lib/auth/entra later only changes how the cookie/userId is
// established — call sites stay identical.
// ============================================================

export const SESSION_COOKIE = "demo_session"
const MAX_AGE = 60 * 60 * 24 * 7 // 7 days

function getSecret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.SESSION_SECRET || "dev-only-insecure-secret"
  )
}

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

export async function createSession(userId: number): Promise<void> {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret())

  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  })
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

async function readUserId(): Promise<number | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getSecret())
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

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
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
