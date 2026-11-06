import { addAppDays, dayStart } from "@/lib/dates"

// Shared by the order dialog (client) and the order actions (server), so the
// date picker's limits and the server's checks are the same rule. Day maths is
// Arizona time (lib/dates.ts).

export { parseDay, toDayInput } from "@/lib/dates"

/** Lead-time box: "" -> null (cleared), whole 0–365 -> number, else undefined (invalid). */
export function parseLeadDays(raw: string): number | null | undefined {
  if (raw.trim() === "") return null
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 && n <= 365 ? n : undefined
}

/** Earliest delivery a vendor accepts for an order placed on `orderDay`. */
export function earliestDelivery(orderDay: Date, leadTimeDays: number | null | undefined): Date {
  return addAppDays(dayStart(orderDay), Math.max(0, leadTimeDays ?? 0))
}
