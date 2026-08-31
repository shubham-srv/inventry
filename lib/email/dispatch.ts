// (No "server-only": also reached from the /api/cron/email-dispatch route and,
// via lib/email/dispatch-loop.ts, from instrumentation at server start.)
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { NOTIFICATION_STATUS, NOTIFICATION_TYPES } from "@/lib/constants"
import { sendEmail } from "@/lib/email/acs/transport"

/**
 * The paced drain of the NotificationLog outbox.
 *
 * Why this exists: Azure Communication Services allows only a handful of sends
 * per minute on an Azure-managed domain. The daily reminder run queues one
 * message per overdue grower in a single burst — sending those inline meant the
 * provider started rejecting them partway through and the rejected ones were
 * simply lost. Here they wait their turn instead, and a rejection is a delay
 * rather than a deletion. See docs/email-delivery.md for the limits themselves.
 */

function envInt(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback
}

/** Defaults are the conservative Azure-managed-domain figures. */
export function rateConfig() {
  return {
    perMinute: envInt(process.env.EMAIL_RATE_PER_MINUTE, 5),
    perHour: envInt(process.env.EMAIL_RATE_PER_HOUR, 100),
    /** Per-minute slots the dispatcher will not spend, held for sign-in links. */
    reserve: envInt(process.env.EMAIL_INTERACTIVE_RESERVE, 2),
    batch: envInt(process.env.EMAIL_DISPATCH_BATCH, 25),
  }
}

/** A dispatcher that dies mid-pass leaves rows claimed; this is when to take them back. */
const STALE_LOCK_MS = 5 * 60 * 1000
/** Minutes to wait before attempt 2, 3, 4, 5. */
const BACKOFF_MINUTES = [1, 5, 15, 60]
const MAX_ATTEMPTS = 5
const DEFAULT_THROTTLE_WAIT_MS = 60_000

export type DispatchResult = {
  reclaimed: number
  claimed: number
  sent: number
  requeued: number
  failed: number
  /** The provider asked us to slow down; the pass stopped early. */
  throttled: boolean
  note?: "not-live" | "no-budget" | "empty"
}

const EMPTY: DispatchResult = {
  reclaimed: 0,
  claimed: 0,
  sent: 0,
  requeued: 0,
  failed: 0,
  throttled: false,
}

/**
 * Runs one bounded pass. Safe to call concurrently — from several app replicas,
 * the cron job, and the admin button at once — because rows are claimed with a
 * single atomic UPDATE and skipped if another pass already holds them.
 */
