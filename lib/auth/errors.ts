/**
 * Codes the auth routes append to `/login?error=…`.
 *
 * Kept in one place because the producers (lib/auth/entra.ts,
 * lib/auth/magic-link.ts) and the consumer (the login page's banner, via
 * `login.error.<code>` in both dictionaries) are in different layers, and a
 * silent bounce back to /login with no explanation is exactly the wrong
 * experience when Entra is half-configured.
 */
export const LOGIN_ERRORS = [
  "config", // the provider isn't configured on this deployment
  "entra", // Entra itself returned an error
  "state", // state/PKCE mismatch — stale tab, or a forged callback
  "nocode", // callback arrived without an authorization code
  "noidentity", // Entra returned neither an oid nor a username
  "unprovisioned", // authenticated, but no active User row matches
  "nolink", // magic-link consume with no token
  "linkexpired", // link expired, already used, or superseded
  "mailfailed", // we couldn't hand the sign-in link to the mail provider
] as const

export type LoginError = (typeof LOGIN_ERRORS)[number]

export function isLoginError(v: unknown): v is LoginError {
  return typeof v === "string" && (LOGIN_ERRORS as readonly string[]).includes(v)
}
