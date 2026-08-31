import "server-only"
import { NextResponse, type NextRequest } from "next/server"
import { createHash, randomBytes } from "node:crypto"
import type { ConfidentialClientApplication } from "@azure/msal-node"
import { SignJWT, jwtVerify } from "jose"
import { prisma } from "@/lib/db"
import { sessionCookies } from "@/lib/auth/session"
import { homePathForRole } from "@/lib/rbac"
import { appUrl } from "@/lib/app-url"
import { type RoleName } from "@/lib/constants"

/**
 * Microsoft Entra ID (Azure AD) sign-in for INTERNAL staff.
 * External users (growers, vendors) use lib/auth/magic-link.ts instead.
 *
 * The SESSION layer is untouched — Entra only replaces *how the user proves who
 * they are*. On a successful callback we match the Entra oid (falling back to
 * the admin-provisioned email) to a `User` row and issue the same cookie every
 * other auth path issues.
 */

const SCOPES = ["user.read"]

/** Short-lived cookie carrying the state + PKCE verifier across the round-trip. */
const TX_COOKIE = "entra_tx"
const TX_TTL_SECONDS = 60 * 10
const TX_PURPOSE = "entra-tx"

function txSecret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.SESSION_SECRET || "dev-only-insecure-secret"
  )
}

function redirectUri(): string {
  return process.env.AZURE_AD_REDIRECT_URI || appUrl("/api/auth/callback")
}

/** True when this deployment has enough configuration to attempt Entra. */
export function isEntraConfigured(): boolean {
  return Boolean(
    process.env.AZURE_AD_TENANT_ID &&
      process.env.AZURE_AD_CLIENT_ID &&
      process.env.AZURE_AD_CLIENT_SECRET
  )
}

