// Isomorphic translation core (no server/client-only imports) so both the
// server helper (lib/i18n/server.ts) and the client hook (lib/i18n/client.tsx)
// share one lookup implementation. Both dictionaries are statically imported;
// they are small JSON files, so shipping them in the client bundle is fine.
import en from "./dictionaries/en.json"
import es from "./dictionaries/es.json"
import { DEFAULT_LOCALE, type Locale } from "./config"

type Dict = Record<string, unknown>
const DICTIONARIES: Record<Locale, Dict> = { en, es }

export type TFunction = (
  key: string,
  params?: Record<string, string | number>
) => string

function lookup(dict: Dict, key: string): string | undefined {
  const value = key.split(".").reduce<unknown>(
    (node, part) =>
      node && typeof node === "object"
        ? (node as Record<string, unknown>)[part]
        : undefined,
    dict
  )
  return typeof value === "string" ? value : undefined
}

function interpolate(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] != null ? String(params[name]) : match
  )
}

/** Returns a t() bound to `locale`, falling back to English, then to the key. */
export function makeT(locale: Locale): TFunction {
  const dict = DICTIONARIES[locale]
  const fallback = DICTIONARIES[DEFAULT_LOCALE]
  return (key, params) => {
    const template = lookup(dict, key) ?? lookup(fallback, key) ?? key
    return interpolate(template, params)
  }
}
