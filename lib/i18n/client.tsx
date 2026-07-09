"use client"

import * as React from "react"
import { DEFAULT_LOCALE, type Locale } from "./config"
import { makeT, type TFunction } from "./translate"

const LocaleContext = React.createContext<Locale>(DEFAULT_LOCALE)

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale
  children: React.ReactNode
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  )
}

export function useLocale(): Locale {
  return React.useContext(LocaleContext)
}

/** Client-side translator bound to the provider's locale. */
export function useT(): TFunction {
  const locale = useLocale()
  return React.useMemo(() => makeT(locale), [locale])
}
