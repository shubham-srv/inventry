// Pure RBAC helpers — safe to import in both server and client components.
import { ROLES, type RoleName } from "@/lib/constants"

export const CAPABILITIES = {
  MANAGE_MASTER_DATA: "manage_master_data", // commodities, categories, sub-categories, items, locations
  MANAGE_GROWERS_VENDORS: "manage_growers_vendors", // grower/vendor records + item authorizations
  MANAGE_USERS: "manage_users", // onboarding + user↔grower/vendor mapping
  ACCESS_SETTINGS: "access_settings", // schedulers, thresholds, audit logs
  MANAGE_CONVERSIONS: "manage_conversions",
  VIEW_REPORTS: "view_reports",
} as const

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES]

const ADMIN_CAPS: Capability[] = Object.values(CAPABILITIES)
// Reports are admin-only: the page embeds Power BI via a server-generated embed
// token, so widening it widens who can trigger that. Editors keep master data
// and packaging.
const EDITOR_CAPS: Capability[] = [
  CAPABILITIES.MANAGE_MASTER_DATA,
  CAPABILITIES.MANAGE_CONVERSIONS,
]

const ROLE_CAPS: Record<RoleName, Capability[]> = {
  [ROLES.SUPER_ADMIN]: ADMIN_CAPS,
  [ROLES.INTERNAL_ADMIN]: ADMIN_CAPS,
  [ROLES.EDITOR]: EDITOR_CAPS,
  [ROLES.GROWER_USER]: [],
  [ROLES.VENDOR_USER]: [],
}

export function can(roleName: RoleName, capability: Capability): boolean {
  return (ROLE_CAPS[roleName] ?? []).includes(capability)
}

export function isAdmin(roleName: RoleName): boolean {
  return roleName === ROLES.SUPER_ADMIN || roleName === ROLES.INTERNAL_ADMIN
}
export function isInternal(roleName: RoleName): boolean {
  return isAdmin(roleName) || roleName === ROLES.EDITOR
}
export function isGrower(roleName: RoleName): boolean {
  return roleName === ROLES.GROWER_USER
}
export function isVendor(roleName: RoleName): boolean {
  return roleName === ROLES.VENDOR_USER
}

/** Landing route for a user based on their role. */
export function homePathForRole(roleName: RoleName): string {
  if (isInternal(roleName)) return "/admin"
  if (isGrower(roleName)) return "/grower"
  if (isVendor(roleName)) return "/vendor"
  return "/login"
}
