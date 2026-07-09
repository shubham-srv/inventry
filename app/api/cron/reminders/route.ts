import { runReminderCheck } from "@/lib/scheduler/reminders"

// Secret-protected endpoint the scheduler (Azure Timer Function, cron, etc.)
// calls to run the reminder check. Not gated by the login proxy (it's under /api).
//   curl -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/reminders
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  const provided = request.headers.get("x-cron-secret")
  if (!secret || provided !== secret) {
    return new Response("Unauthorized", { status: 401 })
  }
  const result = await runReminderCheck()
  return Response.json({ ok: true, ...result })
}
