import { runReminderCheck } from "@/lib/scheduler/reminders"
import { denyUnlessCronSecret } from "@/lib/cron-auth"

// Called by the `caj-reminders-*` Container Apps job, daily.
//
// This only QUEUES reminders — lib/email/dispatch.ts sends them, at whatever
// rate the mail provider allows — so it returns in milliseconds however many
// growers are overdue, and the job's replica timeout is never in play.
//   curl -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/reminders
export async function POST(request: Request) {
  const denied = denyUnlessCronSecret(request)
  if (denied) return denied

  const result = await runReminderCheck()
  return Response.json({ ok: true, ...result })
}
