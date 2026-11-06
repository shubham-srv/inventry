import { Prisma } from "@prisma/client"
import { calendarDaysBetween, subAppDays } from "@/lib/dates"

/**
 * How overdue a grower's or vendor's last submission is. One rule for both:
 * 3+ calendar days is worth noticing, a week+ is worth chasing.
 */
export const SUBMISSION_FLAG_DAYS = { WARN: 3, ALERT: 7 } as const

export type SubmissionFlag = "Ok" | "ThreeDays" | "Week" | "Never"

export const SUBMISSION_FLAG_FILTERS = [
  { label: "Never submitted", value: "never" },
  { label: "1 week+", value: "week" },
  { label: "3+ days", value: "days3" },
  { label: "Up to date", value: "ok" },
] as const

export function submissionFlag(last: Date | null, today: Date): { flag: SubmissionFlag; daysSince: number | null } {
  if (!last) return { flag: "Never", daysSince: null }
  const daysSince = calendarDaysBetween(today, last)
  if (daysSince >= SUBMISSION_FLAG_DAYS.ALERT) return { flag: "Week", daysSince }
  if (daysSince >= SUBMISSION_FLAG_DAYS.WARN) return { flag: "ThreeDays", daysSince }
  return { flag: "Ok", daysSince }
}

/**
 * SQL twin of `submissionFlag` for the flag filter. "N+ calendar days ago" is
 * "before the start of the day N-1 days back", so `today` must be dayStart —
 * the same boundary calendarDaysBetween draws.
 */
export function submissionFlagSql(column: Prisma.Sql, flag: string | undefined, today: Date): Prisma.Sql {
  const warn = subAppDays(today, SUBMISSION_FLAG_DAYS.WARN - 1)
  const alert = subAppDays(today, SUBMISSION_FLAG_DAYS.ALERT - 1)
  switch (flag) {
    case "never":
      return Prisma.sql`AND ${column} IS NULL`
    case "week":
      return Prisma.sql`AND ${column} < ${alert}`
    case "days3":
      return Prisma.sql`AND ${column} >= ${alert} AND ${column} < ${warn}`
    case "ok":
      return Prisma.sql`AND ${column} >= ${warn}`
    default:
      return Prisma.empty
  }
}

/** Sort keys for the per-partner report tables. Default: most overdue first. */
export type PartnerSort = "stale" | "recent" | "name"

export function parsePartnerSort(v: string | undefined): PartnerSort {
  return v === "recent" || v === "name" ? v : "stale"
}

/** ORDER BY for a grouped partner query; NULL (never submitted) counts as stalest. */
export function partnerOrderSql(sort: PartnerSort, last: Prisma.Sql, name: Prisma.Sql): Prisma.Sql {
  switch (sort) {
    case "recent":
      return Prisma.sql`ORDER BY CASE WHEN ${last} IS NULL THEN 1 ELSE 0 END, ${last} DESC, ${name} ASC`
    case "name":
      return Prisma.sql`ORDER BY ${name} ASC`
    default:
      return Prisma.sql`ORDER BY CASE WHEN ${last} IS NULL THEN 0 ELSE 1 END, ${last} ASC, ${name} ASC`
  }
}
