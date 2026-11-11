import { formatDate } from "@/lib/dates"
import { requireCapability } from "@/lib/auth/session"
import { getLocale, getT } from "@/lib/i18n/server"
import type { TFunction } from "@/lib/i18n/translate"
import { CAPABILITIES } from "@/lib/rbac"
import { parseListParams } from "@/lib/query"
import { ORDER_STATUSES } from "@/lib/constants"
import { getOrdersReport, type OrderReportRow } from "@/lib/admin/orders-report"
import { allGrowerOptions, allVendorOptions } from "@/lib/admin/filter-options"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { NotesCell } from "@/components/data-table/notes-cell"

/** "6 days overdue" / "Due in 2d" / "2 days late" / "3 days early" / "On time". */
function deliveryLabel(r: OrderReportRow, t: TFunction): string {
  const n = r.deliveryDays
  const k = "admin.reports.orders.delivery"
  switch (r.delivery) {
    case "Overdue":
      return t(`${k}.overdue${n === 1 ? "One" : "Other"}`, { n: n ?? 0 })
    case "Due":
      return n === 0 ? t(`${k}.dueToday`) : t(`${k}.dueIn`, { n: n ?? 0 })
    case "Late":
      return t(`${k}.late${n === 1 ? "One" : "Other"}`, { n: n ?? 0 })
    case "OnTime":
      return n === 0 ? t(`${k}.onTime`) : t(`${k}.early${n === -1 ? "One" : "Other"}`, { n: -n! })
    case "Cancelled":
      return t("status.Cancelled")
    default:
      return "—"
  }
}

const DELIVERY_TONE: Record<OrderReportRow["delivery"], string> = {
  Overdue: "text-red-700 dark:text-red-400 font-medium",
  Due: "text-muted-foreground",
  Late: "text-amber-700 dark:text-amber-400",
  OnTime: "text-emerald-700 dark:text-emerald-400",
  Cancelled: "text-muted-foreground",
  Unknown: "text-muted-foreground",
}

