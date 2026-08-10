import { format } from "date-fns"
import { Flag } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { parseListParams } from "@/lib/query"
import { getCurrentlyLow, type CurrentlyLowRow } from "@/lib/admin/low-inventory"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"

export default async function CurrentlyLowPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_GROWERS_VENDORS)
  const { raw } = parseListParams(await searchParams)

  const [rows, growers] = await Promise.all([
    getCurrentlyLow({
      growerId: raw.grower ? Number(raw.grower) || undefined : undefined,
      q: raw.q || undefined,
    }),
    prisma.grower.findMany({ orderBy: { growerName: "asc" } }),
  ])

  const columns: Column<CurrentlyLowRow>[] = [
    {
      key: "item",
      header: "Item",
      cell: (r) => (
        <div>
          <span className="font-medium">{r.itemName}</span>
          <p className="text-muted-foreground font-mono text-xs">{r.itemId}</p>
        </div>
      ),
    },
    { key: "grower", header: "Grower", cell: (r) => r.growerName },
    {
      key: "level",
      header: "On hand vs threshold",
      cell: (r) => {
        const pct = r.threshold > 0 ? Math.min(100, (r.onHand / r.threshold) * 100) : 0
        return (
          <div className="min-w-40">
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium tabular-nums">
                {r.onHand} / {r.threshold} {r.unitOfMeasure ?? ""}
              </span>
              <span className="text-muted-foreground tabular-nums">{Math.round(pct)}%</span>
            </div>
            <Progress value={pct} />
          </div>
        )
      },
    },
    {
      key: "scope",
      header: "Threshold",
      cell: (r) => (
        <Badge variant={r.thresholdScope === "Grower" ? "outline" : "secondary"}>
          {r.thresholdScope === "Grower" ? "Grower override" : "Global"}
        </Badge>
      ),
    },
    {
      key: "flagged",
      header: "Flagged",
      cell: (r) =>
        r.flagged ? (
          <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400">
            <Flag className="mr-1 size-3" /> Raised
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
    {
      key: "asOf",
      header: "Last counted",
      className: "text-muted-foreground whitespace-nowrap text-xs",
      cell: (r) => format(r.asOf, "MMM d"),
    },
  ]

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Computed live from the latest count per item and location against the effective threshold
        (a grower override where one exists, otherwise the global one). Nothing here needs
        clearing — rows leave on their own once the next count comes in above threshold.
      </p>
      <DataTableToolbar
        searchPlaceholder="Search item id / name…"
        filters={[
          { key: "grower", label: "Grower", options: growers.map((g) => ({ label: g.growerName, value: String(g.id) })) },
        ]}
      />
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => `${r.growerId}:${r.itemId}`}
        page={1}
        pageCount={1}
        total={rows.length}
        searchParams={raw}
      />
    </div>
  )
}
