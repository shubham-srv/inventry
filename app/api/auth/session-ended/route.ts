import { NextResponse, type NextRequest } from "next/server"
import { appUrl } from "@/lib/app-url"
import { isLoginError } from "@/lib/auth/errors"

/**
 * GET /api/auth/session-ended?error=…
 *
 * Clears the session cookie, then sends the user to /login with an explanation.
 *
 * Exists because requireUser() runs inside a Server Component, which cannot
 * mutate cookies — so it has nowhere to delete a cookie before redirecting. The
 * proxy handles cookies it can prove are dead (bad signature, past `exp`), but
 * it has no Prisma and so cannot see the other way a session stops being valid:
 * the JWT verifies fine and the user behind it has been deactivated or deleted.
 * Left alone, that cookie bounced between / and /login forever.
 *
 * Deliberately NOT lib/auth/actions.ts#logout: that is a server action with no
 * URL to redirect to, it reads getCurrentUser() (null in every case that lands
 * here), and its federated branch would end the user's whole Entra SSO session
 * — signing them out of Outlook and Teams because our cookie went bad.
 *
 * Under /api, so the proxy's matcher skips it and there is no second gate to
 * argue with. Sets the cookie on the redirect response itself rather than via
 * cookies(), matching lib/auth/entra.ts#clearTx — a cookies() mutation is not
 * merged into a NextResponse.redirect.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const raw = req.nextUrl.searchParams.get("error")
  const error = isLoginError(raw) ? raw : "sessionexpired"

  const url = new URL(appUrl("/login"))
  url.searchParams.set("error", error)

  const res = NextResponse.redirect(url)
  res.cookies.set("demo_session", "", { path: "/", maxAge: 0 })
  return res
}
