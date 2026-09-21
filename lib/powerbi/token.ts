import "server-only"
import { freshClient, isEntraConfigured } from "@/lib/auth/entra"
import {
  clearTokenCache,
  isTokenCacheConfigured,
  loadTokenCache,
  saveTokenCache,
  userCachePlugin,
} from "@/lib/auth/token-cache"

/**
 * A Power BI access token for one signed-in admin ("embed for your organization").
 *
 * WHY A SECOND TOKEN. An Entra access token has a single audience, so the token
 * obtained at sign-in — which is for Microsoft Graph — cannot be used against
 * Power BI. This exchanges the refresh token kept from that sign-in for a second
 * access token, scoped to Power BI, for the same person.
 *
 * WHY NOT JUST FRAME THE REPORT. A secure-embed URL in an iframe authenticates
 * itself with Microsoft cookies in a cross-site context, which Safari blocks
 * outright and Chrome, Edge and Firefox increasingly restrict. Handing the embed
 * a token we fetched ourselves removes the frame's need to authenticate anyone,
 * so it works the same in every browser.
 *
 * Read-only by design: these scopes can read reports and their models, nothing
 * more, and only what the signed-in person can already see in Power BI.
 */

const SCOPES = [
  "https://analysis.windows.net/powerbi/api/Report.Read.All",
  "https://analysis.windows.net/powerbi/api/Dataset.Read.All",
]

/** Why a token could not be produced — each maps to a different thing to fix. */
export type PowerBiTokenError =
  | "entra-not-configured" // this deployment has no Entra app registration
  | "cache-not-configured" // TOKEN_CACHE_SECRET is unset, so nothing was stored
  | "no-session" // signed in some other way (demo picker), or before this shipped
  | "consent-required" // admin consent for the Power BI permission is missing
  | "failed" // anything else; details are in the server log

export type PowerBiTokenResult =
  | { ok: true; token: string; expiresOn: Date | null }
  | { ok: false; reason: PowerBiTokenError }

/**
 * Entra reports a missing admin consent as one of these. It is worth separating
 * from a generic failure because it is the single most likely thing to be wrong
 * on a first deployment, and the fix is somebody clicking one button rather than
 * anything in this codebase.
 */
function isConsentError(e: unknown): boolean {
  const text = JSON.stringify(
    e instanceof Error ? { m: e.message, ...(e as unknown as object) } : e
  )
  return (
    text.includes("AADSTS65001") || // user or admin has not consented
    text.includes("interaction_required") ||
    text.includes("consent_required") ||
    text.includes("invalid_grant")
  )
}

export async function getPowerBiToken(userId: number): Promise<PowerBiTokenResult> {
  if (!isEntraConfigured()) return { ok: false, reason: "entra-not-configured" }
  if (!isTokenCacheConfigured()) return { ok: false, reason: "cache-not-configured" }

  const { cache, homeAccountId } = await loadTokenCache(userId)
  // No cache means this person did not sign in through Entra — the dev picker,
  // or a session that predates this feature. Either way there is nothing to
  // renew from and they need to sign in with Microsoft again.
  if (!cache || !homeAccountId) return { ok: false, reason: "no-session" }

  const { plugin, updated } = userCachePlugin(cache)

  try {
    const app = await freshClient(plugin)
    const account = await app.getTokenCache().getAccountByHomeId(homeAccountId)
    if (!account) return { ok: false, reason: "no-session" }

    const result = await app.acquireTokenSilent({ account, scopes: SCOPES })
    if (!result?.accessToken) return { ok: false, reason: "failed" }

    // Entra rotates refresh tokens, so the cache usually changes on every
    // acquisition. Persisting it is what keeps this working next week rather
    // than only for the life of the first refresh token.
    const rotated = updated()
    if (rotated) await saveTokenCache(userId, rotated, homeAccountId)

    return { ok: true, token: result.accessToken, expiresOn: result.expiresOn ?? null }
  } catch (e) {
    if (isConsentError(e)) {
      console.error("[powerbi] token needs consent or re-authentication", e)
      // The stored cache cannot satisfy this scope. Drop it so the user is asked
      // to sign in again rather than retrying a refresh token that will not work.
      await clearTokenCache(userId)
      return { ok: false, reason: "consent-required" }
    }
    console.error("[powerbi] acquireTokenSilent failed", e)
    return { ok: false, reason: "failed" }
  }
}

/** The report id Power BI needs, read out of its own embed URL. */
export function reportIdFromEmbedUrl(embedUrl: string): string | null {
  try {
    return new URL(embedUrl).searchParams.get("reportId")
  } catch {
    return null
  }
}
