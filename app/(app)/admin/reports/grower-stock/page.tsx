import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { parseListParams } from "@/lib/query"
import {
  getGrowerStockSummary,
  type GrowerStockSummaryRow,
  type SnapshotFilters,
} from "@/lib/admin/inventory-snapshot"
import { parsePartnerSort, SUBMISSION_FLAG_FILTERS } from "@/lib/reports/submission-flag"
import {
  activeGrowerOptions,
  categoryOptions,
  commodityOptions,
  countingLocationOptions,
} from "@/lib/admin/filter-options"
import { Badge } from "@/components/ui/badge"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import {
  ExpandableReportTable,
  SortHeader,
  type ReportColumn,
} from "@/components/reports/expandable-report-table"
import { LastSubmittedCell } from "@/components/reports/submission-flag-badge"
import { GrowerStockDetail } from "@/components/reports/grower-stock-detail"

const STOCK_STATUSES = [
  { label: "Uncounted", value: "uncounted" },
  { label: "Zero", value: "zero" },
  { label: "Below threshold", value: "low" },
  { label: "OK", value: "ok" },
]

/**
 * One row per grower — when they last submitted, how overdue that is, and a
 * summary of their stock — opening to that grower's items and per-location
 * counts. Most overdue first by default.
 */
export default async function GrowerStockPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.VIEW_REPORTS)
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams, { pageSize: 15 })
  const sort = parsePartnerSort(raw.sort)

  const filters: SnapshotFilters = {
    growerId: Number(raw.grower) || undefined,
    locationId: Number(raw.location) || undefined,
    commodity: raw.commodity || undefined,
    category: raw.category || undefined,
    stock: raw.stock || undefined,
    flag: raw.flag || undefined,
    q: raw.q || undefined,
  }

  const [{ rows, total }, growers, locations, commodities, categories] = await Promise.all([
    getGrowerStockSummary(filters, sort, { skip, take }),
    activeGrowerOptions(),
    countingLocationOptions(),
    commodityOptions(),
    categoryOptions(),
  ])

  const count = (n: number, label: string, tone: string) =>
    n > 0 && (
      <Badge variant="outline" className={`whitespace-nowrap ${tone}`}>
        {n} {label}
      </Badge>
    )

  const columns: ReportColumn<GrowerStockSummaryRow>[] = [
    {
      key: "grower",
      header: <SortHeader label="Grower" searchParams={raw} current={sort} primary="name" defaultSort="stale" />,
      cell: (r) => (
        <div>
          <span className="font-medium">{r.growerName}</span>
          <p className="text-muted-foreground text-xs">
            {r.locations} location{r.locations === 1 ? "" : "s"}
          </p>
        </div>
      ),
    },
    {
      key: "last",
      header: (
        <SortHeader
          label="Last submitted"
          searchParams={raw}
          current={sort}
          primary="stale"
          secondary="recent"
          defaultSort="stale"
        />
      ),
      cell: (r) => <LastSubmittedCell at={r.lastSubmittedAt} daysSince={r.daysSince} flag={r.flag} />,
    },
    {
      key: "items",
      header: "Items",
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="tabular-nums">{r.items}</span>
          {count(r.low, "low", "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400")}
          {count(r.zero, "zero", "border-transparent bg-red-500/15 text-red-700 dark:text-red-400")}
          {count(r.uncounted, "uncounted", "text-muted-foreground")}
          {count(r.onOrderItems, "on order", "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-400")}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <DataTableToolbar
        searchPlaceholder="Search grower / item / legacy ID…"
        exportEntity="inventory-snapshot"
        filters={[
          { key: "grower", label: "Grower", options: growers },
          { key: "flag", label: "Last submitted", options: [...SUBMISSION_FLAG_FILTERS] },
          { key: "location", label: "Location", options: locations },
          { key: "commodity", label: "Commodity", options: commodities },
          { key: "category", label: "Category", options: categories },
          { key: "stock", label: "Status", options: STOCK_STATUSES },
        ]}
      />
      <ExpandableReportTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.growerId}
        renderDetail={(r) => <GrowerStockDetail growerId={r.growerId} filters={filters} />}
        searchParams={raw}
        page={page}
        pageCount={Math.ceil(total / pageSize)}
        total={total}
        emptyMessage="No growers have authorized items matching these filters."
      />
    </div>
  )
}
