// (No "server-only": reused by scripts/run-reminders.ts and the Azure Container
// Apps cron job, which run headless with no request/cookie context — which is
// exactly why the recipient's language must come from stored data, never a cookie.)
import * as React from "react"
import { render } from "@react-email/render"
import { prisma } from "@/lib/db"
import { makeT, type TFunction } from "@/lib/i18n/translate"
import { isLocale, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config"
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_STATUS,
  EMAIL_PRIORITY,
  ADMIN_ROLES,
} from "@/lib/constants"
import { appUrl } from "@/lib/app-url"
import {
  NotificationEmail,
  type NotificationEmailProps,
} from "@/lib/email/templates/notification-email"

// ============================================================
// Pluggable notifier.
//
// EMAIL_PROVIDER=local (default) records each message as a NotificationLog row
// (status "Mocked"), visible in the in-app Outbox — so email triggers are fully
// demoable offline.
//
// EMAIL_PROVIDER=acs makes NotificationLog an OUTBOX: notify() writes a "Queued"
// row and returns, and lib/email/dispatch.ts does the sending at a rate the
// provider's limits allow. Nothing here talks to ACS, which is what stops the
// daily reminder burst from being throttled into silent data loss, and what
// stops an interactive server action from blocking on a mail round-trip.
// See docs/email-delivery.md.
//
// Every helper renders a localized React Email (HTML + plaintext) using the
// RECIPIENT's stored locale, then hands both parts to notify().
// ============================================================

/** ACS caps recipients per message; stay well under it and under toEmail's width. */
const MAX_RECIPIENTS_PER_MESSAGE = 20

function toLocale(v: string | null | undefined): Locale {
  return isLocale(v) ? v : DEFAULT_LOCALE
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export type NotificationInput = {
  type: string
  /** One or more recipients, comma-separated. */
  toEmail: string
  subject: string
  body: string // plaintext (Outbox list + email text part)
  html?: string | null // rendered React Email HTML (Outbox preview + email html part)
  growerId?: number | null
  vendorId?: number | null
  relatedEntity?: string | null
  /** See EMAIL_PRIORITY. Defaults to TRANSACTIONAL. */
  priority?: number
}

/**
 * Enqueue a notification. Never throws into the request path — logs failures.
 *
 * This does NOT send. With EMAIL_PROVIDER=acs the row is picked up by the
 * dispatcher; with `local` it is a mock that the dispatcher ignores.
 */
export async function notify(n: NotificationInput): Promise<void> {
  try {
    const live = process.env.EMAIL_PROVIDER === "acs"
    await prisma.notificationLog.create({
      data: {
        type: n.type,
        toEmail: n.toEmail,
        subject: n.subject,
        body: n.body,
        bodyHtml: n.html ?? null,
        growerId: n.growerId ?? null,
        vendorId: n.vendorId ?? null,
        relatedEntity: n.relatedEntity ?? null,
        priority: n.priority ?? EMAIL_PRIORITY.TRANSACTIONAL,
        status: live ? NOTIFICATION_STATUS.QUEUED : NOTIFICATION_STATUS.MOCKED,
      },
    })
  } catch (e) {
    console.error("notify() failed", e)
  }
}

// ---------------- Rendering ----------------

/** Render the shared NotificationEmail to { html, text } for one locale. */
async function renderNotification(
  t: TFunction,
  locale: Locale,
  props: Omit<NotificationEmailProps, "t" | "lang">
): Promise<{ html: string; text: string }> {
  const el = React.createElement(NotificationEmail, { t, lang: locale, ...props })
  const [html, text] = await Promise.all([render(el), render(el, { plainText: true })])
  return { html, text }
}

// ---------------- Sign-in links (the one email that does not queue) ----------

/** Thrown when the sign-in link could not be handed to the mail provider. */
export class MagicLinkSendError extends Error {}

/**
 * Emails a passwordless sign-in link — immediately, not through the queue.
 *
 * Two deliberate departures from every other helper here:
 *
 * 1. **It sends inline.** A 15-minute link delivered from a queue behind a
 *    hundred reminders is worthless, and the person is watching a "check your
 *    inbox" screen. lib/email/dispatch.ts reserves per-minute headroom for
 *    exactly this. It also means a failure can be reported instead of swallowed
 *    — hence the throw, which the route turns into a retry prompt.
 * 2. **The body is never stored.** It contains a live credential, and the
 *    Outbox page is readable by every admin. The log row keeps the subject,
 *    recipient and outcome so the audit trail survives; the link does not.
 */
export async function notifyMagicLink(opts: {
  toEmail: string
  locale: string | null
  link: string
  expiresInMinutes: number
}): Promise<void> {
  const locale = toLocale(opts.locale)
  const t = makeT(locale)
  const { html, text } = await renderNotification(t, locale, {
    preview: t("email.magicLink.heading"),
    heading: t("email.magicLink.heading"),
    intro: t("email.magicLink.intro"),
    note: t("email.magicLink.expiry", { minutes: opts.expiresInMinutes }),
    cta: { label: t("email.magicLink.cta"), href: opts.link },
    variant: "info",
  })
  const subject = t("email.magicLink.subject")

  const live = process.env.EMAIL_PROVIDER === "acs"
  const log = await prisma.notificationLog.create({
    data: {
      type: NOTIFICATION_TYPES.MAGIC_LINK,
      toEmail: opts.toEmail,
      subject,
      body: "[sign-in link — not stored]",
      bodyHtml: null,
      relatedEntity: "MagicToken",
      priority: EMAIL_PRIORITY.AUTH,
      status: live ? NOTIFICATION_STATUS.SENDING : NOTIFICATION_STATUS.MOCKED,
      attempts: live ? 1 : 0,
      // Counts against the dispatcher's rolling rate window: an inline send
      // spends provider allowance just like a queued one.
      lastAttemptAt: live ? new Date() : null,
    },
  })
  if (!live) return

  const { sendEmail } = await import("@/lib/email/acs/transport")
  const result = await sendEmail({ to: [opts.toEmail], subject, text, html })

  if (result.ok) {
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: { status: NOTIFICATION_STATUS.SENT, sentAt: new Date() },
    })
    return
  }

  // Not requeued on purpose — see the doc comment. The user asks again, which
  // mints a fresh link and invalidates this one.
  await prisma.notificationLog.update({
    where: { id: log.id },
    data: { status: NOTIFICATION_STATUS.FAILED, lastError: result.error.slice(0, 900) },
  })
  throw new MagicLinkSendError(result.error)
}

