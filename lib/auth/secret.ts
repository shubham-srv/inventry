/**
 * The session-signing secret, in one place, failing closed.
 *
 * Previously each of the three call sites did
 * `process.env.SESSION_SECRET || "dev-only-insecure-secret"`. If the variable
 * ever went missing in production — a renamed Container App secret, a
 * `secretref` that didn't resolve — the app kept serving happily and signed
 * every session with a constant that is public in this repo. Anyone could then
 * mint `{ userId: 1 }` and be SuperAdmin; scripts/dev-mint-session.ts is a
 * working minter that defaults to exactly that string.
 *
 * MAGIC_LINK_SECRET returns a 500 when unset and CRON_SECRET denies when unset.
 * This was the most powerful of the three and the only one that degraded
 * silently. Now it refuses to sign or verify anything in production.
 *
 * Edge-safe on purpose — no `server-only`, no Prisma — because proxy.ts and
 * lib/auth/sliding-session.ts import it from the Edge runtime.
 */

export const INSECURE_SESSION_SECRET = "dev-only-insecure-secret"

/**
 * Describes what is wrong with the configured secret, or null if it is usable.
 * Separate from sessionSecret() so instrumentation.ts can fail the process at
 * startup rather than leaving the first unlucky request to discover it.
 */
export function sessionSecretProblem(): string | null {
  if (process.env.NODE_ENV !== "production") return null
  const s = process.env.SESSION_SECRET
  if (!s) return "SESSION_SECRET is not set"
  if (s === INSECURE_SESSION_SECRET) return "SESSION_SECRET is still the development default"
  return null
}

/**
 * The signing key. Throws in production when misconfigured.
 *
 * Callers must invoke this OUTSIDE the try/catch that wraps `jwtVerify`, so a
 * configuration fault surfaces as a loud 500 instead of being swallowed as
 * "that token is invalid" — which would silently log out every user at once
 * and look like an application bug rather than a missing env var.
 */
export function sessionSecret(): Uint8Array {
  const problem = sessionSecretProblem()
  if (problem) {
    throw new Error(`[auth] ${problem} — refusing to sign or verify sessions.`)
  }
  return new TextEncoder().encode(
    process.env.SESSION_SECRET || INSECURE_SESSION_SECRET
  )
}