// Built on first use, not at module scope, for two reasons: this module is
// imported while `next build` traces the route (where the env vars legitimately
// don't exist, and constructing eagerly with `!` would fail the build instead of
// the request), and entraLogoutUrl() is imported by the sign-out action on every
// authenticated page — which has no business loading the MSAL SDK.
let cachedClient: ConfidentialClientApplication | null = null
async function client(): Promise<ConfidentialClientApplication> {
  if (!cachedClient) {
    const { ConfidentialClientApplication } = await import("@azure/msal-node")
    cachedClient = new ConfidentialClientApplication({
      auth: {
        clientId: process.env.AZURE_AD_CLIENT_ID!,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}`,
        clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      },
    })
  }
  return cachedClient
}

const b64url = (b: Buffer): string => b.toString("base64url")

function loginRedirect(code?: string): NextResponse {
  return NextResponse.redirect(appUrl(code ? `/login?error=${code}` : "/login"))
}

/**
 * GET /api/auth/login — start the authorization-code flow.
 *
 * Mints a random `state` and a PKCE verifier, keeps both in a signed httpOnly
 * cookie, and sends only the derived challenge to Microsoft. Without this the
 * callback would accept any authorization code anyone posted to it (login
 * CSRF), and there would be nowhere to remember where the user was headed.
 */
export async function login(req: NextRequest): Promise<NextResponse> {
  if (!isEntraConfigured()) return loginRedirect("config")

  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash("sha256").update(verifier).digest())
  const state = b64url(randomBytes(16))

  // Only same-origin absolute paths, so `?returnTo=https://evil.example` can't
  // turn our login endpoint into an open redirector.
  const requested = req.nextUrl.searchParams.get("returnTo") ?? ""
  const returnTo = requested.startsWith("/") && !requested.startsWith("//") ? requested : ""

  let url: string
  try {
    url = await (await client()).getAuthCodeUrl({
      scopes: SCOPES,
      redirectUri: redirectUri(),
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
      state,
    })
  } catch (e) {
    console.error("[entra] getAuthCodeUrl failed", e)
    return loginRedirect("entra")
  }

  const tx = await new SignJWT({ purpose: TX_PURPOSE, state, verifier, returnTo })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TX_TTL_SECONDS}s`)
    .sign(txSecret())

  const res = NextResponse.redirect(url)
  res.cookies.set(TX_COOKIE, tx, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TX_TTL_SECONDS,
  })
  return res
}

/** GET /api/auth/callback — verify the round-trip, then start the normal session. */
export async function callback(req: NextRequest): Promise<NextResponse> {
  if (!isEntraConfigured()) return loginRedirect("config")

  const params = req.nextUrl.searchParams

  // Entra reports consent/assignment failures here, not by omitting the code.
  if (params.get("error")) {
    console.warn(
      "[entra] callback error:",
      params.get("error"),
      params.get("error_description")
    )
    return clearTx(loginRedirect("entra"))
  }

  const code = params.get("code")
  if (!code) return clearTx(loginRedirect("nocode"))

  // Recover the state + verifier we stashed on the way out.
  const txCookie = req.cookies.get(TX_COOKIE)?.value
  if (!txCookie) return clearTx(loginRedirect("state"))

  let state: string
  let verifier: string
  let returnTo: string
  try {
    const { payload } = await jwtVerify(txCookie, txSecret())
    if (
      payload.purpose !== TX_PURPOSE ||
      typeof payload.state !== "string" ||
      typeof payload.verifier !== "string"
    ) {
      throw new Error("bad-claims")
    }
    state = payload.state
    verifier = payload.verifier
    returnTo = typeof payload.returnTo === "string" ? payload.returnTo : ""
  } catch {
    return clearTx(loginRedirect("state"))
  }

  if (params.get("state") !== state) return clearTx(loginRedirect("state"))

  let result
  try {
    result = await (await client()).acquireTokenByCode({
      code,
      scopes: SCOPES,
      redirectUri: redirectUri(),
      codeVerifier: verifier,
      state,
    })
  } catch (e) {
    console.error("[entra] acquireTokenByCode failed", e)
    return clearTx(loginRedirect("entra"))
  }

  // Entra's immutable object id (oid) is the durable identity; email/UPN can change.
  const oid = result.uniqueId || null
  const email = result.account?.username?.toLowerCase() || null
  if (!oid && !email) return clearTx(loginRedirect("noidentity"))

  // Match on the stable oid first; fall back to the admin-provisioned email and
  // backfill the oid so a future email change doesn't lock the user out.
  // findFirst (not findUnique): entraObjectId is enforced by a filtered unique
  // index, not a Prisma @unique, so it isn't a findUnique key — the DB still
  // guarantees at most one row per non-null oid.
  let user = oid ? await prisma.user.findFirst({ where: { entraObjectId: oid } }) : null
  if (!user && email) {
    user = await prisma.user.findUnique({ where: { email } })
    if (user && oid && !user.entraObjectId) {
      await prisma.user.update({
        where: { id: user.id },
        data: { entraObjectId: oid },
      })
    }
  }

  // The provisioning gate: authenticating against the tenant is not the same as
  // having access. Admins decide who exists here.
  if (!user || !user.isActive) return clearTx(loginRedirect("unprovisioned"))

  const role = await prisma.role.findUnique({ where: { id: user.roleId } })
  const home = role ? homePathForRole(role.roleName as RoleName) : "/"

  const res = NextResponse.redirect(appUrl(returnTo || home))
  for (const c of await sessionCookies(user.id)) {
    res.cookies.set(c.name, c.value, c.options)
  }
  return clearTx(res)
}

function clearTx(res: NextResponse): NextResponse {
  res.cookies.set(TX_COOKIE, "", { path: "/", maxAge: 0 })
  return res
}

/**
 * Where to send an internal user after clearing our own cookie.
 *
 * Dropping the session cookie alone leaves the *Entra* SSO session live, so the
 * next "Sign in with Microsoft" click silently re-authenticates as the same
 * person — which does not look like signing out to anyone watching.
 * `post_logout_redirect_uri` must be registered on the app registration.
 */
export function entraLogoutUrl(): string {
  const tenant = process.env.AZURE_AD_TENANT_ID
  const post = encodeURIComponent(appUrl("/login"))
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/logout?post_logout_redirect_uri=${post}`
}
