import "server-only"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { ACTIVE_ITEM } from "@/lib/items/active"
import { imageVersion } from "@/lib/items/image"
import { loadNameLocalizer } from "@/lib/i18n/names"

export type ChainView = { id: number; name: string; levels: { level: number; unitName: string }[] }

export type VendorItemRow = {
  /** The ItemVendor mapping — what conversions are saved against. */
  mappingId: number
  itemId: string
  /** In the vendor's language where translated (as are the names below). */
  itemName: string
  legacyId: string | null
  imageVersion: string | null
  commodityName: string | null
  /** The item's material category — what its quantities are counted in. */
  categoryName: string | null
  /** In the vendor's language where translated. */
  notes: string | null
  /** From this vendor's latest report of the item; null = never reported. */
  reported: number | null
  allocated: number | null
  asOf: Date | null
  chain: ChainView | null
  ratios: { level: number; perParent: number }[]
  /** Item-level lead time; null = the vendor default below applies. */
  leadTimeDays: number | null
  defaultLeadTimeDays: number | null
  /** Chains this item can use: those defined for its material category. */
  eligibleChains: ChainView[]
}

/**
 * Every item a vendor supplies, with their latest reported stock and their
 * conversion setup — the vendor's "My items" page and its Excel export.
 */
export async function getVendorItems(vendorId: number, locale: string, q?: string): Promise<VendorItemRow[]> {
  const mappings = await prisma.itemVendor.findMany({
    where: {
      vendorId,
      isActive: true,
      item: {
        ...ACTIVE_ITEM,
        ...(q
          ? {
                OR: [
                  { id: { contains: q } },
                  { itemName: { contains: q } },
                  { legacyFamousId: { contains: q } },
                  { translations: { some: { field: "itemName", locale, text: { contains: q } } } },
                ],
              }
          : {}),
      },
    },
    include: {
      item: { include: { commodity: true, materialCategory: true } },
      vendor: { select: { leadTimeDays: true } },
      packagingChain: { include: { levels: { orderBy: { level: "asc" } } } },
      packRatios: { orderBy: { level: "asc" } },
    },
    orderBy: { itemId: "asc" },
  })
  const categories = [...new Set(mappings.map((m) => m.item.materialCategoryCode).filter((c): c is string => !!c))]

  const [latest, chains, names] = await Promise.all([
    // Latest report per item for this vendor, with its allocated total. The id
    // tie-break matches the admin vendor-stock report.
    prisma.$queryRaw<{ itemId: string; quantity: Prisma.Decimal; submissionDate: Date; allocated: Prisma.Decimal | null }[]>`
      WITH curr AS (
        SELECT d.[itemId], d.[id] AS [detailId], d.[quantity], s.[submissionDate],
          ROW_NUMBER() OVER (PARTITION BY d.[itemId] ORDER BY s.[submissionDate] DESC, d.[id] DESC) AS rn
        FROM [dbo].[VendorSubmissionDetail] d
        INNER JOIN [dbo].[VendorSubmission] s ON s.[id] = d.[submissionId]
        WHERE s.[vendorId] = ${vendorId}
      )
      SELECT c.[itemId], c.[quantity], c.[submissionDate],
        (SELECT SUM(a.[quantity]) FROM [dbo].[VendorAllocation] a WHERE a.[vendorSubmissionDetailId] = c.[detailId]) AS [allocated]
      FROM curr c
      WHERE c.rn = 1
    `,
    categories.length
      ? prisma.packagingChain.findMany({
          where: { isActive: true, materialCategoryCode: { in: categories } },
          include: { levels: { orderBy: { level: "asc" } } },
          orderBy: { name: "asc" },
        })
      : [],
    loadNameLocalizer(
      locale,
      mappings.map((m) => m.itemId)
    ),
  ])
  const latestByItem = new Map(latest.map((l) => [l.itemId, l]))
  const view = (c: { id: number; name: string; levels: { level: number; unitName: string }[] }): ChainView => ({
    id: c.id,
    name: c.name,
    levels: c.levels.map((l) => ({ level: l.level, unitName: l.unitName })),
  })

  return mappings.map((m) => {
    const l = latestByItem.get(m.itemId)
    return {
      mappingId: m.id,
      itemId: m.itemId,
      itemName: names.item(m.itemId, m.item.itemName),
      legacyId: m.item.legacyFamousId,
      imageVersion: imageVersion(m.item.imageKey),
      commodityName: names.commodity(m.item.commodityCode, m.item.commodity?.name),
      categoryName: names.category(m.item.materialCategoryCode, m.item.materialCategory?.name),
      notes: names.notes(m.itemId, m.item.notes),
      reported: l ? Number(l.quantity) : null,
      allocated: l ? Number(l.allocated ?? 0) : null,
      asOf: l?.submissionDate ?? null,
      chain: m.packagingChain ? view(m.packagingChain) : null,
      ratios: m.packRatios.map((r) => ({ level: r.level, perParent: r.perParent })),
      leadTimeDays: m.leadTimeDays,
      defaultLeadTimeDays: m.vendor.leadTimeDays,
      eligibleChains: chains.filter((c) => c.materialCategoryCode === m.item.materialCategoryCode).map(view),
    }
  })
}
