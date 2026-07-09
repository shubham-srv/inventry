import "server-only"
import { cookies } from "next/headers"
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config"
import { makeT, type TFunction } from "./translate"

export async function getLocale(): Promise<Locale> {
  const store = await cookies()
  const value = store.get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}

/** Server-side translator bound to the request's locale cookie. */
export async function getT(): Promise<TFunction> {
  return makeT(await getLocale())
}
