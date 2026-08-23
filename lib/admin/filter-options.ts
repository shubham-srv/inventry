import "server-only"
import { prisma } from "@/lib/db"
import { ENTITY_STATUS } from "@/lib/constants"

/**
 * Dropdown options for the admin report toolbars.
 *
 * These exist because the same three or four `findMany`s were about to be
 * copied across the report tabs, and one of them (`countingLocationOptions`)
 * carries a rule that is not obvious enough to retype from memory.
 *
 * Scope note: only the report pages under /admin/reports use these. The older
 * admin list pages still load their own options inline — migrating all of them
 * is a worthwhile tidy-up but a separate one.
 *
 * KNOWN INCONSISTENCY, deliberately not fixed here: the current-inventory page
 * at app/(app)/admin/low-inventory/current/page.tsx loads growers WITHOUT the
 * Active filter, while the grower-stock report uses `activeGrowerOptions`. The
 * two pages are supposed to agree on their maths, so one of them is wrong — but
 * changing either is a behaviour change outside this feature.
 */

export type FilterOption = { label: string; value: string }

/**
 * Growers that still trade. Right for CURRENT-STATE reports (grower stock,
 * vendor stock), where an inactive grower has nothing to say.
 */
export async function activeGrowerOptions(): Promise<FilterOption[]> {
  const rows = await prisma.grower.findMany({
    where: { status: ENTITY_STATUS.ACTIVE },
    orderBy: { growerName: "asc" },
    select: { id: true, growerName: true },
  })
  return rows.map((g) => ({ label: g.growerName, value: String(g.id) }))
}

/**
 * Every grower, active or not. Right for HISTORICAL reports (orders): an
 * inactive grower's past orders stay in the table, so dropping them from the
 * dropdown would leave rows that cannot be filtered.
 */
export async function allGrowerOptions(): Promise<FilterOption[]> {
  const rows = await prisma.grower.findMany({
    orderBy: { growerName: "asc" },
    select: { id: true, growerName: true },
  })
  return rows.map((g) => ({ label: g.growerName, value: String(g.id) }))
}

/** Every vendor, active or not — same reasoning as `allGrowerOptions`. */
export async function allVendorOptions(): Promise<FilterOption[]> {
  const rows = await prisma.vendor.findMany({
    orderBy: { vendorName: "asc" },
    select: { id: true, vendorName: true },
  })
  return rows.map((v) => ({ label: v.vendorName, value: String(v.id) }))
}

/** Vendors that still trade. */
export async function activeVendorOptions(): Promise<FilterOption[]> {
  const rows = await prisma.vendor.findMany({
    where: { status: ENTITY_STATUS.ACTIVE },
    orderBy: { vendorName: "asc" },
    select: { id: true, vendorName: true },
  })
  return rows.map((v) => ({ label: v.vendorName, value: String(v.id) }))
}

export async function commodityOptions(): Promise<FilterOption[]> {
  const rows = await prisma.commodity.findMany({
    orderBy: { name: "asc" },
    select: { code: true, name: true },
  })
  return rows.map((c) => ({ label: c.name, value: c.code }))
}

export async function categoryOptions(): Promise<FilterOption[]> {
  const rows = await prisma.materialCategory.findMany({
    orderBy: { name: "asc" },
    select: { code: true, name: true },
  })
  return rows.map((c) => ({ label: c.name, value: c.code }))
}

/**
 * Only sites growers actually count at.
 *
 * The filter matters: locations are shared with vendors, and offering a
 * vendor-side site in a grower report's Location dropdown gives an option that
 * narrows the page to nothing.
 */
export async function countingLocationOptions(): Promise<FilterOption[]> {
  const rows = await prisma.location.findMany({
    where: { growers: { some: { isActive: true } } },
    orderBy: { locationName: "asc" },
    select: { id: true, locationName: true },
  })
  return rows.map((l) => ({ label: l.locationName, value: String(l.id) }))
}
