/**
 * REFERENCE — Azure Functions (Node.js v4 model) Timer trigger.
 *
 * Runs the inventory reminder check on a schedule by calling the app's
 * secret-protected endpoint (app/api/cron/reminders). Keeping the logic in the
 * app means the Function needs no database access or Prisma — just network +
 * the shared CRON_SECRET.
 *
 * Deploy separately (this folder is its own Function App project — see
 * package.json / host.json here). Configure app settings:
 *   APP_URL      = https://your-app.example.com
 *   CRON_SECRET  = <same value as the web app's CRON_SECRET>
 */
import { app, InvocationContext, Timer } from "@azure/functions"

export async function remindersTimer(_timer: Timer, context: InvocationContext): Promise<void> {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000"
  const secret = process.env.CRON_SECRET ?? ""

  try {
    const res = await fetch(`${appUrl}/api/cron/reminders`, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    })
    const body = await res.json()
    context.log(`Reminder check: ${res.status}`, body)
  } catch (e) {
    context.error("Reminder check failed", e)
    throw e
  }
}

app.timer("remindersTimer", {
  // every day at 08:00 UTC (ncrontab: sec min hour day month dow)
  schedule: "0 0 8 * * *",
  handler: remindersTimer,
})
