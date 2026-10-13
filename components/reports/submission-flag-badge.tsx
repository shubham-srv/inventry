import { format } from "date-fns"
import { AlertTriangle, CircleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { SubmissionFlag } from "@/lib/reports/submission-flag"

const TONE: Record<Exclude<SubmissionFlag, "Ok">, string> = {
  ThreeDays: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
  Week: "border-transparent bg-red-500/15 text-red-700 dark:text-red-400",
  Never: "border-transparent bg-red-500/15 text-red-700 dark:text-red-400",
}

const LABEL: Record<Exclude<SubmissionFlag, "Ok">, string> = {
  ThreeDays: "3+ days",
  Week: "1 week+",
  Never: "Never submitted",
}

/** The overdue flag on its own: nothing when up to date. */
export function SubmissionFlagBadge({ flag }: { flag: SubmissionFlag }) {
  if (flag === "Ok") return null
  const Icon = flag === "ThreeDays" ? AlertTriangle : CircleAlert
  return (
    <Badge variant="outline" className={`whitespace-nowrap ${TONE[flag]}`}>
      <Icon className="mr-1 size-3" />
      {LABEL[flag]}
    </Badge>
  )
}

/** Last-submitted cell: full timestamp, how long ago, and the flag. */
export function LastSubmittedCell({
  at,
  daysSince,
  flag,
}: {
  at: Date | null
  daysSince: number | null
  flag: SubmissionFlag
}) {
  if (!at) return <SubmissionFlagBadge flag={flag} />
  return (
    <div className="flex flex-col items-start gap-1 text-xs">
      <span className="whitespace-nowrap">{format(at, "MMM d, yyyy HH:mm")}</span>
      <span className="text-muted-foreground flex items-center gap-1.5 whitespace-nowrap">
        {daysSince === 0 ? "today" : daysSince === 1 ? "yesterday" : `${daysSince} days ago`}
        <SubmissionFlagBadge flag={flag} />
      </span>
    </div>
  )
}