// ---------------- High-level helpers ----------------

// Fires once per location submitted, not once per grower per day — a
// multi-site grower gets one of these per site. The location is named in the
// subject and the detail rows so the mails are tellable apart in an inbox.
export async function notifySubmissionReceived(opts: {
  growerId: number
  growerName: string
  locationName: string
  toEmail: string | null
  locale: string | null
  submittedByName: string
  itemCount: number
}): Promise<void> {
  if (!opts.toEmail) return
  const locale = toLocale(opts.locale)
  const t = makeT(locale)
  const { html, text } = await renderNotification(t, locale, {
    preview: t("email.submissionReceived.heading"),
    heading: t("email.submissionReceived.heading"),
    intro: t("email.submissionReceived.intro", {
      grower: opts.growerName,
      submittedBy: opts.submittedByName,
    }),
    details: [
      { label: t("email.detail.grower"), value: opts.growerName },
      { label: t("email.detail.location"), value: opts.locationName },
      { label: t("email.detail.items"), value: String(opts.itemCount) },
    ],
    cta: { label: t("email.submissionReceived.cta"), href: appUrl("/grower/history") },
    variant: "success",
  })
  await notify({
    type: NOTIFICATION_TYPES.SUBMISSION_RECEIVED,
    toEmail: opts.toEmail,
    growerId: opts.growerId,
    subject: t("email.submissionReceived.subject", {
      grower: opts.growerName,
      location: opts.locationName,
    }),
    body: text,
    html,
    relatedEntity: "GrowerSubmission",
  })
}

