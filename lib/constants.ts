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
  REQUEST_REVIEWED: "RequestReviewed",
  LOW_INVENTORY: "LowInventory",
  LOW_INVENTORY_REVIEWED: "LowInventoryReviewed",
  SCHEDULED_REMINDER: "ScheduledReminder",
  ORDER_PLACED: "OrderPlaced",
  MAGIC_LINK: "MagicLink",
} as const

export const NOTIFICATION_STATUS = {
  MOCKED: "Mocked", // EMAIL_PROVIDER=local — recorded, never sent
  QUEUED: "Queued", // waiting for the dispatcher
  SENDING: "Sending", // claimed by a dispatcher pass
  SENT: "Sent",
  FAILED: "Failed", // gave up after the retry budget, or a permanent rejection
} as const
export const NOTIFICATION_STATUSES = Object.values(NOTIFICATION_STATUS)

/**
 * Queue order for the email dispatcher — lower goes first.
 *
 * The reason this exists: the provider's per-minute allowance is small enough
 * that a hundred queued reminders would otherwise sit in front of a grower who
 * is staring at a "check your inbox" screen waiting for a sign-in link.
 */
export const EMAIL_PRIORITY = {
  AUTH: 1, // sign-in links — someone is actively waiting
  TRANSACTIONAL: 3, // triggered by a person's action, expected promptly
  BULK: 7, // the scheduled reminder fan-out
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

// Seed values for the Region lookup table (dropdown source for items, vendors
// and locations). The table is the source of truth at runtime; this list only
// bootstraps it in the seed / migration.
export const REGIONS = ["West", "Central", "East"] as const

/**
 * Location types, and which side of the business each one may be attached to.
 *
 * A location's type decides where it can be picked: a grower-side type is not
 * offered when mapping a vendor's site, and vice versa. `Both` exists because
 * some places genuinely serve either — a shared cross-dock is a cross-dock
 * whoever is using it — and without it the list would need near-duplicate
 * entries ("Grower Warehouse" / "Vendor Warehouse") that mean the same thing.
 *
 * This is the single source of truth for the gate. The pickers filter on it and
 * the server actions re-check it (lib/actions/partners.ts), so a hand-posted
 * locationId cannot attach a vendor site to a grower.
 *
 * A location with NO type is pickable by neither — it is incomplete data, and
 * silently allowing it everywhere would defeat the gate.
 */
/**
 * Seed values for the LocationType lookup table.
 *
 * NOT the runtime source of truth — that is the table, which admins maintain at
 * /admin/location-types. This list exists for two things that run without a
 * populated database: seeding a fresh one, and generating the client workbook,
 * whose LocationType dropdown has to be written before any data exists.
 *
 * `appliesTo` gates which side may use a site of this type. Enforced server-side
 * in lib/actions/partners.ts, not just in the dropdown.
 *
 * Renamed September 2026: "Grower Field" became "Grower Site".
 */
export const LOCATION_TYPE_SEED = [
  { name: "Grower Site", appliesTo: "Grower" },
  { name: "Packing House", appliesTo: "Grower" },
  { name: "Cold Storage", appliesTo: "Grower" },
  { name: "Manufacturing Plant", appliesTo: "Vendor" },
  { name: "Distribution Center", appliesTo: "Vendor" },
  { name: "3PL Facility", appliesTo: "Vendor" },
  { name: "Warehouse", appliesTo: "Both" },
  { name: "Cross-dock", appliesTo: "Both" },
] as const

/** The three values `LocationType.appliesTo` may take. */
export const LOCATION_APPLIES_TO = ["Grower", "Vendor", "Both"] as const
export type LocationAppliesTo = (typeof LOCATION_APPLIES_TO)[number]

// Seed values for the CountryOfOrigin lookup table (dropdown source for items).
export const COUNTRIES_OF_ORIGIN = [
  "USA",
  "Mexico",
  "Canada",
  "Peru",
  "Ecuador",
  "N/A",
] as const

// There is deliberately no UNITS_OF_MEASURE list. A quantity is expressed in the
// item's MATERIAL CATEGORY — an item in "Boxes" is counted in boxes — so a
// second, separately-chosen unit could only ever disagree with it. See the
// MaterialCategory model in prisma/schema.prisma.

// Global item messages shown to growers under an item on their submit view.
export const ITEM_MESSAGE_TYPES = [
  "Retiring",
  "IncreaseStock",
  "ClearInventory",
  "Info",
] as const
export type ItemMessageType = (typeof ITEM_MESSAGE_TYPES)[number]

export const ITEM_MESSAGE_SEVERITIES = ["info", "warning", "critical"] as const
export const ITEM_MESSAGE_AUDIENCES = ["All", "Selected"] as const

// Admin-facing English labels (the grower view translates via i18n instead).
export const ITEM_MESSAGE_TYPE_LABELS: Record<ItemMessageType, string> = {
  Retiring: "Retiring",
  IncreaseStock: "Increase stock",
  ClearInventory: "Clear inventory",
  Info: "Notice",
}
