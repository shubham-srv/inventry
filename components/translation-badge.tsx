import { Badge } from "@/components/ui/badge"

/** Spanish copy of admin text: missing, raw machine output, or checked by a person. */
export function TranslationBadge({ translation }: { translation: { isMachine: boolean } | null | undefined }) {
  if (!translation)
    return (
      <Badge variant="outline" className="border-transparent bg-red-500/15 text-[10px] text-red-700 dark:text-red-400">
        ES missing
      </Badge>
    )
  if (translation.isMachine)
    return (
      <Badge variant="outline" className="border-transparent bg-amber-500/15 text-[10px] text-amber-700 dark:text-amber-400">
        ES auto
      </Badge>
    )
  return (
    <Badge variant="secondary" className="text-[10px]">
      ES reviewed
    </Badge>
  )
}