export async function notifyVendorSubmissionReceived(opts: {
  vendorId: number
  vendorName: string
  toEmail: string | null
  locale: string | null
  submittedByName: string
  itemCount: number
}): Promise<void> {
  if (!opts.toEmail) return
  const locale = toLocale(opts.locale)
  const t = makeT(locale)
  const { html, text } = await renderNotification(t, locale, {
    preview: t("email.vendorSubmissionReceived.heading"),
    heading: t("email.vendorSubmissionReceived.heading"),
    intro: t("email.vendorSubmissionReceived.intro", {
      vendor: opts.vendorName,
      submittedBy: opts.submittedByName,
    }),
    details: [
      { label: t("email.detail.vendor"), value: opts.vendorName },
      { label: t("email.detail.items"), value: String(opts.itemCount) },
    ],
    cta: { label: t("email.vendorSubmissionReceived.cta"), href: appUrl("/vendor/history") },
    variant: "success",
  })
  await notify({
    type: NOTIFICATION_TYPES.SUBMISSION_RECEIVED,
    toEmail: opts.toEmail,
    vendorId: opts.vendorId,
    subject: t("email.vendorSubmissionReceived.subject", { vendor: opts.vendorName }),
    body: text,
    html,
    relatedEntity: "VendorSubmission",
  })
}

export async function notifyScheduledReminder(opts: {
  growerId: number
  growerName: string
  toEmail: string
  locale: string | null
  daysSince: number | null // null => never submitted / unknown
  cadenceType: string
}): Promise<void> {
  const locale = toLocale(opts.locale)
  const t = makeT(locale)
  const overdue =
    opts.daysSince == null
      ? t("email.scheduledReminder.overdueUnknown")
      : t("email.scheduledReminder.overdueDays", { days: opts.daysSince })
  const { html, text } = await renderNotification(t, locale, {
    preview: t("email.scheduledReminder.heading"),
    heading: t("email.scheduledReminder.heading"),
    intro: t("email.scheduledReminder.intro", { grower: opts.growerName, overdue }),
    details: [
      { label: t("email.detail.grower"), value: opts.growerName },
      { label: t("email.detail.cadence"), value: opts.cadenceType },
    ],
    cta: { label: t("email.scheduledReminder.cta"), href: appUrl("/grower/submit") },
    variant: "warning",
  })
  await notify({
    type: NOTIFICATION_TYPES.SCHEDULED_REMINDER,
    toEmail: opts.toEmail,
    growerId: opts.growerId,
    subject: t("email.scheduledReminder.subject", { grower: opts.growerName }),
    body: text,
    html,
    relatedEntity: "SchedulerSetting",
    // The one true bulk send: every overdue grower at once, once a day. It
    // yields the queue to anything a person is waiting on.
    priority: EMAIL_PRIORITY.BULK,
  })
}

/**
 * New item request: fan out to every active admin, each in their own language.
 *
 * Grouped by language rather than sent per-admin. Ten admins used to mean ten
 * sends for a single request, against a per-minute allowance measured in single
 * digits; this makes it one send per distinct language (so, in practice, two).
 * The wording is still each admin's own — only the addressing is shared.
 */
export async function notifyMissingItemRequest(opts: {
  growerId: number
  growerName: string
  requestedByName: string
  itemName: string
}): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { isActive: true, role: { roleName: { in: ADMIN_ROLES } } },
    select: { email: true, preferredLocale: true },
  })

  const byLocale = new Map<Locale, string[]>()
  for (const admin of admins) {
    if (!admin.email) continue
    const locale = toLocale(admin.preferredLocale)
    byLocale.set(locale, [...(byLocale.get(locale) ?? []), admin.email])
  }

  for (const [locale, recipients] of byLocale) {
    const t = makeT(locale)
    const { html, text } = await renderNotification(t, locale, {
      preview: t("email.missingItemRequest.heading"),
      heading: t("email.missingItemRequest.heading"),
      intro: t("email.missingItemRequest.intro", {
        requestedBy: opts.requestedByName,
        grower: opts.growerName,
      }),
      details: [
        { label: t("email.detail.item"), value: opts.itemName },
        { label: t("email.detail.grower"), value: opts.growerName },
        { label: t("email.detail.requestedBy"), value: opts.requestedByName },
      ],
      cta: { label: t("email.missingItemRequest.cta"), href: appUrl("/admin/requests") },
      variant: "info",
    })
    for (const group of chunk(recipients, MAX_RECIPIENTS_PER_MESSAGE)) {
      await notify({
        type: NOTIFICATION_TYPES.MISSING_ITEM_REQUEST,
        toEmail: group.join(","),
        growerId: opts.growerId,
        subject: t("email.missingItemRequest.subject", { grower: opts.growerName }),
        body: text,
        html,
        relatedEntity: "MissingItemRequest",
      })
    }
  }
}