export default async function OrdersReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.VIEW_REPORTS)
  const t = await getT()
  const locale = await getLocale()
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams, { pageSize: 25 })

  const filters = {
    status: raw.status || undefined,
    growerId: Number(raw.grower) || undefined,
    vendorId: Number(raw.vendor) || undefined,
    periodDays: Number(raw.period) || undefined,
    delivery: raw.delivery || undefined,
    receipt: raw.receipt || undefined,
    q: raw.q || undefined,
  }

  const [{ rows, total }, growers, vendors] = await Promise.all([
    getOrdersReport(filters, { skip, take }),
    // ALL growers and vendors, not just Active: this is history, and an inactive
    // partner's past orders stay in the table — so they must stay filterable.
    allGrowerOptions(),
    allVendorOptions(),
  ])

  const PERIODS = [7, 30, 90].map((days) => ({
    label: t("admin.reports.orders.lastDays", { days }),
    value: String(days),
  }))

  const DELIVERY_STATES = ["awaiting", "overdue", "due", "late", "ontime", "noeta"].map((value) => ({
    label: t(`admin.reports.orders.deliveryStates.${value}`),
    value,
  }))

  const RECEIPT_STATES = ["exact", "short", "over", "unrecorded"].map((value) => ({
    label: t(`admin.reports.orders.receiptStates.${value}`),
    value,
  }))

  const columns: Column<OrderReportRow>[] = [
    { key: "id", header: t("admin.reports.orders.order"), className: "font-mono text-xs", cell: (r) => `#${r.id}` },
    { key: "grower", header: t("admin.common.grower"), cell: (r) => r.growerName },
    {
      key: "item",
      header: t("admin.common.item"),
      cell: (r) => (
        <div>
          <span className="font-medium">{r.itemName}</span>
          <p className="text-muted-foreground font-mono text-xs">{r.itemId}</p>
        </div>
      ),
    },
    {
      key: "legacy",
      header: t("admin.reports.legacyId"),
      className: "font-mono text-xs",
      cell: (r) => r.legacyId ?? <span className="text-muted-foreground">—</span>,
    },
    { key: "vendor", header: t("admin.common.vendor"), cell: (r) => r.vendorName },
    {
      key: "ordered",
      header: t("admin.reports.orders.ordered"),
      className: "tabular-nums",
      cell: (r) => `${r.quantity} ${r.categoryName ?? ""}`,
    },
    {
      key: "received",
      header: t("admin.reports.orders.received"),
      className: "tabular-nums",
      cell: (r) =>
        r.receivedQuantity == null ? (
          // Not the same as zero: an Open order has nothing to receive, and a
          // Received one with no figure means nobody recorded it.
          <span className="text-muted-foreground text-xs">—</span>
        ) : (
          <span>
            {r.receivedQuantity}
            {r.variance !== 0 && (
              <span
                className={
                  r.variance! < 0
                    ? "ml-1 text-red-700 dark:text-red-400"
                    : "ml-1 text-amber-700 dark:text-amber-400"
                }
              >
                ({r.variance! > 0 ? "+" : ""}
                {r.variance})
              </span>
            )}
          </span>
        ),
    },
    {
      key: "reason",
      header: t("admin.reports.orders.reason"),
      className: "text-xs",
      // Blank on a real discrepancy is legitimate — the reason is optional in
      // the receive dialog, which is why the variance above is the source of truth.
      cell: (r) => r.receiptNote ?? <span className="text-muted-foreground">—</span>,
    },
    { key: "status", header: t("admin.common.status"), cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: "orderDate",
      header: t("admin.reports.orders.orderedOn"),
      className: "text-xs text-muted-foreground whitespace-nowrap",
      cell: (r) => formatDate(r.orderDate, "MMM d", locale),
    },
    {
      key: "requested",
      header: t("admin.reports.orders.requested"),
      className: "text-xs text-muted-foreground whitespace-nowrap",
      cell: (r) => (r.expectedDeliveryDate ? formatDate(r.expectedDeliveryDate, "MMM d", locale) : "—"),
    },
    {
      key: "confirmed",
      header: t("admin.reports.orders.vendorDate"),
      className: "text-xs whitespace-nowrap",
      cell: (r) =>
        r.confirmedDeliveryDate ? (
          <div>
            <span className="font-medium">{formatDate(r.confirmedDeliveryDate, "MMM d", locale)}</span>
            {r.confirmedAt && (
              <p className="text-muted-foreground">
                {t("admin.reports.orders.setOn", { date: formatDate(r.confirmedAt, "MMM d", locale) })}
              </p>
            )}
          </div>
        ) : r.awaitingVendor ? (
          <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400">
            {t("admin.reports.orders.awaitingVendor")}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "delivery",
      header: t("admin.reports.orders.deliveryCol"),
      className: "text-xs",
      cell: (r) => <span className={DELIVERY_TONE[r.delivery]}>{deliveryLabel(r, t)}</span>,
    },
    {
      key: "lead",
      header: t("admin.reports.orders.leadTime"),
      className: "text-xs text-muted-foreground tabular-nums",
      cell: (r) =>
        r.actualLeadDays == null
          ? "—"
          : r.slaLeadDays == null
            ? t("admin.reports.orders.leadDays", { n: r.actualLeadDays })
            : t("admin.reports.orders.leadVsSla", { actual: r.actualLeadDays, sla: r.slaLeadDays }),
    },
    { key: "notes", header: t("admin.reports.orders.itemNotes"), cell: (r) => <NotesCell notes={r.notes} /> },
  ]

  return (
    <div className="space-y-4">
      <DataTableToolbar
        searchPlaceholder={t("admin.reports.orders.search")}
        exportEntity="orders"
        filters={[
          {
            key: "status",
            label: t("admin.common.status"),
            options: ORDER_STATUSES.map((s) => ({ label: t(`status.${s}`), value: s })),
          },
          { key: "grower", label: t("admin.common.grower"), options: growers },
          { key: "vendor", label: t("admin.common.vendor"), options: vendors },
          { key: "period", label: t("admin.reports.orders.period"), options: PERIODS },
          { key: "delivery", label: t("admin.reports.orders.deliveryCol"), options: DELIVERY_STATES },
          { key: "receipt", label: t("admin.reports.orders.receipt"), options: RECEIPT_STATES },
        ]}
      />
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        page={page}
        pageCount={Math.ceil(total / pageSize)}
        total={total}
        searchParams={raw}
        emptyMessage={t("admin.reports.orders.empty")}
      />
    </div>
  )
}
