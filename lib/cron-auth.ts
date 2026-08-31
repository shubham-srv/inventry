/**
 * Shared guard for the scheduler endpoints.
 *
 * These sit under /api, which the proxy does not gate, and they are called by
 * Container Apps jobs that have no session — so a shared secret is the whole
 * authentication story. An unset CRON_SECRET denies rather than allows: a
 * missing config should close the door, not remove it.
 */
export function denyUnlessCronSecret(request: Request): Response | null {
  const secret = process.env.CRON_SECRET
  const provided = request.headers.get("x-cron-secret")
  if (!secret || provided !== secret) {
    return new Response("Unauthorized", { status: 401 })
  }
  return null
}
