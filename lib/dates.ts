import { TZDate, tz } from "@date-fns/tz"
import {
  addDays,
  differenceInCalendarDays,
  endOfDay,
  format,
  formatDistanceToNow,
  startOfDay,
  subDays,
} from "date-fns"
import { enUS, es } from "date-fns/locale"

/**
 * The app's clock. Every day boundary ("today", "a week ago", overdue days) and
 * every displayed date or time is Arizona time, whatever the server's or the
 * viewer's own timezone. Arizona keeps no daylight saving, so it is UTC-7 all
 * year. Isomorphic: used by server code, client components and scripts.
 *
 * Results are plain Dates (instants), safe to hand to Prisma or serialize.
 */
export const APP_TIME_ZONE = "America/Phoenix"
const inApp = tz(APP_TIME_ZONE)
const plain = (d: Date) => new Date(d.getTime())

/** Arizona midnight of the day `d` falls on (default: today). */
export const dayStart = (d: Date = new Date()) => plain(startOfDay(d, { in: inApp }))
/** The last millisecond of that Arizona day. */
export const dayEnd = (d: Date = new Date()) => plain(endOfDay(d, { in: inApp }))
export const addAppDays = (d: Date, n: number) => plain(addDays(d, n, { in: inApp }))
export const subAppDays = (d: Date, n: number) => plain(subDays(d, n, { in: inApp }))
/** Whole Arizona calendar days from `earlier` to `later`. */
export const calendarDaysBetween = (later: Date, earlier: Date) =>
  differenceInCalendarDays(later, earlier, { in: inApp })

const dateLocale = (locale?: string) => (locale === "es" ? es : enUS)

/** `pattern` in Arizona time; `locale` picks month and day names. */
export function formatDate(d: Date | string | number, pattern: string, locale?: string): string {
  return format(new Date(d), pattern, { in: inApp, locale: dateLocale(locale) })
}

/** "3 days ago" in the reader's language. */
export function timeAgo(d: Date | string | number, locale?: string): string {
  return formatDistanceToNow(new Date(d), { addSuffix: true, locale: dateLocale(locale) })
}

/**
 * An <input type="date"> value ("YYYY-MM-DD") as that Arizona day at noon —
 * noon so the calendar day survives any display shift. null if blank/invalid.
 */
export function parseDay(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m) return null
  const d = new TZDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, APP_TIME_ZONE)
  return Number.isNaN(d.getTime()) || formatDate(d, "yyyy-MM-dd") !== value.trim() ? null : plain(d)
}

/** A Date as an <input type="date"> value, on its Arizona calendar day. */
export function toDayInput(d: Date): string {
  return formatDate(d, "yyyy-MM-dd")
}
