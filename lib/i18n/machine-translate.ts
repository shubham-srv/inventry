import "server-only"

/**
 * Machine translation for admin-authored free text.
 *
 * Distinct from ./translate.ts, which resolves STATIC UI strings from the bundled
 * dictionaries. This handles text an admin types at runtime, which no dictionary
 * can know about.
 *
 * TRANSLATION_PROVIDER=local (the default) is a no-op that reports "disabled", so
 * the offline demo runs without credentials and the app falls back to the
 * authored text — same shape as the EMAIL_PROVIDER switch in lib/email/notify.ts.
 * Set it to "azure" and supply a key to use Azure AI Translator.
 *
 * Called only when a message is SAVED, never when one is read. Item messages are
 * authored a handful of times and displayed constantly; translating per page view
 * would re-translate identical text endlessly, add latency to the grower's
 * critical path, and make an external API a hard dependency of a page people use
 * on a phone in a packing house.
 */

const AZURE_DEFAULT_ENDPOINT = "https://api.cognitive.microsofttranslator.com"

export type TranslateOutcome =
  | { ok: true; text: string }
  | { ok: false; reason: "disabled" | "error" }

function isEnabled(): boolean {
  return process.env.TRANSLATION_PROVIDER === "azure" && !!process.env.AZURE_TRANSLATOR_KEY
}

/**
 * Translate `text` into `to`. Returns `{ ok: false }` rather than throwing —
 * a failed translation must never block saving the message itself.
 */
export async function translateText(
  text: string,
  to: string,
  from = "en"
): Promise<TranslateOutcome> {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, reason: "disabled" }
  if (!isEnabled()) return { ok: false, reason: "disabled" }
  if (to === from) return { ok: false, reason: "disabled" }

  const endpoint = (process.env.AZURE_TRANSLATOR_ENDPOINT || AZURE_DEFAULT_ENDPOINT).replace(/\/$/, "")
  const url = `${endpoint}/translate?api-version=3.0&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`

  try {
    const headers: Record<string, string> = {
      "Ocp-Apim-Subscription-Key": process.env.AZURE_TRANSLATOR_KEY as string,
      "Content-Type": "application/json",
    }
    // Regional and multi-service resources require this header; global resources
    // don't, so only send it when configured.
    if (process.env.AZURE_TRANSLATOR_REGION)
      headers["Ocp-Apim-Subscription-Region"] = process.env.AZURE_TRANSLATOR_REGION

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify([{ Text: trimmed }]),
      // Never let a slow translator hold up an admin save.
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.error(`[translate] Azure returned ${res.status}: ${await res.text()}`)
      return { ok: false, reason: "error" }
    }
    const data = (await res.json()) as { translations?: { text?: string }[] }[]
    const out = data?.[0]?.translations?.[0]?.text
    return out ? { ok: true, text: out } : { ok: false, reason: "error" }
  } catch (e) {
    console.error("[translate] request failed", e)
    return { ok: false, reason: "error" }
  }
}

/** Locales notes are translated into (i.e. every supported locale except `en`). */
export const TRANSLATABLE_LOCALES = ["es"] as const
