import type { EmailMessage } from "@azure/communication-email"

/**
 * The Azure Communication Services wire layer — and nothing else.
 *
 * Deliberately knows nothing about NotificationLog: the queue bookkeeping lives
 * in lib/email/dispatch.ts, so the two can be reasoned about (and the retry
 * policy tuned) separately. Its one job is to turn "send this" into a verdict
 * the dispatcher can act on: succeeded, retry later, or give up.
 */

export type OutgoingEmail = {
  to: string[]
  subject: string
  text: string
  html?: string | null
}

export type SendResult =
  | { ok: true }
  | {
      ok: false
      retryable: boolean
      /** True only for a 429. The dispatcher ends its pass rather than pushing harder. */
      throttled?: boolean
      retryAfterMs?: number
      error: string
    }

/** Extracts an HTTP status from an Azure SDK RestError without importing it. */
function statusOf(e: unknown): number | undefined {
  const err = e as {
    statusCode?: number
    status?: number
    response?: { status?: number }
  }
  return err?.statusCode ?? err?.status ?? err?.response?.status
}

function retryAfterMsOf(e: unknown): number | undefined {
  const headers = (
    e as { response?: { headers?: { get?: (n: string) => string | undefined } } }
  )?.response?.headers
  const raw = headers?.get?.("retry-after")
  if (!raw) return undefined
  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined
}

/**
 * Throttling and transport hiccups are worth another go; a malformed address is
 * not. 401/403 counts as retryable on purpose — the usual cause is a rotated or
 * mistyped access key, and holding the mail through a few backoffs gives someone
 * a chance to fix it instead of burning the queue.
 */
function isRetryable(status: number | undefined): boolean {
  if (status === undefined) return true // network / DNS / timeout — no response at all
  if (status === 408 || status === 429) return true
  if (status === 401 || status === 403) return true
  return status >= 500
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

// Imported on first send rather than at module load: the offline demo
// (EMAIL_PROVIDER=local) never touches this file, and when it does we'd rather
// pay for the SDK once than on every cold start.
type EmailClientCtor = new (connectionString: string) => {
  beginSend: (
    message: EmailMessage,
    options?: { updateIntervalInMs?: number }
  ) => Promise<{ pollUntilDone: () => Promise<{ status: string; error?: { message?: string } }> }>
}
let cachedCtor: EmailClientCtor | null = null
async function emailClientCtor(): Promise<EmailClientCtor> {
  if (!cachedCtor) {
    const mod = await import("@azure/communication-email")
    cachedCtor = mod.EmailClient as unknown as EmailClientCtor
  }
  return cachedCtor
}

export async function sendEmail(mail: OutgoingEmail): Promise<SendResult> {
  const connectionString = process.env.ACS_CONNECTION_STRING
  const senderAddress = process.env.ACS_SENDER_ADDRESS

  if (!connectionString || !senderAddress) {
    // Outside production, an unconfigured ACS is treated as a successful send so
    // the whole queue path — pacing, priority, retry, the Outbox — is
    // exercisable on a laptop with no Azure account. In production it is a
    // hard failure, because there it means the deploy is broken.
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[email] ACS not configured; pretending to send "${mail.subject}" to ${mail.to.join(", ")}`
      )
      return { ok: true }
    }
    return { ok: false, retryable: false, error: "ACS_CONNECTION_STRING / ACS_SENDER_ADDRESS not set" }
  }

  const recipients = mail.to.map((address) => ({ address }))
  if (recipients.length === 0) {
    return { ok: false, retryable: false, error: "no recipients" }
  }

  try {
    const EmailClient = await emailClientCtor()
    const client = new EmailClient(connectionString)
    const poller = await client.beginSend(
      {
        senderAddress,
        content: {
          subject: mail.subject,
          plainText: mail.text,
          ...(mail.html ? { html: mail.html } : {}),
        },
        recipients: { to: recipients },
      },
      { updateIntervalInMs: 1000 }
    )

    // beginSend only means "accepted"; the send itself is a long-running
    // operation that can still come back Failed without ever throwing.
    const result = await poller.pollUntilDone()
    if (result.status !== "Succeeded") {
      return {
        ok: false,
        retryable: false,
        error: result.error?.message ?? `ACS returned status ${result.status}`,
      }
    }
    return { ok: true }
  } catch (e) {
    const status = statusOf(e)
    return {
      ok: false,
      retryable: isRetryable(status),
      throttled: status === 429,
      retryAfterMs: retryAfterMsOf(e),
      error: `${status ? `HTTP ${status}: ` : ""}${messageOf(e)}`,
    }
  }
}
