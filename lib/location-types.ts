import "server-only"
import { prisma } from "@/lib/db"

/**
 * Location types, read from the table admins maintain at /admin/location-types.
 *
 * This replaces the hard-coded list that used to live in lib/constants.ts. That
 * list survives there as LOCATION_TYPE_SEED, but only to seed a fresh database
 * and to fill the workbook dropdown — neither of which has a database to read.
 * Anything running against a real database should come through here.
 */

export type LocationSide = "Grower" | "Vendor"

/**
 * Ids of the types a given side may attach: that side's own, plus "Both".
 *
 * Returned as ids rather than names because Location now holds a foreign key.
 * Callers use them directly in a `locationTypeId: { in: … }` filter.
 *
 * Inactive types are INCLUDED. A type being retired should stop it appearing in
 * the picker for new sites; it must not invalidate the sites already using it,
 * which would silently break a grower's ability to submit against a location
 * that was fine yesterday.
 */
export async function locationTypeIdsFor(side: LocationSide): Promise<number[]> {
  const rows = await prisma.locationType.findMany({
    where: { appliesTo: { in: [side, "Both"] } },
    select: { id: true },
  })
  return rows.map((r) => r.id)
}

/** Types offered when creating or editing a site. Active only, in display order. */
export async function selectableLocationTypes() {
  return prisma.locationType.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, appliesTo: true },
  })
}

/** Every type, including retired ones — for the admin screen and filters. */
export async function allLocationTypes() {
  return prisma.locationType.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  })
}

/** How a type reads in a dropdown: "Packing House (grower)". */
export function locationTypeLabel(name: string, appliesTo: string): string {
  const who = appliesTo === "Both" ? "grower or vendor" : appliesTo.toLowerCase()
  return `${name} (${who})`
}
