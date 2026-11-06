import "server-only"
import { prisma } from "@/lib/db"
import { syncTranslations } from "@/lib/i18n/text-translation"

type Sync = {
  code: string
  /** English name before the save; null on create. */
  before: string | null
  after: string
  /** The form's translation boxes by locale, e.g. { es: "Cajas" }. */
  posted: Partial<Record<string, string>>
  userId: number
}

/** Logged, never thrown: readers fall back to the English name. */
async function safely(label: string, run: () => Promise<void>) {
  try {
    await run()
  } catch (e) {
    console.error(`[translate] ${label} sync failed`, e)
  }
}

export function syncCommodityName(o: Sync) {
  const key = (locale: string) => ({ commodityCode_locale: { commodityCode: o.code, locale } })
  return safely(`commodity ${o.code}`, () =>
    syncTranslations({
      sourceBefore: o.before,
      sourceAfter: o.after,
      posted: o.posted,
      find: async (locale) => {
        const r = await prisma.commodityTranslation.findUnique({ where: key(locale) })
        return r && { text: r.name, isMachine: r.isMachine }
      },
      save: (locale, name, isMachine) =>
        prisma.commodityTranslation.upsert({
          where: key(locale),
          update: { name, isMachine, updatedBy: o.userId },
          create: { commodityCode: o.code, locale, name, isMachine, createdBy: o.userId, updatedBy: o.userId },
        }),
      remove: (locale) => prisma.commodityTranslation.deleteMany({ where: { commodityCode: o.code, locale } }),
    })
  )
}

export function syncCategoryName(o: Sync) {
  const key = (locale: string) => ({ materialCategoryCode_locale: { materialCategoryCode: o.code, locale } })
  return safely(`category ${o.code}`, () =>
    syncTranslations({
      sourceBefore: o.before,
      sourceAfter: o.after,
      posted: o.posted,
      find: async (locale) => {
        const r = await prisma.materialCategoryTranslation.findUnique({ where: key(locale) })
        return r && { text: r.name, isMachine: r.isMachine }
      },
      save: (locale, name, isMachine) =>
        prisma.materialCategoryTranslation.upsert({
          where: key(locale),
          update: { name, isMachine, updatedBy: o.userId },
          create: { materialCategoryCode: o.code, locale, name, isMachine, createdBy: o.userId, updatedBy: o.userId },
        }),
      remove: (locale) =>
        prisma.materialCategoryTranslation.deleteMany({ where: { materialCategoryCode: o.code, locale } }),
    })
  )
}
