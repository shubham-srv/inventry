"use client"

import { Badge } from "@/components/ui/badge"
import { useT } from "@/lib/i18n/client"

/** Spanish copy of admin text: missing, raw machine output, or checked by a person. */
export function TranslationBadge({ translation }: { translation: { isMachine: boolean } | null | undefined }) {
  const t = useT()
  if (!translation)
    return (
      <Badge variant="outline" className="border-transparent bg-red-500/15 text-[10px] text-red-700 dark:text-red-400">
        {t("admin.items.translationBadge.missing")}
      </Badge>
    )
  if (translation.isMachine)
    return (
      <Badge variant="outline" className="border-transparent bg-amber-500/15 text-[10px] text-amber-700 dark:text-amber-400">
        {t("admin.items.translationBadge.auto")}
      </Badge>
    )
  return (
    <Badge variant="secondary" className="text-[10px]">
      {t("admin.items.translationBadge.reviewed")}
    </Badge>
  )
}
