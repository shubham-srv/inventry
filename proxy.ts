import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Next.js 16 renamed Middleware -> Proxy. This is an *optimistic* gate:
// it only checks for the presence of the session cookie. Real verification
// (signature + DB user) happens in the (app) layouts via getCurrentUser().
const SESSION_COOKIE = "demo_session" // keep in sync with lib/auth/session.ts
const PUBLIC_PATHS = ["/login"]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSession = request.cookies.has(SESSION_COOKIE)
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  )

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  if (hasSession && isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  // Run on everything except static assets and files with an extension.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
