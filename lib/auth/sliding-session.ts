import { NextResponse, type NextRequest } from "next/server"
import { SignJWT, jwtVerify } from "jose"

/**
 * Sliding (rolling) session expiry.
 *
 * The cookie issued by lib/auth/session.ts has an ABSOLUTE 7-day life. This
 * re-issues it once it is past the halfway mark and still valid, so people who
 * use the app regularly are never logged out mid-week, while idle sessions still
 * lapse ~7 days after the last visit. Applies to Entra and magic-link sessions
 * alike, because both converge on the same cookie.
 *
 * Runs in the proxy (Next 16's rename of middleware), i.e. the Edge runtime:
 * jose only, no Prisma. SESSION_COOKIE / MAX_AGE / the secret must stay in sync
 * with lib/auth/session.ts.
 */

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
