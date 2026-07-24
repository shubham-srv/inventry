export const LOCALES = ["en", "es"] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = "en"
export const LOCALE_COOKIE = "locale"

// Human-readable language names (shown in the switcher and admin selects).
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
}

// Ready-made { label, value } options for admin form selects.
export const LOCALE_OPTIONS = LOCALES.map((l) => ({
  label: LOCALE_LABELS[l],
  value: l,
}))

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v)
}
