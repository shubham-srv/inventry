import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { parseListParams } from "@/lib/query"
import {
  getVendorStockSummary,
  type VendorStockFilters,
  type VendorStockSummaryRow,
} from "@/lib/admin/vendor-stock"
import { parsePartnerSort, SUBMISSION_FLAG_FILTERS } from "@/lib/reports/submission-flag"
import {
  activeGrowerOptions,
  activeVendorOptions,
  categoryOptions,
  commodityOptions,
} from "@/lib/admin/filter-options"
import { Badge } from "@/components/ui/badge"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import {
  ExpandableReportTable,
  SortHeader,
  type ReportColumn,
} from "@/components/reports/expandable-report-table"
import { LastSubmittedCell } from "@/components/reports/submission-flag-badge"
import { VendorStockDetail } from "@/components/reports/vendor-stock-detail"

const ALLOCATION = [
  { label: "Fully allocated", value: "full" },
  { label: "Has unallocated", value: "partial" },
  { label: "Nothing allocated", value: "none" },
  { label: "Not reported", value: "unreported" },
]

/**
 * One row per vendor — when they last reported and how overdue that is —
 * opening to what they reported per item. Most overdue first by default.
 */
export default async function VendorStockPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.VIEW_REPORTS)
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams, { pageSize: 15 })
  const sort = parsePartnerSort(raw.sort)

  const filters: VendorStockFilters = {
    vendorId: Number(raw.vendor) || undefined,
    commodity: raw.commodity || undefined,
    category: raw.category || undefined,
    growerId: Number(raw.grower) || undefined,
    alloc: raw.alloc || undefined,
    flag: raw.flag || undefined,
    q: raw.q || undefined,
  }

  const [{ rows, total }, vendors, growers, commodities, categories] = await Promise.all([
    getVendorStockSummary(filters, sort, { skip, take }),
    activeVendorOptions(),
    activeGrowerOptions(),
    commodityOptions(),
    categoryOptions(),
  ])

  const count = (n: number, label: string, tone: string) =>
    n > 0 && (
      <Badge variant="outline" className={`whitespace-nowrap ${tone}`}>
        {n} {label}
      </Badge>
    )

  const columns: ReportColumn<VendorStockSummaryRow>[] = [
    {
      key: "vendor",
      header: <SortHeader label="Vendor" searchParams={raw} current={sort} primary="name" defaultSort="stale" />,
      cell: (r) => <span className="font-medium">{r.vendorName}</span>,
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
          {count(r.neverReported, "never reported", "text-muted-foreground")}
          {count(r.unallocatedItems, "with unallocated", "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400")}
          {count(r.awaitingDate, "orders awaiting date", "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-400")}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <DataTableToolbar
        searchPlaceholder="Search vendor / item / legacy ID…"
        exportEntity="vendor-stock"
        filters={[
          { key: "vendor", label: "Vendor", options: vendors },
          { key: "flag", label: "Last submitted", options: [...SUBMISSION_FLAG_FILTERS] },
          { key: "grower", label: "Held for", options: growers },
          { key: "commodity", label: "Commodity", options: commodities },
          { key: "category", label: "Category", options: categories },
          { key: "alloc", label: "Allocation", options: ALLOCATION },
        ]}
      />
      <ExpandableReportTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.vendorId}
        renderDetail={(r) => <VendorStockDetail vendorId={r.vendorId} filters={filters} />}
        searchParams={raw}
        page={page}
        pageCount={Math.ceil(total / pageSize)}
        total={total}
        emptyMessage={
          filters.growerId
            ? "No vendor is currently holding any of these items for that grower. Note this filter only looks at each vendor's latest report."
            : "No vendors have mapped items matching these filters."
        }
      />
    </div>
  )
}
