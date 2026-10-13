import "server-only"
import { type Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { ORDER_STATUS } from "@/lib/constants"

export const VENDOR_ORDER_VIEWS = ["awaiting", "open", "received", "cancelled", "all"] as const

/**
 * A vendor's orders. Default view is everything still open, with orders that
 * have no delivery date from this vendor first — SQL Server sorts NULL first
 * ascending, which is exactly "awaiting" before "confirmed".
 */
export async function getVendorOrders(
  vendorId: number,
  filters: { view?: string; q?: string },
  page: { skip: number; take: number }
) {
  const view = (VENDOR_ORDER_VIEWS as readonly string[]).includes(filters.view ?? "") ? filters.view : "open"
  const and: Prisma.OrderWhereInput[] = [{ vendorId }]
  if (view === "awaiting") and.push({ status: ORDER_STATUS.OPEN, confirmedDeliveryDate: null })
  else if (view === "open") and.push({ status: ORDER_STATUS.OPEN })
  else if (view === "received") and.push({ status: ORDER_STATUS.RECEIVED })
  else if (view === "cancelled") and.push({ status: ORDER_STATUS.CANCELLED })
  if (filters.q)
    and.push({
      OR: [
        { itemId: { contains: filters.q } },
        { item: { itemName: { contains: filters.q } } },
        { grower: { growerName: { contains: filters.q } } },
      ],
    })
  const where: Prisma.OrderWhereInput = { AND: and }
  const openView = view === "awaiting" || view === "open"

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        grower: { select: { growerName: true } },
        item: { select: { itemName: true, legacyFamousId: true, materialCategory: { select: { name: true } } } },
        packLines: { orderBy: { level: "asc" } },
      },
      orderBy: openView
        ? [{ confirmedDeliveryDate: "asc" }, { expectedDeliveryDate: "asc" }, { id: "asc" }]
        : [{ orderDate: "desc" }, { id: "desc" }],
      skip: page.skip,
      take: page.take,
    }),
    prisma.order.count({ where }),
  ])
  return { orders, total, view: view as (typeof VENDOR_ORDER_VIEWS)[number] }
}