export async function dispatchQueuedEmails(): Promise<DispatchResult> {
  // EMAIL_PROVIDER=local writes "Mocked" rows that are never meant to leave the
  // building, so there is nothing here to do.
  if (process.env.EMAIL_PROVIDER !== "acs") return { ...EMPTY, note: "not-live" }

  const cfg = rateConfig()
  const now = Date.now()
  const staleBefore = new Date(now - STALE_LOCK_MS)

  // --- 1. Take back rows a crashed pass left claimed ------------------------
  // A sign-in link is the exception: its body was deliberately never stored, so
  // there is nothing left to send and it can only be closed out as failed.
  const [{ count: reclaimed }] = await Promise.all([
    prisma.notificationLog.updateMany({
      where: {
        status: NOTIFICATION_STATUS.SENDING,
        lastAttemptAt: { lt: staleBefore },
        type: { not: NOTIFICATION_TYPES.MAGIC_LINK },
      },
      data: { status: NOTIFICATION_STATUS.QUEUED },
    }),
    prisma.notificationLog.updateMany({
      where: {
        status: NOTIFICATION_STATUS.SENDING,
        lastAttemptAt: { lt: staleBefore },
        type: NOTIFICATION_TYPES.MAGIC_LINK,
      },
      data: {
        status: NOTIFICATION_STATUS.FAILED,
        lastError: "Abandoned mid-send; the link was never stored, so it cannot be retried.",
      },
    }),
  ])

  // --- 2. What the provider will still accept this minute / hour ------------
  // Counted from attempts, not successes: a rejected request spends the
  // provider's allowance exactly like an accepted one does.
  const [usedThisMinute, usedThisHour] = await Promise.all([
    prisma.notificationLog.count({
      where: { lastAttemptAt: { gte: new Date(now - 60_000) } },
    }),
    prisma.notificationLog.count({
      where: { lastAttemptAt: { gte: new Date(now - 3_600_000) } },
    }),
  ])

  const budget = Math.min(
    cfg.perMinute - cfg.reserve - usedThisMinute,
    cfg.perHour - usedThisHour,
    cfg.batch
  )
  if (budget <= 0) return { ...EMPTY, reclaimed, note: "no-budget" }

  // --- 3. Claim a batch atomically -----------------------------------------
  // `budget` is derived from env config and clamped to an integer above, never
  // from user input, so interpolating it into TOP is safe — and it sidesteps
  // SQL Server's fussiness about a parameterised TOP inside a CTE.
  const take = Prisma.raw(String(Math.max(1, Math.floor(budget))))
  const claimedRows = await prisma.$queryRaw<{ id: number }[]>`
    WITH cte AS (
      SELECT TOP (${take}) [id], [status], [attempts], [lastAttemptAt]
      FROM [dbo].[NotificationLog] WITH (ROWLOCK, UPDLOCK, READPAST)
      WHERE [status] = ${NOTIFICATION_STATUS.QUEUED}
        AND [type] <> ${NOTIFICATION_TYPES.MAGIC_LINK}
        AND ([nextAttemptAt] IS NULL OR [nextAttemptAt] <= SYSUTCDATETIME())
      ORDER BY [priority] ASC, [createdAt] ASC
    )
    UPDATE cte
    SET [status] = ${NOTIFICATION_STATUS.SENDING},
        [attempts] = [attempts] + 1,
        [lastAttemptAt] = SYSUTCDATETIME()
    OUTPUT inserted.[id]
  `
  const ids = claimedRows.map((r) => r.id)
  if (ids.length === 0) return { ...EMPTY, reclaimed, note: "empty" }

  const rows = await prisma.notificationLog.findMany({
    where: { id: { in: ids } },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  })

  // --- 4. Send ---------------------------------------------------------------
  const result: DispatchResult = { ...EMPTY, reclaimed, claimed: ids.length }
  const unattempted = new Set(ids)

  for (const row of rows) {
    unattempted.delete(row.id)
    const to = row.toEmail
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)

    const outcome = await sendEmail({
      to,
      subject: row.subject,
      text: row.body,
      html: row.bodyHtml,
    })

    if (outcome.ok) {
      await prisma.notificationLog.update({
        where: { id: row.id },
        data: {
          status: NOTIFICATION_STATUS.SENT,
          sentAt: new Date(),
          lastError: null,
          nextAttemptAt: null,
        },
      })
      result.sent++
      continue
    }

    // Being throttled is not this message's fault, so it does not spend a
    // retry — but there is no point working through the rest of the batch.
    if (outcome.throttled) {
      await prisma.notificationLog.update({
        where: { id: row.id },
        data: {
          status: NOTIFICATION_STATUS.QUEUED,
          attempts: { decrement: 1 },
          nextAttemptAt: new Date(
            Date.now() + (outcome.retryAfterMs ?? DEFAULT_THROTTLE_WAIT_MS)
          ),
          lastError: outcome.error.slice(0, 900),
        },
      })
      result.requeued++
      result.throttled = true
      break
    }

    if (outcome.retryable && row.attempts < MAX_ATTEMPTS) {
      const waitMinutes =
        BACKOFF_MINUTES[Math.min(row.attempts - 1, BACKOFF_MINUTES.length - 1)]
      await prisma.notificationLog.update({
        where: { id: row.id },
        data: {
          status: NOTIFICATION_STATUS.QUEUED,
          nextAttemptAt: new Date(Date.now() + waitMinutes * 60_000),
          lastError: outcome.error.slice(0, 900),
        },
      })
      result.requeued++
      continue
    }

    await prisma.notificationLog.update({
      where: { id: row.id },
      data: { status: NOTIFICATION_STATUS.FAILED, lastError: outcome.error.slice(0, 900) },
    })
    result.failed++
  }

  // Release anything the throttle cut short. Their inflated lastAttemptAt is
  // left alone: it makes the next pass think it has slightly less allowance
  // than it does, which is the safe direction to be wrong in.
  if (unattempted.size > 0) {
    await prisma.notificationLog.updateMany({
      where: { id: { in: [...unattempted] } },
      data: { status: NOTIFICATION_STATUS.QUEUED, attempts: { decrement: 1 } },
    })
    result.requeued += unattempted.size
  }

  return result
}
