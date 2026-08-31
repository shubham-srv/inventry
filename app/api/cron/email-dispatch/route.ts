import { dispatchQueuedEmails } from "@/lib/email/dispatch"
import { denyUnlessCronSecret } from "@/lib/cron-auth"

// Runs one paced pass over the email outbox.
//
// The running app already drains the queue on a timer
// (lib/email/dispatch-loop.ts); this endpoint is the SAFETY NET the
// `caj-email-dispatch-*` Container Apps job hits every 15 minutes, so a
// restarted or scaled-to-zero app can't leave mail sitting. Also the handiest
// way to watch the pacing work locally.
//   curl -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/email-dispatch
export async function POST(request: Request) {
  const denied = denyUnlessCronSecret(request)
  if (denied) return denied

  const result = await dispatchQueuedEmails()
  return Response.json({ ok: true, ...result })
}
