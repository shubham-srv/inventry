/**
 * REFERENCE — sliding (rolling) session expiry.
 *
 * The session cookie set by lib/auth/session.ts has an ABSOLUTE 7-day life. This
 * re-issues it once it's past the halfway mark (and still valid), so ACTIVE users
 * never get logged out, while IDLE users still expire ~7 days after their last
 * visit. Applies to every session — Entra AND magic-link — because both converge
 * on the same cookie.
 *
 * Runs on the Edge runtime: uses jose only (no Prisma). Keep SESSION_COOKIE /
 * MAX_AGE / the secret IN SYNC with lib/auth/session.ts.
 *
 * Wire-up (root middleware.ts) — either use this directly:
 *   export { middleware, config } from "@/lib/auth/sliding-session"  // after copying here into lib
 * or compose into an existing middleware:
 *   const res = NextResponse.next(); await slideSession(req, res); return res
 */
import { NextRequest, NextResponse } from "next/server"
import { SignJWT, jwtVerify } from "jose"

const SESSION_COOKIE = "demo_session" // must match lib/auth/session.ts
const MAX_AGE = 60 * 60 * 24 * 7 // 7 days — must match lib/auth/session.ts
const REISSUE_AFTER = MAX_AGE / 2 // re-mint once the cookie is older than this

function secret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.SESSION_SECRET || "dev-only-insecure-secret"
  )
}

/** Re-mints the session cookie on `res` if the current one is valid but aging. */
export async function slideSession(
  req: NextRequest,
  res: NextResponse
): Promise<void> {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return
  try {
    const { payload } = await jwtVerify(token, secret())
    const iat = typeof payload.iat === "number" ? payload.iat : 0
    const ageSeconds = Date.now() / 1000 - iat
    if (payload.userId && ageSeconds > REISSUE_AFTER) {
      const fresh = await new SignJWT({ userId: payload.userId })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("7d")
        .sign(secret())
      res.cookies.set(SESSION_COOKIE, fresh, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: MAX_AGE,
      })
    }
  } catch {
    // Invalid/expired cookie — leave it; requireUser() will redirect to /login.
  }
}

/** Ready-to-use standalone middleware. */
export async function middleware(req: NextRequest): Promise<NextResponse> {
  const res = NextResponse.next()
  await slideSession(req, res)
  return res
}

// Skip static assets and the auth endpoints (they manage their own cookies).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
}
