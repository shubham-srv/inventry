// (No "server-only": reused by scripts/run-reminders.ts and the Azure Function.)
import { prisma } from "@/lib/db"
import { NOTIFICATION_TYPES } from "@/lib/constants"

// ============================================================
// Pluggable notifier.
//
// EMAIL_PROVIDER=local (default) records each message as a NotificationLog
// row (status "Mocked"), visible in the in-app Outbox — so email triggers
// are fully demoable offline. EMAIL_PROVIDER=acs delegates to the isolated
// Azure Communication Services sender in lib/email/acs (see INTEGRATION.md).
// ============================================================

export type NotificationInput = {
  type: string
  toEmail: string
  subject: string
  body: string
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

// ---------------- High-level helpers ----------------

export async function notifySubmissionReceived(opts: {
  growerId: number
  growerName: string
  toEmail: string | null
  submittedByName: string
  itemCount: number
}): Promise<void> {
  if (!opts.toEmail) return
  await notify({
    type: NOTIFICATION_TYPES.SUBMISSION_RECEIVED,
    toEmail: opts.toEmail,
    growerId: opts.growerId,
    subject: `Inventory submission received — ${opts.growerName}`,
    body: `${opts.submittedByName} submitted a daily inventory count for ${opts.growerName} covering ${opts.itemCount} item(s).`,
    relatedEntity: "GrowerSubmission",
  })
}

export async function notifyVendorSubmissionReceived(opts: {
  vendorId: number
  vendorName: string
  toEmail: string | null
  submittedByName: string
  itemCount: number
}): Promise<void> {
  if (!opts.toEmail) return
  await notify({
    type: NOTIFICATION_TYPES.SUBMISSION_RECEIVED,
    toEmail: opts.toEmail,
    vendorId: opts.vendorId,
    subject: `Supply report received — ${opts.vendorName}`,
    body: `${opts.submittedByName} submitted a supply report for ${opts.vendorName} covering ${opts.itemCount} item(s).`,
    relatedEntity: "VendorSubmission",
  })
}

export async function notifyMissingItemRequest(opts: {
  growerId: number
  growerName: string
  toEmail: string | null
  requestedByName: string
  itemName: string
}): Promise<void> {
  if (!opts.toEmail) return
  await notify({
    type: NOTIFICATION_TYPES.MISSING_ITEM_REQUEST,
    toEmail: opts.toEmail,
    growerId: opts.growerId,
    subject: `Missing item request — ${opts.growerName}`,
    body: `${opts.requestedByName} (${opts.growerName}) requested a new item: "${opts.itemName}".`,
    relatedEntity: "MissingItemRequest",
  })
}

export async function notifyLowInventory(opts: {
  growerId: number
  growerName: string
  toEmail: string | null
  flaggedByName: string
  itemName: string
  reason?: string | null
}): Promise<void> {
  if (!opts.toEmail) return
  await notify({
    type: NOTIFICATION_TYPES.LOW_INVENTORY,
    toEmail: opts.toEmail,
    growerId: opts.growerId,
    subject: `Low inventory flagged — ${opts.itemName}`,
    body: `${opts.flaggedByName} (${opts.growerName}) flagged "${opts.itemName}" as low inventory.${opts.reason ? ` Reason: ${opts.reason}` : ""}`,
    relatedEntity: "LowInventoryFlag",
  })
}
