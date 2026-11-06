// One-off backfill: machine-translate every item, commodity and category name
// that has no translation yet. Saves happen on their own from then on; re-run
// after a bulk master-data import. Never overwrites an existing translation.
//   npm run data:translate-names
//
// Needs DATABASE_URL, TRANSLATION_PROVIDER=azure and AZURE_TRANSLATOR_KEY
// (plus AZURE_TRANSLATOR_REGION for a regional resource) in .env or the shell.
export {}

async function main() {
  try {
    ;(process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.()
  } catch {
    // ok if env already provided by the environment
  }

  const { prisma } = await import("../lib/db")
  const { translateText, TRANSLATABLE_LOCALES } = await import("../lib/i18n/machine-translate")

  let saved = 0
  let failed = 0
  async function fill(
    label: string,
    locale: string,
    rows: { key: string; text: string }[],
    save: (key: string, text: string) => Promise<unknown>
  ) {
    for (const [i, r] of rows.entries()) {
      const out = await translateText(r.text, locale)
      if (out.ok) {
        await save(r.key, out.text)
        saved++
      } else if (out.reason === "disabled") {
        throw new Error("Translation is disabled — set TRANSLATION_PROVIDER=azure and AZURE_TRANSLATOR_KEY.")
      } else {
        failed++
      }
      if ((i + 1) % 50 === 0) console.log(`  ${label}: ${i + 1} / ${rows.length}`)
    }
    console.log(`${label} (${locale}): ${rows.length} missing, processed`)
  }

  for (const locale of TRANSLATABLE_LOCALES) {
    const items = await prisma.item.findMany({
      where: { translations: { none: { field: "itemName", locale } } },
      select: { id: true, itemName: true },
    })
    await fill("Item names", locale, items.map((i) => ({ key: i.id, text: i.itemName })), (itemId, text) =>
      prisma.itemTranslation.create({ data: { itemId, field: "itemName", locale, text, isMachine: true } })
    )

    const commodities = await prisma.commodity.findMany({
      where: { translations: { none: { locale } } },
      select: { code: true, name: true },
    })
    await fill("Commodities", locale, commodities.map((c) => ({ key: c.code, text: c.name })), (commodityCode, name) =>
      prisma.commodityTranslation.create({ data: { commodityCode, locale, name, isMachine: true } })
    )

    const categories = await prisma.materialCategory.findMany({
      where: { translations: { none: { locale } } },
      select: { code: true, name: true },
    })
    await fill("Categories", locale, categories.map((c) => ({ key: c.code, text: c.name })), (materialCategoryCode, name) =>
      prisma.materialCategoryTranslation.create({ data: { materialCategoryCode, locale, name, isMachine: true } })
    )
  }

  console.log(`Done. Saved ${saved} translation(s), ${failed} failed (re-run to retry).`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
