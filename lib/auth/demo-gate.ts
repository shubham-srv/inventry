/**
 * Whether the credential-free demo user-picker is available.
 *
 * Lives in its own module, separate from the `"use server"` file that uses it,
 * so it stays a plain function rather than becoming a callable server action.
 *
 * Two conditions, belt and braces. NODE_ENV is baked into the production image
 * by the Dockerfile, so a deployed build cannot enable this however
 * AUTH_PROVIDER is set; AUTH_PROVIDER lets you rehearse the real login page on
 * a laptop without rebuilding.
 */
export function isDemoLoginEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" && process.env.AUTH_PROVIDER === "local"
  )
}
