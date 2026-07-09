// Centralized "enum-like" values. SQL Server/Prisma has no native enums,
// so these strings are validated at the app layer (zod) and reused in seed + UI.

export const ROLES = {
  SUPER_ADMIN: "SuperAdmin",
  INTERNAL_ADMIN: "InternalAdmin",
  EDITOR: "Editor",
  GROWER_USER: "GrowerUser",
  VENDOR_USER: "VendorUser",
} as const

export type RoleName = (typeof ROLES)[keyof typeof ROLES]

// Role groupings used by RBAC
export const ADMIN_ROLES: RoleName[] = [ROLES.SUPER_ADMIN, ROLES.INTERNAL_ADMIN]
export const INTERNAL_ROLES: RoleName[] = [
  ROLES.SUPER_ADMIN,
  ROLES.INTERNAL_ADMIN,
  ROLES.EDITOR,
]

export const SUBMISSION_STATUS = {
  DRAFT: "Draft",
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
} as const

export const REQUEST_STATUS = {
  OPEN: "Open",
  REVIEWED: "Reviewed",
  FULFILLED: "Fulfilled",
  REJECTED: "Rejected",
} as const
export const REQUEST_STATUSES = Object.values(REQUEST_STATUS)

export const ENTITY_STATUS = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  PENDING: "Pending",
  REVIEW: "Review",
} as const

export const ORDER_STATUS = {
  OPEN: "Open",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
} as const
export const ORDER_STATUSES = Object.values(ORDER_STATUS)

export const CADENCE_TYPES = ["Daily", "Weekly", "Monthly", "AfterNDays"] as const
export type CadenceType = (typeof CADENCE_TYPES)[number]

export const NOTIFICATION_TYPES = {
  SUBMISSION_RECEIVED: "SubmissionReceived",
  MISSING_ITEM_REQUEST: "MissingItemRequest",
  LOW_INVENTORY: "LowInventory",
  SCHEDULED_REMINDER: "ScheduledReminder",
} as const

export const AUDIT_ACTIONS = {
  CREATE: "Create",
  UPDATE: "Update",
  DELETE: "Delete",
  EXPORT: "Export",
} as const

export const APPLICATION_METHODS = [
  "Machine",
  "Hand",
  "Machine/Hand",
  "N/A",
] as const

// Item product class — hardcoded dropdown (no dedicated table).
export const PRODUCT_CLASSES = [
  "Packaging",
  "Label",
  "Pallet",
  "Consumable",
  "N/A",
] as const

// Seed values for the CountryOfOrigin lookup table (dropdown source for items).
export const COUNTRIES_OF_ORIGIN = [
  "USA",
  "Mexico",
  "Canada",
  "Peru",
  "Ecuador",
  "N/A",
] as const

export const UNITS_OF_MEASURE = [
  "Cases",
  "Pallets",
  "Rolls",
  "Bags",
  "Boxes",
  "Each",
  "Bundles",
] as const
