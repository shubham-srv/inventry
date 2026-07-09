/**
 * REFERENCE — Microsoft Entra ID (Azure AD) authentication.
 *
 * This folder is excluded from the app build (see tsconfig "exclude").
 * Nothing here runs until you wire it in. The design keeps the SESSION layer
 * (signed cookie + getCurrentUser in lib/auth/session.ts) UNCHANGED — Entra only
 * replaces *how the user proves who they are*. After a successful Entra login we
 * match the Entra email to a provisioned `User` row and call the same
 * `createSession(user.id)` the local demo uses.
 *
 * To activate:
 *   1. npm i @azure/msal-node
 *   2. Set AZURE_AD_TENANT_ID / AZURE_AD_CLIENT_ID / AZURE_AD_CLIENT_SECRET /
 *      AZURE_AD_REDIRECT_URI in .env
 *   3. Create these route handlers in the app:
 *        app/api/auth/login/route.ts     ->  export const GET = login
 *        app/api/auth/callback/route.ts  ->  export const GET = callback
 *        app/api/auth/logout/route.ts    ->  export const POST = logout
 *   4. Point the /login page button at /api/auth/login (replace the user picker)
 *      and set AUTH_PROVIDER=entra.
 */
import { ConfidentialClientApplication } from "@azure/msal-node"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { createSession, destroySession } from "@/lib/auth/session"

const SCOPES = ["user.read"]
const redirectUri = process.env.AZURE_AD_REDIRECT_URI!

const msal = new ConfidentialClientApplication({
  auth: {
    clientId: process.env.AZURE_AD_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}`,
    clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
  },
})

export async function login(): Promise<NextResponse> {
  const url = await msal.getAuthCodeUrl({ scopes: SCOPES, redirectUri })
  return NextResponse.redirect(url)
}

export async function callback(req: NextRequest): Promise<NextResponse> {
  const code = req.nextUrl.searchParams.get("code")
  if (!code) return NextResponse.redirect(new URL("/login?error=nocode", req.url))

  const result = await msal.acquireTokenByCode({ code, scopes: SCOPES, redirectUri })
  const email = result.account?.username?.toLowerCase()
  if (!email) return NextResponse.redirect(new URL("/login?error=noemail", req.url))

  // Map the Entra identity to a user provisioned by an admin (by email).
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.isActive) {
    return NextResponse.redirect(new URL("/login?error=unprovisioned", req.url))
  }

  // Reuse the existing session mechanism — the rest of the app is unchanged.
  await createSession(user.id)
  return NextResponse.redirect(new URL("/", req.url))
}

export async function logout(req: NextRequest): Promise<NextResponse> {
  await destroySession()
  return NextResponse.redirect(new URL("/login", req.url))
}
