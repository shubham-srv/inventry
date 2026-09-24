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
// ⚠️ DO NOT put a pattern with a negative lookahead in `config.matcher`.
// The documented idiom — "/((?!api|_next/static|...).*)"  — caused Next 16.2.6
// to silently DROP this proxy: no error, no warning, the module compiled and
// was simply never registered, so the gate never ran for any request at all.
// Nothing looked broken, because every page also checks auth in its layout; the
// only visible symptom was /login rendering for an already-signed-in user.
// A security gate that stops running without saying so is the worst failure
// mode available, so the matcher now takes everything and the exclusions live
// in `isExcluded` below, where they are ordinary code and can be tested.
const SESSION_COOKIE = "demo_session" // keep in sync with lib/auth/session.ts
const PUBLIC_PATHS = ["/login"]

/** Paths the gate ignores — the exclusions that used to live in the matcher. */
const EXCLUDED_PREFIXES = ["/api", "/_next/static", "/_next/image"]

function isExcluded(pathname: string): boolean {
  if (EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return true
  }
  // Anything with a file extension: favicon.ico and everything under /public.
  return /\.[^/]+$/.test(pathname)
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // /api is excluded because the auth routes manage their own cookies and the
  // cron endpoints authenticate with a shared secret rather than a session.
  if (isExcluded(pathname)) return NextResponse.next()

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
    // Already signed in and asking for /login. Send them to "/", which resolves
    // to their role's home page (app/(app)/page.tsx).
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
  // Everything. See the warning above before changing this to a pattern.
  matcher: ["/:path*"],
}
