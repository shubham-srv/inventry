import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { type CommodityItemRow } from "@/components/commodities/commodity-items-dialog"

/** GET /admin/commodities/<code>/items — the commodities page's item list dialog. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  await requireCapability(CAPABILITIES.MANAGE_MASTER_DATA)
  const { code } = await params

  const items = await prisma.item.findMany({
    where: { commodityCode: code },
    select: {
      id: true,
      legacyFamousId: true,
      itemName: true,
      status: true,
      materialCategory: { select: { name: true } },
      subCategory: { select: { name: true } },
    },
    orderBy: { id: "asc" },
  })

  const rows: CommodityItemRow[] = items.map((i) => ({
    id: i.id,
    legacyId: i.legacyFamousId,
    name: i.itemName,
    category: i.materialCategory?.name ?? null,
    subCategory: i.subCategory?.name ?? null,
    status: i.status,
  }))
  return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } })
}
