// (No "server-only": this module is also run from scripts/run-reminders.ts,
// headless, with no request or cookie context.)
import { calendarDaysBetween, dayStart } from "@/lib/dates"
import { prisma } from "@/lib/db"
import { notifyScheduledReminder, notifyVendorScheduledReminder } from "@/lib/email/notify"
import { NOTIFICATION_TYPES, SCHEDULER_SCOPES, SUBMISSION_STATUS } from "@/lib/constants"
import { ACTIVE_ITEM } from "@/lib/items/active"

// Shared reminder logic. Invoked by:
//  - the daily Container Apps job, via POST /api/cron/reminders
//  - the admin "Run reminder check now" button (server action)
//  - `npm run reminders` (scripts/run-reminders.ts)
//
// It only ENQUEUES: notify() writes to the NotificationLog outbox and returns,
// and lib/email/dispatch.ts sends at the mail provider's allowed rate. So a
// hundred overdue growers is a hundred fast inserts here, not a hundred
// simultaneous sends that the provider would start rejecting partway through.

type SettingLike = { cadenceType: string; thresholdDays: number }

/**
 * Days of silence tolerated before a grower counts as overdue.
 *
 * `thresholdDays` is only consulted for "AfterNDays" — the named cadences carry
 * their own tolerance. Exported so the admin table can display the figure that
 * is actually in force rather than the raw column, which for a Weekly row can
 * say something quite different.
 */
export function cadenceDays(s: SettingLike): number {
  switch (s.cadenceType) {
    case "Daily":
      return 1
    case "Weekly":
      return 7
    case "Monthly":
      return 30
    case "AfterNDays":
    default:
      return s.thresholdDays
  }
}

export type ReminderResult = {
  checked: number
  remindersCreated: number
  messages: string[]
}

export async function runReminderCheck(): Promise<ReminderResult> {
  const growers = await remindGrowers()
  const vendors = await remindVendors()
  return {
    checked: growers.checked + vendors.checked,
    remindersCreated: growers.remindersCreated + vendors.remindersCreated,
    messages: [...growers.messages, ...vendors.messages],
  }
}

async function remindGrowers(): Promise<ReminderResult> {
  const [globalSetting, growerSettings, growers] = await Promise.all([
    prisma.schedulerSetting.findFirst({ where: { scope: SCHEDULER_SCOPES.GROWER_DEFAULT } }),
    prisma.schedulerSetting.findMany({ where: { scope: SCHEDULER_SCOPES.GROWER } }),
    prisma.grower.findMany({ where: { status: "Active" } }),
  ])

  const byGrower = new Map(
    growerSettings.filter((s) => s.growerId != null).map((s) => [s.growerId!, s])
  )
  const today = dayStart()
  let remindersCreated = 0
  const messages: string[] = []

  for (const g of growers) {
    const setting = byGrower.get(g.id) ?? globalSetting
    if (!setting || !setting.isEnabled) continue
    const toEmail = g.primaryEmail?.trim()
    if (!toEmail) {
      messages.push(`${g.growerName}: no primary email → skipped`)
      continue
    }

    const days = cadenceDays(setting)

    // Overdue is judged PER LOCATION, then reduced to the worst one.
    //
    // Taking the grower's single most recent submission would mean a three-site
    // grower who only ever counts Salinas looks up to date forever, and the two
    // sites nobody has touched in a month never generate a reminder. The clock
    // is only reset for a location by that location being submitted.
    //
    // Drafts don't count as submitting — only Approved submissions reset it.
    const [locations, lastByLocation] = await Promise.all([
      prisma.growerLocation.findMany({
        where: { growerId: g.id, isActive: true },
        select: { locationId: true },
      }),
      prisma.growerSubmission.groupBy({
        by: ["locationId"],
        where: { growerId: g.id, status: SUBMISSION_STATUS.APPROVED },
        _max: { submissionDate: true },
      }),
    ])
    // No locations mapped means the grower cannot submit at all yet; that is an
    // admin setup gap, not something to nag the grower about.
    if (locations.length === 0) continue

    const lastAt = new Map(
      lastByLocation.map((r) => [r.locationId, r._max.submissionDate])
    )
    const daysSince = locations.reduce((worst, l) => {
      const last = lastAt.get(l.locationId)
      const gap = last
        ? calendarDaysBetween(today, dayStart(last))
        : Number.POSITIVE_INFINITY
      return Math.max(worst, gap)
    }, 0)

    if (daysSince < days) continue

    // Idempotent: at most one reminder per grower per day.
    const already = await prisma.notificationLog.findFirst({
      where: {
        type: NOTIFICATION_TYPES.SCHEDULED_REMINDER,
        growerId: g.id,
        createdAt: { gte: today },
      },
    })
    if (already) continue

    const overdueLabel = Number.isFinite(daysSince) ? `${daysSince} day(s)` : "a while"
    // Language comes from the grower record (headless run — no request cookie).
    await notifyScheduledReminder({
      growerId: g.id,
      growerName: g.growerName,
      toEmail,
      locale: g.preferredLocale,
      daysSince: Number.isFinite(daysSince) ? daysSince : null,
      cadenceType: setting.cadenceType,
    })
    remindersCreated++
    messages.push(`${g.growerName}: overdue ${overdueLabel} → reminder queued`)
  }

  return { checked: growers.length, remindersCreated, messages }
}

