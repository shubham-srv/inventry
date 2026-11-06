import "server-only"
import { prisma } from "@/lib/db"
import { TRANSLATABLE_LOCALES } from "@/lib/i18n/machine-translate"
import { syncTranslations } from "@/lib/i18n/text-translation"

/**
 * Item text that is translated for growers and vendors. Read with
 * loadNameLocalizer (lib/i18n/names.ts); storage is one ItemTranslation row per
 * (field, locale).
 */
export const TRANSLATED_ITEM_FIELDS = ["notes", "itemName"] as const
export type TranslatedItemField = (typeof TRANSLATED_ITEM_FIELDS)[number]

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
    const key = (locale: string) => ({ itemId_field_locale: { itemId: opts.itemId, field, locale } })
    await syncTranslations({
      sourceBefore: opts.before ? (opts.before[field] ?? "") : null,
      sourceAfter: opts.after[field],
      // Form fields are named <field><Locale>, e.g. notesEs.
      posted: Object.fromEntries(
        TRANSLATABLE_LOCALES.map((l) => [l, opts.posted[`${field}${l.charAt(0).toUpperCase()}${l.slice(1)}`] ?? ""])
      ),
      find: (locale) =>
        prisma.itemTranslation.findUnique({ where: key(locale), select: { text: true, isMachine: true } }),
      save: (locale, text, isMachine) =>
        prisma.itemTranslation.upsert({
          where: key(locale),
          update: { text, isMachine, updatedBy: opts.userId },
          create: { itemId: opts.itemId, field, locale, text, isMachine, createdBy: opts.userId, updatedBy: opts.userId },
        }),
      remove: (locale) => prisma.itemTranslation.deleteMany({ where: { itemId: opts.itemId, field, locale } }),
    })
  }
}
