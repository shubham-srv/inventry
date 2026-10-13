import "server-only"
import { translateText } from "@/lib/i18n/machine-translate"

/**
 * Keeps the translated copy of admin-typed text (an item message's note, an
 * item's notes — and anything added later, e.g. item names) in step with the
 * English it was made from. Storage-agnostic: callers pass `save` / `remove`
 * for their own translation table.
 *
 * The edit dialogs PRE-FILL the translation box, so "the box has text" does not
 * mean "an admin typed it". What counts is whether the box CHANGED from what was
 * stored. That distinction is the bug this module fixes: editing only the
 * English used to re-save the old Spanish verbatim and mark it reviewed.
 */

export type StoredTranslation = { text: string; isMachine: boolean } | null

export type TranslationPlan =
  | { kind: "keep" }
  | { kind: "manual"; text: string } // typed by an admin: verbatim, reviewed
  | { kind: "machine"; dropOnFailure: boolean } // (re)translate the new source
  | { kind: "remove" }

export function planTranslation(opts: {
  /** Source text as stored before this save; null when creating. */
  sourceBefore: string | null
  /** Source text being saved; "" = none. */
  sourceAfter: string
  /** The translation as stored before this save. */
  stored: StoredTranslation
  /** The translation box as submitted; "" = left blank / cleared. */
  posted: string
}): TranslationPlan {
  const { sourceBefore, sourceAfter, stored, posted } = opts
  const postedChanged = posted !== (stored?.text ?? "")
  const sourceChanged = sourceAfter !== (sourceBefore ?? "")

  if (posted && postedChanged) return { kind: "manual", text: posted }
  if (!sourceAfter) return stored ? { kind: "remove" } : { kind: "keep" }
  // Blank box (new, or cleared on purpose) or English changed under it: the
  // stored copy no longer describes the source, so never keep it on failure.
  if (!posted || sourceChanged) return { kind: "machine", dropOnFailure: stored != null }
  // Nothing relevant changed. Fill a gap (the provider may have been off last
  // time), but don't spend a call re-translating text that is already done.
  return stored ? { kind: "keep" } : { kind: "machine", dropOnFailure: false }
}

/**
 * Carry out a plan. Never throws for a translator outage: worst case the
 * reader sees the source text, which beats a translation of words that are
 * no longer there.
 */
export async function applyTranslation(
  plan: TranslationPlan,
  opts: {
    source: string
    locale: string
    save: (text: string, isMachine: boolean) => Promise<unknown>
    remove: () => Promise<unknown>
  }
): Promise<void> {
  switch (plan.kind) {
    case "keep":
      return
    case "manual":
      await opts.save(plan.text, false)
      return
    case "remove":
      await opts.remove()
      return
    case "machine": {
      const result = await translateText(opts.source, opts.locale)
      if (result.ok) await opts.save(result.text, true)
      else if (plan.dropOnFailure) await opts.remove()
      return
    }
  }
}
