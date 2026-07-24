// (No "server-only": reused by scripts/run-reminders.ts and the Azure Container
// Apps cron job, which run headless with no request/cookie context — which is
// exactly why the recipient's language must come from stored data, never a cookie.)
import * as React from "react"
import { render } from "@react-email/render"
import { prisma } from "@/lib/db"
import { makeT, type TFunction } from "@/lib/i18n/translate"
import { isLocale, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config"
import { NOTIFICATION_TYPES, ADMIN_ROLES } from "@/lib/constants"
import {
  NotificationEmail,
  type NotificationEmailProps,
} from "@/lib/email/templates/notification-email"

// ============================================================
// Pluggable notifier.
//
// EMAIL_PROVIDER=local (default) records each message as a NotificationLog
// row (status "Mocked"), visible in the in-app Outbox — so email triggers
// are fully demoable offline. EMAIL_PROVIDER=acs delegates to the isolated
// Azure Communication Services sender in lib/email/acs (see INTEGRATION.md).
//
// Every helper renders a localized React Email (HTML + plaintext) using the
// RECIPIENT's stored locale, then hands both parts to notify().
// ============================================================

// Absolute base URL for email CTA links — scheduled sends have no request to
// derive an origin from, so it must be configured.
const APP_URL = (
  process.env.APP_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000"
).replace(/\/$/, "")

const appUrl = (path: string) => `${APP_URL}${path}`

function toLocale(v: string | null | undefined): Locale {
  return isLocale(v) ? v : DEFAULT_LOCALE
}

export type NotificationInput = {
  type: string
  toEmail: string
  subject: string
  body: string // plaintext (Outbox list + email text part)
  html?: string | null // rendered React Email HTML (Outbox preview + email html part)
  growerId?: number | null
  vendorId?: number | null
  relatedEntity?: string | null
}

async function localSend(n: NotificationInput): Promise<void> {
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
      status: "Mocked",
    },
  })
}

async function acsSend(n: NotificationInput): Promise<void> {
  // Lazy import so the local demo never loads ACS dependencies.
  const { sendViaAcs } = await import("@/lib/email/acs/sender")
  await sendViaAcs(n)
}

/** Low-level send. Never throws into the request path — logs failures. */
export async function notify(n: NotificationInput): Promise<void> {
  try {
    if (process.env.EMAIL_PROVIDER === "acs") {
      await acsSend(n)
    } else {
      await localSend(n)
    }
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

// ---------------- High-level helpers ----------------

export async function notifySubmissionReceived(opts: {
  growerId: number
  growerName: string
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
      { label: t("email.detail.items"), value: String(opts.itemCount) },
    ],
    cta: { label: t("email.submissionReceived.cta"), href: appUrl("/grower/history") },
    variant: "success",
  })
  await notify({
    type: NOTIFICATION_TYPES.SUBMISSION_RECEIVED,
    toEmail: opts.toEmail,
    growerId: opts.growerId,
    subject: t("email.submissionReceived.subject", { grower: opts.growerName }),
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
  })
}

/**
 * New item request: fan out to EVERY active admin, each in their own language.
 * (Replaces the old single-recipient-to-grower behavior.)
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
  for (const admin of admins) {
    if (!admin.email) continue
    const locale = toLocale(admin.preferredLocale)
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
    await notify({
      type: NOTIFICATION_TYPES.MISSING_ITEM_REQUEST,
      toEmail: admin.email,
      growerId: opts.growerId,
      subject: t("email.missingItemRequest.subject", { grower: opts.growerName }),
      body: text,
      html,
      relatedEntity: "MissingItemRequest",
    })
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
  uom?: string | null
}): Promise<void> {
  if (!opts.toEmail) return
  const locale = toLocale(opts.locale)
  const t = makeT(locale)
  const qty = opts.uom ? `${opts.quantity} ${opts.uom}` : String(opts.quantity)
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
