import { dispatchQueuedEmails } from "@/lib/email/dispatch"

/**
 * Drains the email outbox from inside the running app.
 *
 * The alternative was a Container Apps job on a one-minute cron, which is ~1,440
 * container starts a day for work that takes seconds — most of the free vCPU
 * grant spent on scheduling overhead. The web app is already running with a
 * warm replica, so it ticks here instead, and the ACA job stays as a
 * lower-frequency safety net for when this process isn't up.
 *
 * Concurrency is not this file's problem: dispatchQueuedEmails() claims rows
 * with a single atomic UPDATE, so any number of replicas, cron hits and admin
 * button presses can overlap without sending anything twice.
 */

const DEFAULT_INTERVAL_MS = 30_000

// Survives dev hot-reload, which re-evaluates modules and would otherwise
// stack up a new timer on every edit.
const g = globalThis as unknown as { __emailDispatchLoopStarted?: boolean }

function schedule(fn: () => void, ms: number): void {
  const timer = setTimeout(fn, ms) as unknown as { unref?: () => void }
  // Never keep the process alive on the loop's account — Next owns the lifecycle.
  timer.unref?.()
}

export function startEmailDispatchLoop(): void {
  if (g.__emailDispatchLoopStarted) return

  // Nothing to drain when messages are only ever mocked.
  if (process.env.EMAIL_PROVIDER !== "acs") return

  const raw = Number(process.env.EMAIL_DISPATCH_INTERVAL_MS ?? DEFAULT_INTERVAL_MS)
  const interval = Number.isFinite(raw) ? raw : DEFAULT_INTERVAL_MS
  // Explicitly opt out by setting the interval to 0 — useful when you want the
  // cron job or the admin button to be the only thing that sends.
  if (interval <= 0) return

  g.__emailDispatchLoopStarted = true

  const tick = async (): Promise<void> => {
    try {
      const result = await dispatchQueuedEmails()
      // Quiet passes are the common case; only say something when work happened.
      if (result.sent || result.failed || result.requeued || result.throttled) {
        console.log("[email] dispatch", result)
      }
    } catch (e) {
      console.error("[email] dispatch pass failed", e)
    } finally {
      schedule(tick, interval)
    }
  }

  console.log(`[email] dispatch loop started (every ${interval}ms)`)
  schedule(tick, interval)
}
