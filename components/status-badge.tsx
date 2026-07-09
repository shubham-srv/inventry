import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const GREEN = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
const AMBER = "bg-amber-500/15 text-amber-700 dark:text-amber-400"
const RED = "bg-red-500/15 text-red-700 dark:text-red-400"
const BLUE = "bg-blue-500/15 text-blue-700 dark:text-blue-400"
const GRAY = "bg-muted text-muted-foreground"

const MAP: Record<string, string> = {
  Active: GREEN,
  Approved: GREEN,
  Fulfilled: GREEN,
  Sent: GREEN,
  Yes: GREEN,
  Pending: AMBER,
  Draft: AMBER,
  Queued: AMBER,
  Review: AMBER,
  Reviewed: AMBER,
  Open: AMBER,
  Mocked: AMBER,
  Inactive: GRAY,
  No: GRAY,
  Rejected: RED,
  Failed: RED,
  Daily: BLUE,
  Weekly: BLUE,
  Monthly: BLUE,
  AfterNDays: BLUE,
}

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string
  /** Optional translated display text; colors still key off the raw status. */
  label?: string
  className?: string
}) {
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent font-medium", MAP[status] ?? GRAY, className)}
    >
      {label ?? status}
    </Badge>
  )
}
