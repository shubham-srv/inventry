import { type LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function StatCard({
  title,
  value,
  icon: Icon,
  hint,
  className,
}: {
  title: string
  value: string | number
  icon?: LucideIcon
  hint?: string
  className?: string
}) {
  return (
    <Card className={cn("py-0", className)}>
      <CardContent className="flex items-center gap-4 p-4">
        {Icon && (
          <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
            <Icon className="size-5" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium">{title}</p>
          <p className="truncate text-2xl font-semibold tabular-nums">{value}</p>
          {hint && <p className="text-muted-foreground truncate text-xs">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
