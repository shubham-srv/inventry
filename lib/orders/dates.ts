import { addDays, format, startOfDay } from "date-fns"

// Shared by the order dialog (client) and the order actions (server), so the
// date picker's limits and the server's checks are the same rule.

/**
 * An <input type="date"> value ("YYYY-MM-DD") as that calendar day at local
 * noon — noon so the day survives any timezone shift. null if blank/invalid.
 */
export function parseDay(value: string): Date | null {
  const v = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** A Date as an <input type="date"> value. */
export function toDayInput(d: Date): string {
  return format(d, "yyyy-MM-dd")
}

/** Lead-time box: "" -> null (cleared), whole 0–365 -> number, else undefined (invalid). */
export function parseLeadDays(raw: string): number | null | undefined {
  if (raw.trim() === "") return null
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 && n <= 365 ? n : undefined
}

/** Earliest delivery a vendor accepts for an order placed on `orderDay`. */
export function earliestDelivery(orderDay: Date, leadTimeDays: number | null | undefined): Date {
  return addDays(startOfDay(orderDay), Math.max(0, leadTimeDays ?? 0))
}