/**
 * Same rules for vendors, simpler clock: a vendor reports once per day with no
 * locations, so overdue = days since their last report. Vendors with no live
 * mapped items have nothing to report and are skipped.
 */
async function remindVendors(): Promise<ReminderResult> {
  const [defaultSetting, vendorSettings, vendors, lastByVendor] = await Promise.all([
    prisma.schedulerSetting.findFirst({ where: { scope: SCHEDULER_SCOPES.VENDOR_DEFAULT } }),
    prisma.schedulerSetting.findMany({ where: { scope: SCHEDULER_SCOPES.VENDOR } }),
    prisma.vendor.findMany({
      where: { status: "Active" },
      select: {
        id: true,
        vendorName: true,
        _count: { select: { itemVendors: { where: { isActive: true, item: ACTIVE_ITEM } } } },
      },
    }),
    prisma.vendorSubmission.groupBy({ by: ["vendorId"], _max: { submissionDate: true } }),
  ])

  const byVendor = new Map(
    vendorSettings.filter((s) => s.vendorId != null).map((s) => [s.vendorId!, s])
  )
  const lastAt = new Map(lastByVendor.map((r) => [r.vendorId, r._max.submissionDate]))
  const today = dayStart()
  let remindersCreated = 0
  const messages: string[] = []

  for (const v of vendors) {
    const setting = byVendor.get(v.id) ?? defaultSetting
    if (!setting || !setting.isEnabled) continue
    if (v._count.itemVendors === 0) continue

    const last = lastAt.get(v.id)
    const daysSince = last
      ? calendarDaysBetween(today, dayStart(last))
      : Number.POSITIVE_INFINITY
    if (daysSince < cadenceDays(setting)) continue

    // At most one reminder per vendor per day.
    const already = await prisma.notificationLog.findFirst({
      where: {
        type: NOTIFICATION_TYPES.VENDOR_SCHEDULED_REMINDER,
        vendorId: v.id,
        createdAt: { gte: today },
      },
    })
    if (already) continue

    const overdueLabel = Number.isFinite(daysSince) ? `${daysSince} day(s)` : "a while"
    const queued = await notifyVendorScheduledReminder({
      vendorId: v.id,
      daysSince: Number.isFinite(daysSince) ? daysSince : null,
      cadenceType: setting.cadenceType,
    })
    if (!queued) {
      messages.push(`${v.vendorName}: overdue ${overdueLabel}, but no contact or user email → skipped`)
      continue
    }
    remindersCreated++
    messages.push(`${v.vendorName}: overdue ${overdueLabel} → reminder queued`)
  }

  return { checked: vendors.length, remindersCreated, messages }
}
