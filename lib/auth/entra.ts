import "server-only"
import { NextResponse, type NextRequest } from "next/server"
import { createHash, randomBytes } from "node:crypto"
import type { ConfidentialClientApplication, ICachePlugin } from "@azure/msal-node"
import { SignJWT, jwtVerify } from "jose"
import { prisma } from "@/lib/db"
import { sessionCookies } from "@/lib/auth/session"
import { saveTokenCache, userCachePlugin } from "@/lib/auth/token-cache"
import { sessionSecret } from "@/lib/auth/secret"
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

// Identity only. `offline_access` is what makes Entra return a REFRESH token,
// without which the Power BI token below could be minted once at login and never
// again — reports would break an hour into every session.
//
// The Power BI scope is deliberately NOT here: an Entra access token has a single
// audience, so one token cannot cover both Microsoft Graph and Power BI. The
// Power BI token is acquired separately, from the same refresh token, in
// lib/powerbi/token.ts.
const SCOPES = ["user.read", "offline_access"]

/** Short-lived cookie carrying the state + PKCE verifier across the round-trip. */
const TX_COOKIE = "entra_tx"
const TX_TTL_SECONDS = 60 * 10
const TX_PURPOSE = "entra-tx"

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

// Built on first use, not at module scope: this module is imported while
// `next build` traces the route, where the env vars legitimately don't exist and
// constructing eagerly with `!` would fail the build instead of the request.
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

/**
 * A client with its OWN token cache, for operations whose cache we intend to
 * store. Shares the shared client's configuration and nothing else — see the
 * note in lib/auth/token-cache.ts about why caches must not be mixed.
 */
export async function freshClient(
  cachePlugin: ICachePlugin
): Promise<ConfidentialClientApplication> {
  const { ConfidentialClientApplication } = await import("@azure/msal-node")
  return new ConfidentialClientApplication({
    auth: {
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      authority: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}`,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
    },
    cache: { cachePlugin },
  })
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
    .sign(sessionSecret())

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
  // Outside the try: a missing SESSION_SECRET is a deployment fault, not a
  // forged callback, and should not be reported to the user as one.
  const txKey = sessionSecret()
  try {
    const { payload } = await jwtVerify(txCookie, txKey)
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

  // A FRESH client with an empty cache, not the shared one: MSAL's cache holds
  // every account a client has seen, so serializing the shared instance would
  // write other people's tokens onto this user's row.
  const { plugin, updated } = userCachePlugin(null)
  let result
  try {
    result = await (await freshClient(plugin)).acquireTokenByCode({
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

  // Store the token cache now that the user is known and accepted. Best-effort:
  // saveTokenCache swallows its own failures, because a session that works is
  // worth more than a Power BI token, and the only cost of losing it is that the
  // reports page asks this person to sign in again.
  const cache = updated()
  if (cache) {
    await saveTokenCache(user.id, cache, result.account?.homeAccountId ?? null)
  }

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
