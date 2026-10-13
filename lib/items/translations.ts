import "server-only"
import { prisma } from "@/lib/db"
import { TRANSLATABLE_LOCALES } from "@/lib/i18n/machine-translate"
import { applyTranslation, planTranslation } from "@/lib/i18n/text-translation"

/**
 * Item text that is translated for growers and vendors. Adding `itemName` later
 * means adding it here, posting `itemNameEs` from the item form, and reading it
 * with `localizedItemText` where names are shown — storage needs no change.
 */
export const TRANSLATED_ITEM_FIELDS = ["notes"] as const
export type TranslatedItemField = (typeof TRANSLATED_ITEM_FIELDS)[number]

type Translations = Map<string, Partial<Record<TranslatedItemField, string>>>

/** itemId → field → text, for one locale. Empty for the source language. */
export async function loadItemTranslations(itemIds: string[], locale: string): Promise<Translations> {
  const out: Translations = new Map()
  if (!(TRANSLATABLE_LOCALES as readonly string[]).includes(locale) || itemIds.length === 0) return out
  // Chunked: SQL Server caps a statement at 2100 parameters.
  for (let i = 0; i < itemIds.length; i += 1000) {
    const rows = await prisma.itemTranslation.findMany({
      where: { itemId: { in: itemIds.slice(i, i + 1000) }, locale },
      select: { itemId: true, field: true, text: true },
    })
    for (const r of rows) {
      const entry = out.get(r.itemId) ?? {}
      entry[r.field as TranslatedItemField] = r.text
      out.set(r.itemId, entry)
    }
  }
  return out
}

/** The reader's language where a translation exists, else the source text — never blank. */
export function localizedItemText(
  translations: Translations,
  itemId: string,
  field: TranslatedItemField,
  source: string | null
): string | null {
  return translations.get(itemId)?.[field] ?? source
}

/**
 * After an item save: bring each translated field in step with its English
 * (rules in lib/i18n/text-translation.ts). `before` is null on create;
 * `posted` holds what the form's translation boxes contained (e.g. notesEs).
 * Runs outside the item's transaction — a translator call must not hold one.
 */
export async function syncItemTranslations(opts: {
  itemId: string
  before: Partial<Record<TranslatedItemField, string | null>> | null
  after: Record<TranslatedItemField, string>
  posted: Partial<Record<string, string>>
  userId: number
}): Promise<void> {
  for (const field of TRANSLATED_ITEM_FIELDS) {
    for (const locale of TRANSLATABLE_LOCALES) {
      const key = { itemId_field_locale: { itemId: opts.itemId, field, locale } }
      const stored = await prisma.itemTranslation.findUnique({ where: key })
      const plan = planTranslation({
        sourceBefore: opts.before ? (opts.before[field] ?? "") : null,
        sourceAfter: opts.after[field],
        stored: stored && { text: stored.text, isMachine: stored.isMachine },
        // Form fields are named <field><Locale>, e.g. notesEs.
        posted: opts.posted[`${field}${locale.charAt(0).toUpperCase()}${locale.slice(1)}`] ?? "",
      })
      await applyTranslation(plan, {
        source: opts.after[field],
        locale,
        save: (text, isMachine) =>
          prisma.itemTranslation.upsert({
            where: key,
            update: { text, isMachine, updatedBy: opts.userId },
            create: { itemId: opts.itemId, field, locale, text, isMachine, createdBy: opts.userId, updatedBy: opts.userId },
          }),
        remove: () => prisma.itemTranslation.deleteMany({ where: { itemId: opts.itemId, field, locale } }),
      })
    }
  }
}
