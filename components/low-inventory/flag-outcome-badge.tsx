import { Badge } from "@/components/ui/badge"
import type { FlagOutcome } from "@/lib/low-inventory/history"

const TONE: Record<FlagOutcome, string> = {
  Open: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
  ClearedByGrower: "text-muted-foreground",
  Reviewed: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
}

/** A flag's outcome; `label` comes pre-translated so admin and grower pages can share it. */
export function FlagOutcomeBadge({ outcome, label }: { outcome: FlagOutcome; label: string }) {
  return (
    <Badge variant="outline" className={`whitespace-nowrap ${TONE[outcome]}`}>
      {label}
    </Badge>
  )
}
