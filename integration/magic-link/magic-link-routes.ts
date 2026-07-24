/**
 * REFERENCE — Passwordless magic-link authentication for EXTERNAL users
 * (growers & vendors). Internal staff use Entra (see ../entra/auth-routes.ts).
 *
 * This folder is excluded from the app build (tsconfig "exclude"). Nothing here
 * runs until you wire it in — see integration/INTEGRATION.md §"Magic-link".
 *
 * Design (keeps the SESSION layer in lib/auth/session.ts UNCHANGED):
 *   1. request → email a short-lived (15 min), single-use signed link.
 *   2. consume → verify it, burn it, and call the SAME createSession(user.id).
 *
 * TWO DISTINCT TOKENS — do not confuse them:
 *   • the 15-min LINK token (here): proves control of the inbox, once.
 *   • the 7-day SESSION cookie (createSession): keeps the user logged in.
 * They use different secrets and the link carries a `purpose` claim, so a leaked
 * link can never be replayed as a session (or vice-versa).
 *
 * Prereqs to activate (details in INTEGRATION.md):
 *   - add the MagicToken model (below) to prisma/schema.prisma + migrate
 *   - set MAGIC_LINK_SECRET, APP_URL, and the ACS_* vars
 *   - wire app/api/auth/magic/request + .../consume route handlers to these
 *   - add the email form to /login, and (optional) the sliding-session middleware
 *
 * ---- Prisma model to add (do NOT add until activating) ----------------------
 * model MagicToken {
 *   id         Int       @id @default(autoincrement())
 *   userId     Int
 *   tokenHash  String    @unique   // SHA-256 of a nonce; never store the raw token
 *   expiresAt  DateTime
 *   consumedAt DateTime?
 *   createdAt  DateTime  @default(now())
 *   user       User      @relation(fields: [userId], references: [id], onDelete: NoAction, onUpdate: NoAction)
 *   @@index([userId])
 * }
 * // …and add to model User:  magicTokens MagicToken[]
 * ----------------------------------------------------------------------------
 */
import { NextRequest, NextResponse } from "next/server"
import { createHash, randomBytes } from "node:crypto"
import { SignJWT, jwtVerify } from "jose"
import { prisma } from "@/lib/db"
import { createSession } from "@/lib/auth/session"
import { INTERNAL_ROLES, type RoleName } from "@/lib/constants"

const LINK_TTL_SECONDS = 15 * 60 // 15 minutes
const PURPOSE = "magic-link"

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
 * Always responds identically — never reveals whether the email exists.
 */
export async function requestLink(req: NextRequest): Promise<NextResponse> {
  const { email } = (await req.json().catch(() => ({}))) as { email?: string }
  const normalized = email?.trim().toLowerCase()

  const neutral = NextResponse.json({
    ok: true,
    message: "If that email is registered, a sign-in link is on its way.",
  })
  if (!normalized) return neutral

  const user = await prisma.user.findUnique({
    where: { email: normalized },
    include: { role: true },
  })

  // Only active EXTERNAL users get links; internal staff authenticate via Entra.
  if (!user || !user.isActive || INTERNAL_ROLES.includes(user.role.roleName as RoleName)) {
    return neutral
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

  const appUrl = process.env.APP_URL ?? "http://localhost:3000"
  const link = `${appUrl}/api/auth/magic/consume?token=${encodeURIComponent(token)}`
  await sendMagicLinkEmail(user.email, link)

  return neutral
}

/**
 * GET /api/auth/magic/consume?token=...
 * Verifies signature + expiry + single-use, then starts the normal session.
 */
export async function consumeLink(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get("token")
  if (!token) return NextResponse.redirect(new URL("/login?error=nolink", req.url))

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
    return NextResponse.redirect(new URL("/login?error=linkexpired", req.url))
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
    return NextResponse.redirect(new URL("/login?error=linkexpired", req.url))
  }

  const user = await prisma.user.findUnique({ where: { id: uid } })
  if (!user || !user.isActive) {
    return NextResponse.redirect(new URL("/login?error=unprovisioned", req.url))
  }

  // Burn the token (single-use), then reuse the existing session mechanism.
  await prisma.magicToken.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  })
  await createSession(user.id)
  return NextResponse.redirect(new URL("/", req.url))
}

// --- ACS email send (mirrors lib/email/acs/sender.ts's lazy import) ----------
async function sendMagicLinkEmail(toEmail: string, link: string): Promise<void> {
  const connectionString = process.env.ACS_CONNECTION_STRING
  const senderAddress = process.env.ACS_SENDER_ADDRESS
  if (!connectionString || !senderAddress) {
    // Dev fallback: no ACS configured — log the link so you can click it locally.
    console.warn("[magic-link] ACS not configured; dev link:", link)
    return
  }
  const pkg = "@azure/communication-email"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import(/* webpackIgnore: true */ pkg)
  const client = new mod.EmailClient(connectionString)
  const poller = await client.beginSend({
    senderAddress,
    content: {
      subject: "Your sign-in link",
      plainText:
        `Sign in to the inventory portal:\n\n${link}\n\n` +
        `This link expires in 15 minutes and can be used once. ` +
        `If you didn't request it, you can ignore this email.`,
    },
    recipients: { to: [{ address: toEmail }] },
  })
  await poller.pollUntilDone()
}
