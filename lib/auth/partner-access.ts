import { ENTITY_STATUS } from "@/lib/constants"

/** The partner statuses an auth check needs — select exactly this. */
export const PARTNER_STATUS_SELECT = {
  grower: { select: { status: true } },
  vendor: { select: { status: true } },
} as const

type PartnerLink = {
  grower?: { status: string } | null
  vendor?: { status: string } | null
}

/**
 * External users only get in while the grower or vendor they belong to is
 * Active — Inactive and Pending both block. Derived at sign-in and on every
 * request rather than copied onto User, so re-activating the partner restores
 * all of its users without touching their own Active flag.
 */
export function partnerAccessBlocked(u: PartnerLink): boolean {
  return (
    (u.grower != null && u.grower.status !== ENTITY_STATUS.ACTIVE) ||
    (u.vendor != null && u.vendor.status !== ENTITY_STATUS.ACTIVE)
  )
}
