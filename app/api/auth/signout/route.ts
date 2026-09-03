import { NextResponse } from "next/server"
import { SESSION_COOKIE } from "@/lib/auth/session"

/**
 * Clears the session cookie and returns the user to the login page.
 *
 * This exists because Server Components cannot mutate cookies — only Server
 * Actions and Route Handlers can. requireUser() runs inside layouts and pages, so
 * when it finds a cookie it cannot use it has nowhere to put the deletion; it
 * redirects here instead. See lib/auth/session.ts.
 *
 * proxy.ts does not run on /api, so this is reachable no matter what state the
 * cookie is in — that is the whole point of it living under /api.
 */
export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url))
  // Path must match how createSession() set it, or the browser keeps the old one.
  response.cookies.delete({ name: SESSION_COOKIE, path: "/" })
  return response
}
