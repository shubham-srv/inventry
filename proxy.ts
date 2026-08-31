import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { slideSession } from "@/lib/auth/sliding-session"

// Next.js 16 renamed Middleware -> Proxy. This is an *optimistic* gate:
// it only checks for the presence of the session cookie. Real verification
// (signature + DB user) happens in the (app) layouts via getCurrentUser().
const SESSION_COOKIE = "demo_session" // keep in sync with lib/auth/session.ts
const PUBLIC_PATHS = ["/login"]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSession = request.cookies.has(SESSION_COOKIE)
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  )

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    // Come back here after signing in, rather than dumping everyone on the
    // dashboard — the Entra round-trip carries this through `state`.
    url.searchParams.set("returnTo", pathname)
    return NextResponse.redirect(url)
  }

  if (hasSession && isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    url.search = ""
    return NextResponse.redirect(url)
  }

  // Keep active sessions alive. Only worth doing on requests we're letting
  // through — a redirect response is about to replace the page anyway.
  const res = NextResponse.next()
  await slideSession(request, res)
  return res
}

export const config = {
  // Run on everything except static assets and files with an extension.
  // /api is excluded: the auth routes manage their own cookies, and the cron
  // endpoints authenticate with a shared secret rather than a session.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
