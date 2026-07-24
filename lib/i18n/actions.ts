"use server"

import { cookies } from "next/headers"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth/session"
import { LOCALE_COOKIE, isLocale } from "./config"

export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return
  const store = await cookies()
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  })
  // "Both" language ownership: when a logged-in user switches, persist it to
  // their User row so the choice follows them to a fresh browser (re-applied to
  // the cookie on next login by createSession).
  const user = await getCurrentUser()
  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { preferredLocale: locale },
    })
  }
}
