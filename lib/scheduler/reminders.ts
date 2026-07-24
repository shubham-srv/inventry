// (No "server-only": this module is also run from scripts/run-reminders.ts
// and the isolated Azure Timer Function.)
import { startOfDay, differenceInCalendarDays } from "date-fns"
import { prisma } from "@/lib/db"
import { notifyScheduledReminder } from "@/lib/email/notify"
import { NOTIFICATION_TYPES, SUBMISSION_STATUS } from "@/lib/constants"

// Shared reminder logic. Invoked by:
//  - the admin "Run reminder check now" button (server action)
//  - `npm run reminders` (scripts/run-reminders.ts)
//  - the isolated Azure Timer Function (integration/azure-functions)

type SettingLike = { cadenceType: string; thresholdDays: number; isEnabled: boolean }

function cadenceDays(s: SettingLike): number {
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
  const [globalSetting, growerSettings, growers] = await Promise.all([
    prisma.schedulerSetting.findFirst({ where: { scope: "Global" } }),
    prisma.schedulerSetting.findMany({ where: { scope: "Grower" } }),
    prisma.grower.findMany({ where: { status: "Active" } }),
  ])

  const byGrower = new Map(
    growerSettings.filter((s) => s.growerId != null).map((s) => [s.growerId!, s])
  )
  const today = startOfDay(new Date())
  let remindersCreated = 0
  const messages: string[] = []

  for (const g of growers) {
    const setting = byGrower.get(g.id) ?? globalSetting
    if (!setting || !setting.isEnabled) continue

    const days = cadenceDays(setting)
    // Drafts don't count as submitting — only Approved submissions reset the clock.
    const lastSub = await prisma.growerSubmission.findFirst({
      where: { growerId: g.id, status: SUBMISSION_STATUS.APPROVED },
      orderBy: { submissionDate: "desc" },
    })
    const daysSince = lastSub
      ? differenceInCalendarDays(today, startOfDay(lastSub.submissionDate))
      : Number.POSITIVE_INFINITY

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
      toEmail: g.primaryEmail ?? `ops+${g.id}@example.com`,
      locale: g.preferredLocale,
      daysSince: Number.isFinite(daysSince) ? daysSince : null,
      cadenceType: setting.cadenceType,
    })
    remindersCreated++
    messages.push(`${g.growerName}: overdue ${overdueLabel} → reminder queued`)
  }

  return { checked: growers.length, remindersCreated, messages }
}
