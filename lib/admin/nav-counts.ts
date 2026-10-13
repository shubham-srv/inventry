import "server-only"
import { prisma } from "@/lib/db"
import { ORDER_STATUS, REQUEST_STATUS } from "@/lib/constants"
import { can, CAPABILITIES, isVendor } from "@/lib/rbac"
import { type RoleName } from "@/lib/constants"
import { type NavCounts } from "@/lib/nav"

/**
 * Counts behind the sidebar badges. Runs on every internal and vendor page
 * load, so it is a few COUNT queries in one round trip and nothing more.
 *
 * Freshness comes from the mutating server actions calling revalidatePath — the
 * layout re-renders with them. There is no polling: a badge that updates when
 * you act on it is enough, and polling every sidebar for every user is not worth
 * the load.
 */
export async function getNavCounts(roleName: RoleName, vendorId?: number | null): Promise<NavCounts> {
  // Vendors: open orders still waiting for them to confirm a delivery date.
  if (isVendor(roleName)) {
    if (!vendorId) return {}
    const vendorOrders = await prisma.order.count({
      where: { vendorId, status: ORDER_STATUS.OPEN, confirmedDeliveryDate: null },
    })
    return { vendorOrders }
  }
  if (!can(roleName, CAPABILITIES.MANAGE_GROWERS_VENDORS)) return {}

  const now = new Date()
  const [lowInventory, requests, itemMessages] = await Promise.all([
    // Grower-raised flags still awaiting an admin review.
    prisma.lowInventoryFlag.count({ where: { isActive: true } }),
    prisma.missingItemRequest.count({ where: { status: REQUEST_STATUS.OPEN } }),
    // Notices growers can currently see (active and inside any date window).
    prisma.itemMessage.count({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
    }),
  ])

  return { lowInventory, requests, itemMessages }
}
