import { NextResponse } from "next/server"
import { SignJWT, jwtVerify } from "jose"
import { sessionSecret } from "@/lib/auth/secret"

/**
 * Session verification and sliding (rolling) expiry, for the Edge runtime.
 *
 * The cookie issued by lib/auth/session.ts has an ABSOLUTE 7-day life.
 * slideSession() re-issues it once it is past the halfway mark and still valid,
 * so people who use the app regularly are never logged out mid-week, while idle
 * sessions still lapse ~7 days after the last visit. Applies to Entra and
 * magic-link sessions alike, because both converge on the same cookie.
 *
 * Runs in the proxy (Next 16's rename of middleware): jose only, no Prisma.
 * SESSION_COOKIE / MAX_AGE must stay in sync with lib/auth/session.ts.
 *
 * verifySessionToken() is exported because proxy.ts gates on it. This module
 * was already verifying the cookie on every request and throwing the result
 * away; the proxy then made its allow/deny decision on cookie PRESENCE alone,
 * which is what let an unverifiable cookie bounce forever between / and /login.
 */

const SESSION_COOKIE = "demo_session" // must match lib/auth/session.ts
const MAX_AGE = 60 * 60 * 24 * 7 // 7 days — must match lib/auth/session.ts
const REISSUE_AFTER = MAX_AGE / 2 // re-mint once the cookie is older than this

export type SessionPayload = { userId: number; iat: number }

/**
 * Signature + expiry check. Returns null for a token that is malformed,
 * tampered with, signed with a retired secret, or past its `exp`.
 *
 * A null here means "this cookie is not a session" — NOT "no user". The caller
 * still has to decide what to do with the dead cookie sitting in the browser.
 */
export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  // Outside the try: a missing SESSION_SECRET is a deployment fault, not a bad
  // token, and must not be swallowed into "everyone is signed out".
  const key = sessionSecret()
  try {
    const { payload } = await jwtVerify(token, key)
    if (typeof payload.userId !== "number") return null
    return {
      userId: payload.userId,
      iat: typeof payload.iat === "number" ? payload.iat : 0,
    }
  } catch {
    return null
  }
}

/** Re-mints the session cookie on `res` if the verified one is aging. */
export async function slideSession(
  payload: SessionPayload,
  res: NextResponse
): Promise<void> {
  const ageSeconds = Date.now() / 1000 - payload.iat
  if (ageSeconds <= REISSUE_AFTER) return

  const fresh = await new SignJWT({ userId: payload.userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(sessionSecret())

  res.cookies.set(SESSION_COOKIE, fresh, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  })
}

/** Removes a session cookie that will never verify again. */
export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 })
}
