import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import {
  clearSessionCookie,
  slideSession,
  verifySessionToken,
} from "@/lib/auth/sliding-session"

// Next.js 16 renamed Middleware -> Proxy.
//
// This gate is authoritative on the cookie's SIGNATURE and EXPIRY, and
// deliberately not on anything else: confirming the user still exists and is
// active needs Prisma, which cannot run here, so the (app) layouts still do
// that via getCurrentUser().
//
// It used to check only that the cookie was PRESENT. A cookie that was present
// but unverifiable — rotated SESSION_SECRET, a tampered value, a browser clock
// behind the server's — then bounced forever: / let it through, requireUser()
// sent it to /login, and /login saw a "session" and sent it back to /. Nothing
// on that path ever deleted the cookie, so the only escape was clearing cookies
// by hand. Hence `stale` below: a dead cookie is removed on the way past.
const SESSION_COOKIE = "demo_session" // keep in sync with lib/auth/session.ts
const PUBLIC_PATHS = ["/login"]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const token = request.cookies.get(SESSION_COOKIE)?.value
  const session = token ? await verifySessionToken(token) : null
  // Present, but not a session we will ever accept again.
  const stale = Boolean(token) && !session

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  )

  if (!session && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    // Come back here after signing in, rather than dumping everyone on the
    // dashboard — the Entra round-trip carries this through `state`.
    url.searchParams.set("returnTo", pathname)
    // Say why, instead of a silent bounce: they had a session a moment ago.
    if (stale) url.searchParams.set("error", "sessionexpired")
    const res = NextResponse.redirect(url)
    if (stale) clearSessionCookie(res)
    return res
  }

  if (session && isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    url.search = ""
    return NextResponse.redirect(url)
  }

  const res = NextResponse.next()
  if (stale) {
    // On /login with a dead cookie: let the page render, drop the cookie.
    clearSessionCookie(res)
  } else if (session) {
    // Keep active sessions alive. Only worth doing on requests we're letting
    // through — a redirect response is about to replace the page anyway.
    await slideSession(session, res)
  }
  return res
}

export const config = {
  // Run on everything except static assets and files with an extension.
  // /api is excluded: the auth routes manage their own cookies, and the cron
  // endpoints authenticate with a shared secret rather than a session.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\..*).*)"],
}
