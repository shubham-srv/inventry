import { requireCapability } from "@/lib/auth/session"
import { getT } from "@/lib/i18n/server"
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
  const t = await getT()
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
        {label}
      </Badge>
    )

  const ALLOCATION = [
    { label: t("admin.reports.vendorStock.alloc.full"), value: "full" },
    { label: t("admin.reports.vendorStock.alloc.partial"), value: "partial" },
    { label: t("admin.reports.vendorStock.alloc.none"), value: "none" },
    { label: t("admin.reports.vendorStock.alloc.unreported"), value: "unreported" },
  ]

  const columns: ReportColumn<VendorStockSummaryRow>[] = [
    {
      key: "vendor",
      header: <SortHeader label={t("admin.common.vendor")} searchParams={raw} current={sort} primary="name" defaultSort="stale" />,
      cell: (r) => <span className="font-medium">{r.vendorName}</span>,
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
          {count(r.neverReported, t("admin.reports.vendorStock.badgeNeverReported", { count: r.neverReported }), "text-muted-foreground")}
          {count(r.unallocatedItems, t("admin.reports.vendorStock.badgeUnallocated", { count: r.unallocatedItems }), "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400")}
          {count(r.awaitingDate, t("admin.reports.vendorStock.badgeAwaitingDate", { count: r.awaitingDate }), "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-400")}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <DataTableToolbar
        searchPlaceholder={t("admin.reports.vendorStock.search")}
        exportEntity="vendor-stock"
        filters={[
          { key: "vendor", label: t("admin.common.vendor"), options: vendors },
          {
            key: "flag",
            label: t("admin.reports.lastSubmitted"),
            options: SUBMISSION_FLAG_FILTERS.map((f) => ({ ...f, label: t(`admin.reports.flag.${f.value}`) })),
          },
          { key: "grower", label: t("admin.reports.vendorStock.heldFor"), options: growers },
          { key: "commodity", label: t("admin.common.commodity"), options: commodities },
          { key: "category", label: t("admin.common.category"), options: categories },
          { key: "alloc", label: t("admin.reports.vendorStock.allocation"), options: ALLOCATION },
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
            ? t("admin.reports.vendorStock.emptyHeld")
            : t("admin.reports.vendorStock.empty")
        }
      />
    </div>
  )
}
