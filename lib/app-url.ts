/**
 * The absolute origin of this deployment.
 *
 * Three things need it and none of them can derive it from a request: emails
 * have no page context (a relative path resolves to nothing in an inbox), the
 * scheduled reminder run has no request at all, and OAuth/magic-link redirects
 * must not inherit the `http://` scheme that ACA's ingress presents to the
 * container. The pipeline sets APP_URL from the Container App's ingress FQDN,
 * so it cannot drift from the real hostname.
 */
export const APP_URL = (
  process.env.APP_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000"
).replace(/\/$/, "")

export const appUrl = (path: string): string => `${APP_URL}${path}`
