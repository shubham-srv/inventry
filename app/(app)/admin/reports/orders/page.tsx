import { format } from "date-fns"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { parseListParams } from "@/lib/query"
import { ORDER_STATUSES } from "@/lib/constants"
import { getOrdersReport, type OrderReportRow } from "@/lib/admin/orders-report"
import { allGrowerOptions, allVendorOptions } from "@/lib/admin/filter-options"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { StatusBadge } from "@/components/status-badge"

const PERIODS = [
  { label: "Last 7 days", value: "7" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
]

const DELIVERY_STATES = [
  { label: "Overdue", value: "overdue" },
  { label: "Not yet due", value: "due" },
  { label: "Delivered late", value: "late" },
  { label: "Delivered on time", value: "ontime" },
  { label: "No ETA set", value: "noeta" },
]

const RECEIPT_STATES = [
  { label: "Exact", value: "exact" },
  { label: "Short", value: "short" },
  { label: "Over", value: "over" },
  { label: "Not recorded", value: "unrecorded" },
]

/** "6 days overdue" / "Due in 2d" / "2 days late" / "3 days early" / "On time". */
function deliveryLabel(r: OrderReportRow): string {
  const n = r.deliveryDays
  switch (r.delivery) {
    case "Overdue":
      return `${n} day${n === 1 ? "" : "s"} overdue`
    case "Due":
      return n === 0 ? "Due today" : `Due in ${n}d`
    case "Late":
      return `${n} day${n === 1 ? "" : "s"} late`
    case "OnTime":
      return n === 0 ? "On time" : `${-n!} day${n === -1 ? "" : "s"} early`
    case "Cancelled":
      return "Cancelled"
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

  const columns: Column<OrderReportRow>[] = [
    { key: "id", header: "Order", className: "font-mono text-xs", cell: (r) => `#${r.id}` },
    { key: "grower", header: "Grower", cell: (r) => r.growerName },
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
    { key: "vendor", header: "Vendor", cell: (r) => r.vendorName },
    {
      key: "ordered",
      header: "Ordered",
      className: "tabular-nums",
      cell: (r) => `${r.quantity} ${r.categoryName ?? ""}`,
    },
    {
      key: "received",
      header: "Received",
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
      header: "Reason",
      className: "text-xs",
      // Blank on a real discrepancy is legitimate — the reason is optional in
      // the receive dialog, which is why the variance above is the source of truth.
      cell: (r) => r.receiptNote ?? <span className="text-muted-foreground">—</span>,
    },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: "orderDate",
      header: "Ordered on",
      className: "text-xs text-muted-foreground",
      cell: (r) => format(r.orderDate, "MMM d"),
    },
    {
      key: "delivery",
      header: "Delivery",
      className: "text-xs",
      cell: (r) => <span className={DELIVERY_TONE[r.delivery]}>{deliveryLabel(r)}</span>,
    },
    {
      key: "lead",
      header: "Lead time",
      className: "text-xs text-muted-foreground tabular-nums",
      cell: (r) =>
        r.actualLeadDays == null
          ? "—"
          : `${r.actualLeadDays}d${r.slaLeadDays == null ? "" : ` vs ${r.slaLeadDays}d SLA`}`,
    },
  ]

  return (
    <div className="space-y-4">
      <DataTableToolbar
        searchPlaceholder="Search order # / grower / vendor / item…"
        exportEntity="orders"
        filters={[
          { key: "status", label: "Status", options: ORDER_STATUSES.map((s) => ({ label: s, value: s })) },
          { key: "grower", label: "Grower", options: growers },
          { key: "vendor", label: "Vendor", options: vendors },
          { key: "period", label: "Period", options: PERIODS },
          { key: "delivery", label: "Delivery", options: DELIVERY_STATES },
          { key: "receipt", label: "Receipt", options: RECEIPT_STATES },
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
        emptyMessage="No orders match these filters."
      />
    </div>
  )
}