export async function notifyRequestReviewed(opts: {
  growerId: number
  toEmail: string | null
  locale: string | null
  itemName: string
  status: string
  reviewNotes?: string | null
}): Promise<void> {
  if (!opts.toEmail) return
  const locale = toLocale(opts.locale)
  const t = makeT(locale)
  const statusLabel = t(`status.${opts.status}`)
  const details = [
    { label: t("email.detail.item"), value: opts.itemName },
    { label: t("email.detail.status"), value: statusLabel },
  ]
  if (opts.reviewNotes) details.push({ label: t("email.detail.reviewNotes"), value: opts.reviewNotes })
  const { html, text } = await renderNotification(t, locale, {
    preview: t("email.requestReviewed.heading"),
    heading: t("email.requestReviewed.heading"),
    intro: t("email.requestReviewed.intro", { item: opts.itemName, status: statusLabel }),
    details,
    cta: { label: t("email.requestReviewed.cta"), href: appUrl("/grower/requests") },
    variant: "info",
  })
  await notify({
    type: NOTIFICATION_TYPES.REQUEST_REVIEWED,
    toEmail: opts.toEmail,
    growerId: opts.growerId,
    subject: t("email.requestReviewed.subject", { item: opts.itemName }),
    body: text,
    html,
    relatedEntity: "MissingItemRequest",
  })
}

export async function notifyLowInventoryReviewed(opts: {
  growerId: number
  toEmail: string | null
  locale: string | null
  itemName: string
  reviewNotes?: string | null
}): Promise<void> {
  if (!opts.toEmail) return
  const locale = toLocale(opts.locale)
  const t = makeT(locale)
  const details = [{ label: t("email.detail.item"), value: opts.itemName }]
  if (opts.reviewNotes) details.push({ label: t("email.detail.reviewNotes"), value: opts.reviewNotes })
  const { html, text } = await renderNotification(t, locale, {
    preview: t("email.lowInventoryReviewed.heading"),
    heading: t("email.lowInventoryReviewed.heading"),
    intro: t("email.lowInventoryReviewed.intro", { item: opts.itemName }),
    details,
    cta: { label: t("email.lowInventoryReviewed.cta"), href: appUrl("/grower/submit") },
    variant: "info",
  })
  await notify({
    type: NOTIFICATION_TYPES.LOW_INVENTORY_REVIEWED,
    toEmail: opts.toEmail,
    growerId: opts.growerId,
    subject: t("email.lowInventoryReviewed.subject", { item: opts.itemName }),
    body: text,
    html,
    relatedEntity: "LowInventoryFlag",
  })
}

export async function notifyOrderPlaced(opts: {
  growerId: number
  toEmail: string | null
  locale: string | null
  itemName: string
  vendorName: string
  quantity: number
  /** The item's material category — what the quantity is counted in. */
  categoryName?: string | null
}): Promise<void> {
  if (!opts.toEmail) return
  const locale = toLocale(opts.locale)
  const t = makeT(locale)
  const qty = opts.categoryName
    ? `${opts.quantity} ${opts.categoryName}`
    : String(opts.quantity)
  const { html, text } = await renderNotification(t, locale, {
    preview: t("email.orderPlaced.heading"),
    heading: t("email.orderPlaced.heading"),
    intro: t("email.orderPlaced.intro", { item: opts.itemName, vendor: opts.vendorName }),
    details: [
      { label: t("email.detail.item"), value: opts.itemName },
      { label: t("email.detail.vendor"), value: opts.vendorName },
      { label: t("email.detail.quantity"), value: qty },
    ],
    cta: { label: t("email.orderPlaced.cta"), href: appUrl("/grower/on-order") },
    variant: "success",
  })
  await notify({
    type: NOTIFICATION_TYPES.ORDER_PLACED,
    toEmail: opts.toEmail,
    growerId: opts.growerId,
    subject: t("email.orderPlaced.subject", { item: opts.itemName }),
    body: text,
    html,
    relatedEntity: "Order",
  })
}
