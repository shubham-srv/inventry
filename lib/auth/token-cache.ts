import "server-only"
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import type { ICachePlugin, TokenCacheContext } from "@azure/msal-node"
import { prisma } from "@/lib/db"

/**
 * Per-user storage of the MSAL token cache.
 *
 * WHY THIS EXISTS. Power BI embedding needs an access token for the signed-in
 * admin, and those expire in about an hour while a session here lasts a week.
 * Minting a fresh one mid-session needs the refresh token MSAL keeps in its
 * cache — so, unlike every other part of this app's auth, something from
 * Microsoft has to be kept. lib/auth/session.ts deliberately keeps nothing; this
 * is the one exception, and it is isolated here rather than spread around.
 *
 * WHY IT IS ENCRYPTED. The cache contains a refresh token, which is a
 * long-lived credential for that person's Microsoft account. Encrypting before
 * it reaches the database means a backup, a read-only replica or a stray query
 * result does not hand anyone usable credentials — they would also need
 * TOKEN_CACHE_SECRET, which lives in Key Vault.
 *
 * WHY A SEPARATE SECRET. Same reasoning as MAGIC_LINK_SECRET being distinct from
 * SESSION_SECRET: a key that decrypts Microsoft refresh tokens and a key that
 * signs session cookies must never be interchangeable.
 *
 * WHY EACH CALL GETS ITS OWN CACHE. MSAL's cache is per-client and holds every
 * account it has seen. A process-wide client would mix users together, and
 * serializing it would write one user's tokens onto another's row. Every
 * operation therefore builds a client seeded with exactly one user's cache.
 */

const ALGORITHM = "aes-256-gcm"

export function isTokenCacheConfigured(): boolean {
  return Boolean(process.env.TOKEN_CACHE_SECRET)
}

function key(): Buffer {
  const secret = process.env.TOKEN_CACHE_SECRET
  if (!secret) throw new Error("[token-cache] TOKEN_CACHE_SECRET is not set")
  // The secret is an arbitrary-length string; AES-256 needs exactly 32 bytes.
  return createHash("sha256").update(secret).digest()
}

/** `iv.ciphertext.tag`, all base64url — one self-describing column value. */
function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key(), iv)
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return [iv, body, cipher.getAuthTag()].map((b) => b.toString("base64url")).join(".")
}

/**
 * Returns null rather than throwing on anything malformed or unauthentic — a
 * rotated secret, a truncated column, a tampered row. The caller treats that as
 * "no cache", which re-authenticates the user instead of failing forever.
 */
function decrypt(blob: string): string | null {
  try {
    const [iv, body, tag] = blob.split(".").map((p) => Buffer.from(p, "base64url"))
    if (!iv || !body || !tag) return null
    const decipher = createDecipheriv(ALGORITHM, key(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

/**
 * An MSAL cache plugin bound to one user's stored cache.
 *
 * `beforeCacheAccess` seeds the client with what we hold; `afterCacheAccess`
 * captures it again when MSAL says it changed — which is how a rotated refresh
 * token gets persisted rather than silently lost.
 */
export function userCachePlugin(initial: string | null): {
  plugin: ICachePlugin
  updated: () => string | null
} {
  let latest: string | null = null
  return {
    plugin: {
      async beforeCacheAccess(ctx: TokenCacheContext) {
        if (initial) ctx.tokenCache.deserialize(initial)
      },
      async afterCacheAccess(ctx: TokenCacheContext) {
        if (ctx.cacheHasChanged) latest = ctx.tokenCache.serialize()
      },
    },
    updated: () => latest,
  }
}

/** The decrypted cache for a user, or null when there is none or it is unreadable. */
export async function loadTokenCache(
  userId: number
): Promise<{ cache: string | null; homeAccountId: string | null }> {
  if (!isTokenCacheConfigured()) return { cache: null, homeAccountId: null }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { entraTokenCache: true, entraHomeAccountId: true },
  })
  if (!user?.entraTokenCache) return { cache: null, homeAccountId: user?.entraHomeAccountId ?? null }
  return {
    cache: decrypt(user.entraTokenCache),
    homeAccountId: user.entraHomeAccountId,
  }
}

/**
 * Encrypts and stores a cache. Never throws: failing to persist a token must not
 * fail the sign-in that produced it — the user is authenticated either way, and
 * the only consequence is that reports ask them to sign in again.
 */
export async function saveTokenCache(
  userId: number,
  cache: string,
  homeAccountId: string | null
): Promise<void> {
  if (!isTokenCacheConfigured()) return
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        entraTokenCache: encrypt(cache),
        ...(homeAccountId ? { entraHomeAccountId: homeAccountId } : {}),
      },
    })
  } catch (e) {
    console.error("[token-cache] could not store cache for user", userId, e)
  }
}

/** Forgets a user's cache, so the next attempt re-authenticates cleanly. */
export async function clearTokenCache(userId: number): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { entraTokenCache: null, entraHomeAccountId: null },
    })
  } catch (e) {
    console.error("[token-cache] could not clear cache for user", userId, e)
  }
}
