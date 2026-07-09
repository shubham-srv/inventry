"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Globe } from "lucide-react"
import { setLocale } from "@/lib/i18n/actions"
import { useLocale, useT } from "@/lib/i18n/client"
import { LOCALES, type Locale } from "@/lib/i18n/config"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
}

export function LanguageSwitcher() {
  const locale = useLocale()
  const t = useT()
  const router = useRouter()
  const [pending, start] = useTransition()

  function choose(next: Locale) {
    if (next === locale) return
    start(async () => {
      await setLocale(next)
      router.refresh()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("common.language")}
          disabled={pending}
        >
          <Globe className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {LOCALES.map((l) => (
          <DropdownMenuItem key={l} onSelect={() => choose(l)}>
            <span className="flex-1">{LOCALE_NAMES[l]}</span>
            {l === locale && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
