import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"

// Next.js 16 renamed Middleware -> Proxy.
//
// This gate VERIFIES the session cookie's signature and expiry. It runs on the
// Edge runtime, so jose is available but Prisma is not: a token can verify here
// and still belong to a user who is gone (deleted, deactivated, or wiped by a
// re-seed). getCurrentUser() catches that case and bails out via SIGN_OUT_PATH.
//
// Presence alone is NOT enough, and gating on `cookies.has()` used to deadlock
// the app. An expired cookie — or any cookie signed with a since-rotated
// SESSION_SECRET — still looked like a session here, so /login bounced to /,
// requireUser() bounced back to /login, and round it went. There was no way out
// from inside the browser either: the only thing that cleared the cookie was the
// logout button, which lives in the app shell that never got to render. Hence
// both halves of the rule below: verify the token, and delete one that fails.
const SESSION_COOKIE = "demo_session" // keep in sync with lib/auth/session.ts
const PUBLIC_PATHS = ["/login"]

function getSecret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.SESSION_SECRET || "dev-only-insecure-secret"
  )
}

/** True only if the cookie is present, correctly signed and unexpired. */
async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return typeof payload.userId === "number"
  } catch {
    return false
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const hasSession = await isValidSession(token)
  // Present but unusable. Dropping it on the way out is what makes this
  // self-healing: whatever happens next, the following request is cleanly
  // logged out rather than half-authenticated.
  const isStale = token !== undefined && !hasSession
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  )

  let response: NextResponse
  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    response = NextResponse.redirect(url)
  } else if (hasSession && isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    response = NextResponse.redirect(url)
  } else {
    response = NextResponse.next()
  }

  // Path must match how createSession() set it, or the browser keeps the old one.
  if (isStale) response.cookies.delete({ name: SESSION_COOKIE, path: "/" })
  return response
}

export const config = {
  // Run on everything except static assets and files with an extension. `api` is
  // excluded, which is what lets SIGN_OUT_PATH clear the cookie without being
  // bounced by the rules above.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\..*).*)"],
}
