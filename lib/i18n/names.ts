// (No "server-only": lib/email/notify.ts uses this, and it runs under tsx too.)
import { prisma } from "@/lib/db"
import { TRANSLATABLE_LOCALES } from "@/lib/i18n/machine-translate"

/**
 * Admin-typed text in a grower's or vendor's language: item names and notes,
 * commodity and category names. Each falls back to the English as stored, so a
 * missing translation shows English, never a blank.
 *
 * Admin screens stay English and do not use this.
 */
export type NameLocalizer = {
  item: (itemId: string, source: string) => string
  notes: (itemId: string, source: string | null) => string | null
  commodity: (code: string | null | undefined, source: string | null | undefined) => string | null
  category: (code: string | null | undefined, source: string | null | undefined) => string | null
}

const IDENTITY: NameLocalizer = {
  item: (_id, source) => source,
  notes: (_id, source) => source,
  commodity: (_code, source) => source ?? null,
  category: (_code, source) => source ?? null,
}

/** One lookup for `locale`, covering `itemIds` (commodities/categories: all). */
export async function loadNameLocalizer(locale: string, itemIds: string[]): Promise<NameLocalizer> {
  if (!(TRANSLATABLE_LOCALES as readonly string[]).includes(locale)) return IDENTITY

  const ids = [...new Set(itemIds)]
  const itemRows: { itemId: string; field: string; text: string }[] = []
  // Chunked: SQL Server caps a statement at 2100 parameters.
  for (let i = 0; i < ids.length; i += 1000) {
    itemRows.push(
      ...(await prisma.itemTranslation.findMany({
        where: { itemId: { in: ids.slice(i, i + 1000) }, locale },
        select: { itemId: true, field: true, text: true },
      }))
    )
  }
  // Small lookup tables — read whole.
  const [commodities, categories] = await Promise.all([
    prisma.commodityTranslation.findMany({ where: { locale }, select: { commodityCode: true, name: true } }),
    prisma.materialCategoryTranslation.findMany({
      where: { locale },
      select: { materialCategoryCode: true, name: true },
    }),
  ])

  const byItem = new Map(itemRows.map((r) => [`${r.itemId}\u0000${r.field}`, r.text]))
  const byCommodity = new Map(commodities.map((r) => [r.commodityCode, r.name]))
  const byCategory = new Map(categories.map((r) => [r.materialCategoryCode, r.name]))

  return {
    item: (id, source) => byItem.get(`${id}\u0000itemName`) ?? source,
    notes: (id, source) => byItem.get(`${id}\u0000notes`) ?? source,
    commodity: (code, source) => (code && byCommodity.get(code)) || (source ?? null),
    category: (code, source) => (code && byCategory.get(code)) || (source ?? null),
  }
}
