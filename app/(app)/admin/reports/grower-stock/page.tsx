import { requireCapability } from "@/lib/auth/session"
import { getT } from "@/lib/i18n/server"
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
  const t = await getT()
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
        {label}
      </Badge>
    )

  const STOCK_STATUSES = [
    { label: t("admin.reports.stock.Uncounted"), value: "uncounted" },
    { label: t("admin.reports.stock.Zero"), value: "zero" },
    { label: t("admin.reports.stock.Low"), value: "low" },
    { label: t("admin.reports.stock.OK"), value: "ok" },
  ]

  const columns: ReportColumn<GrowerStockSummaryRow>[] = [
    {
      key: "grower",
      header: <SortHeader label={t("admin.common.grower")} searchParams={raw} current={sort} primary="name" defaultSort="stale" />,
      cell: (r) => (
        <div>
          <span className="font-medium">{r.growerName}</span>
          <p className="text-muted-foreground text-xs">
            {t(r.locations === 1 ? "admin.reports.growerStock.locationOne" : "admin.reports.growerStock.locationOther", {
              count: r.locations,
            })}
          </p>
        </div>
      ),
    },
    {
      key: "last",
      header: (
        <SortHeader
          label={t("admin.reports.lastSubmitted")}
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
      header: t("admin.common.items"),
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="tabular-nums">{r.items}</span>
          {count(r.low, t("admin.reports.growerStock.badgeLow", { count: r.low }), "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400")}
          {count(r.zero, t("admin.reports.growerStock.badgeZero", { count: r.zero }), "border-transparent bg-red-500/15 text-red-700 dark:text-red-400")}
          {count(r.uncounted, t("admin.reports.growerStock.badgeUncounted", { count: r.uncounted }), "text-muted-foreground")}
          {count(r.onOrderItems, t("admin.reports.growerStock.badgeOnOrder", { count: r.onOrderItems }), "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-400")}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <DataTableToolbar
        searchPlaceholder={t("admin.reports.growerStock.search")}
        exportEntity="inventory-snapshot"
        filters={[
          { key: "grower", label: t("admin.common.grower"), options: growers },
          {
            key: "flag",
            label: t("admin.reports.lastSubmitted"),
            options: SUBMISSION_FLAG_FILTERS.map((f) => ({ ...f, label: t(`admin.reports.flag.${f.value}`) })),
          },
          { key: "location", label: t("admin.common.location"), options: locations },
          { key: "commodity", label: t("admin.common.commodity"), options: commodities },
          { key: "category", label: t("admin.common.category"), options: categories },
          { key: "stock", label: t("admin.common.status"), options: STOCK_STATUSES },
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
        emptyMessage={t("admin.reports.growerStock.empty")}
      />
    </div>
  )
}
