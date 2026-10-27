import "server-only"
import { NextResponse, type NextRequest } from "next/server"
import { createHash, randomBytes } from "node:crypto"
import { SignJWT, jwtVerify } from "jose"
import { prisma } from "@/lib/db"
import { sessionCookies } from "@/lib/auth/session"
import { homePathForRole } from "@/lib/rbac"
import { appUrl } from "@/lib/app-url"
import { INTERNAL_ROLES, type RoleName } from "@/lib/constants"
import { notifyMagicLink } from "@/lib/email/notify"
import { PARTNER_STATUS_SELECT, partnerAccessBlocked } from "@/lib/auth/partner-access"
import { allow } from "@/lib/auth/rate-limit"

/**
 * Passwordless sign-in for EXTERNAL users (growers & vendors).
 * Internal staff use Entra — see lib/auth/entra.ts.
 *
 *   request → email a short-lived, single-use signed link
 *   consume → verify it, burn it, and start the SAME session everyone else gets
 *
 * TWO DISTINCT TOKENS — do not confuse them:
 *   • the 15-minute LINK token (here): proves control of the inbox, once.
 *   • the 7-day SESSION cookie (createSession): keeps the user logged in.
 * Different secrets, and the link carries a `purpose` claim, so a leaked link
 * can never be replayed as a session or vice-versa.
 */

const LINK_TTL_SECONDS = 15 * 60
const PURPOSE = "magic-link"
const LIMIT_WINDOW_MS = 15 * 60 * 1000
const LIMIT_PER_CLIENT = 20 // lookups per IP per window
const LIMIT_PER_USER = 5 // links per address per window

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Why an email sign-in was refused; the login form shows a matching message. */
export type MagicRequestError =
  | "invalid"
  | "notfound"
  | "inactive"
  | "internal"
  | "partnerdisabled"
  | "ratelimited"
  | "mailfailed"
  | "config"

function refuse(error: MagicRequestError, status: number): NextResponse {
  return NextResponse.json({ ok: false, error }, { status })
}

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown"
}

function secret(): Uint8Array {
  const s = process.env.MAGIC_LINK_SECRET
  if (!s) throw new Error("MAGIC_LINK_SECRET is not set")
  return new TextEncoder().encode(s)
}

function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex")
}

/**
 * POST /api/auth/magic/request  body: { email }
 *
 * Says plainly why a link was NOT sent (unknown address, staff account,
 * deactivated…) — a product decision for usability. That does reveal which
 * addresses are registered, so lookups are rate limited per client and links
 * per address.
 */
export async function requestLink(req: NextRequest): Promise<NextResponse> {
  if (!process.env.MAGIC_LINK_SECRET) {
    console.error("[magic-link] MAGIC_LINK_SECRET is not set")
    return refuse("config", 500)
  }

  const { email } = (await req.json().catch(() => ({}))) as { email?: string }
  const normalized = email?.trim().toLowerCase()
  if (!normalized || !EMAIL_RE.test(normalized)) return refuse("invalid", 400)

  if (!allow(`magic-ip:${clientIp(req)}`, LIMIT_PER_CLIENT, LIMIT_WINDOW_MS)) {
    return refuse("ratelimited", 429)
  }

  const user = await prisma.user.findUnique({
    where: { email: normalized },
    include: { role: true, ...PARTNER_STATUS_SELECT },
  })

  // Only active EXTERNAL users of an Active grower/vendor get links; internal
  // staff authenticate via Entra.
  if (!user) return refuse("notfound", 404)
  if (!user.isActive) return refuse("inactive", 403)
  if (INTERNAL_ROLES.includes(user.role.roleName as RoleName)) return refuse("internal", 409)
  if (partnerAccessBlocked(user)) return refuse("partnerdisabled", 403)
  // Stops anyone flooding a real inbox.
  if (!allow(`magic-user:${user.id}`, LIMIT_PER_USER, LIMIT_WINDOW_MS)) {
    return refuse("ratelimited", 429)
  }

  // A random nonce ties the signed JWT to one DB row we can invalidate/burn.
  const nonce = randomBytes(32).toString("hex")
  const token = await new SignJWT({ purpose: PURPOSE, uid: user.id, nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${LINK_TTL_SECONDS}s`)
    .sign(secret())

  // Invalidate any earlier unconsumed links for this user, then store this one.
  await prisma.magicToken.updateMany({
    where: { userId: user.id, consumedAt: null },
    data: { consumedAt: new Date() },
  })
  await prisma.magicToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(nonce),
      expiresAt: new Date(Date.now() + LINK_TTL_SECONDS * 1000),
    },
  })

  const link = appUrl(`/api/auth/magic/consume?token=${encodeURIComponent(token)}`)

  // Local convenience: with no mail provider configured there is no inbox to
  // check, so put the link where the developer will find it.
  if (process.env.NODE_ENV !== "production") {
    console.warn("[magic-link] dev link:", link)
  }

  try {
    await notifyMagicLink({
      toEmail: user.email,
      locale: user.preferredLocale,
      link,
      expiresInMinutes: LINK_TTL_SECONDS / 60,
    })
  } catch (e) {
    console.error("[magic-link] send failed", e)
    return refuse("mailfailed", 500)
  }

  return NextResponse.json({ ok: true })
}

/**
 * GET /api/auth/magic/consume?token=…
 * Verifies signature + expiry + single-use, then starts the normal session.
 */
export async function consumeLink(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get("token")
  if (!token) return NextResponse.redirect(appUrl("/login?error=nolink"))

  let uid: number
  let nonce: string
  try {
    const { payload } = await jwtVerify(token, secret())
    if (
      payload.purpose !== PURPOSE ||
      typeof payload.uid !== "number" ||
      typeof payload.nonce !== "string"
    ) {
      throw new Error("bad-claims")
    }
    uid = payload.uid
    nonce = payload.nonce
  } catch {
    return NextResponse.redirect(appUrl("/login?error=linkexpired"))
  }

  // Single-use: the row must exist, match the user, be unexpired and unconsumed.
  const record = await prisma.magicToken.findUnique({
    where: { tokenHash: sha256(nonce) },
  })
  if (
    !record ||
    record.userId !== uid ||
    record.consumedAt !== null ||
    record.expiresAt.getTime() < Date.now()
  ) {
    return NextResponse.redirect(appUrl("/login?error=linkexpired"))
  }

  const user = await prisma.user.findUnique({
    where: { id: uid },
    include: { role: true, ...PARTNER_STATUS_SELECT },
  })
  if (!user || !user.isActive) {
    return NextResponse.redirect(appUrl("/login?error=unprovisioned"))
  }
  // Safe to be specific here: only the inbox owner can reach this point. Covers
  // a link issued just before the partner was disabled.
  if (partnerAccessBlocked(user)) {
    return NextResponse.redirect(appUrl("/login?error=partnerdisabled"))
  }

  // Burn the token (single-use), then reuse the existing session mechanism.
  await prisma.magicToken.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  })

  const res = NextResponse.redirect(
    appUrl(homePathForRole(user.role.roleName as RoleName))
  )
  for (const c of await sessionCookies(user.id)) {
    res.cookies.set(c.name, c.value, c.options)
  }
  return res
}
