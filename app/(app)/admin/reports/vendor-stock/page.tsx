import { format } from "date-fns"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { parseListParams } from "@/lib/query"
import { getVendorStock, type VendorStockRow } from "@/lib/admin/vendor-stock"
import {
  activeGrowerOptions,
  activeVendorOptions,
  categoryOptions,
  commodityOptions,
} from "@/lib/admin/filter-options"
import { Badge } from "@/components/ui/badge"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"

const FRESHNESS = [
  { label: "Fresh", value: "fresh" },
  { label: "Ageing", value: "ageing" },
  { label: "Stale", value: "stale" },
  { label: "Never reported", value: "never" },
]

const ALLOCATION = [
  { label: "Fully allocated", value: "full" },
  { label: "Has unallocated", value: "partial" },
  { label: "Nothing allocated", value: "none" },
  { label: "Not reported", value: "unreported" },
]

// Deliberately parallel to the grower-stock tab's OK / Low / Zero / Uncounted.
const STATE_TONE: Record<VendorStockRow["state"], string> = {
  Fresh: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  Ageing: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
  Stale: "border-transparent bg-red-500/15 text-red-700 dark:text-red-400",
  NeverReported: "text-muted-foreground",
}

const STATE_LABEL: Record<VendorStockRow["state"], string> = {
  Fresh: "Fresh",
  Ageing: "Ageing",
  Stale: "Stale",
  NeverReported: "Never reported",
}

export default async function VendorStockPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.VIEW_REPORTS)
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams, { pageSize: 25 })

  const filters = {
    vendorId: Number(raw.vendor) || undefined,
    commodity: raw.commodity || undefined,
    category: raw.category || undefined,
    growerId: Number(raw.grower) || undefined,
    freshness: raw.freshness || undefined,
    alloc: raw.alloc || undefined,
    q: raw.q || undefined,
  }

  const [{ rows, total }, vendors, growers, commodities, categories] = await Promise.all([
    getVendorStock(filters, { skip, take }),
    activeVendorOptions(),
    activeGrowerOptions(),
    commodityOptions(),
    categoryOptions(),
  ])

  /** `—` for never-reported, so a gap never renders as a confident zero. */
  const num = (v: number | null, suffix = "") =>
    v == null ? <span className="text-muted-foreground text-xs">—</span> : `${v}${suffix}`

  const columns: Column<VendorStockRow>[] = [
    { key: "vendor", header: "Vendor", cell: (r) => r.vendorName },
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
    { key: "commodity", header: "Commodity", cell: (r) => r.commodityName ?? "—" },
    // Doubles as the unit: quantities are counted in the item's category.
    { key: "category", header: "Category", cell: (r) => r.categoryName ?? "—" },
    {
      key: "reported",
      header: "Reported",
      className: "tabular-nums",
      cell: (r) => num(r.reported, r.categoryName ? ` ${r.categoryName}` : ""),
    },
    { key: "allocated", header: "Allocated", className: "tabular-nums", cell: (r) => num(r.allocated) },
    {
      key: "unallocated",
      header: "Unallocated",
      className: "tabular-nums",
      cell: (r) =>
        r.unallocated == null ? (
          <span className="text-muted-foreground text-xs">—</span>
        ) : r.unallocated > 0 ? (
          <span className="text-amber-700 dark:text-amber-400">{r.unallocated}</span>
        ) : (
          r.unallocated
        ),
    },
    { key: "growers", header: "Growers", className: "tabular-nums", cell: (r) => num(r.growersServed) },
    {
      key: "asOf",
      header: "Last reported",
      className: "text-xs text-muted-foreground",
      cell: (r) => (r.asOf ? format(r.asOf, "MMM d") : "—"),
    },
    {
      key: "state",
      header: "Status",
      cell: (r) => (
        <Badge variant="outline" className={STATE_TONE[r.state]}>
          {STATE_LABEL[r.state]}
        </Badge>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <DataTableToolbar
        searchPlaceholder="Search vendor / item id / name…"
        exportEntity="vendor-stock"
        filters={[
          { key: "vendor", label: "Vendor", options: vendors },
          { key: "grower", label: "Held for", options: growers },
          { key: "commodity", label: "Commodity", options: commodities },
          { key: "category", label: "Category", options: categories },
          { key: "freshness", label: "Status", options: FRESHNESS },
          { key: "alloc", label: "Allocation", options: ALLOCATION },
        ]}
      />
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => `${r.vendorId}:${r.itemId}`}
        page={page}
        pageCount={Math.ceil(total / pageSize)}
        total={total}
        searchParams={raw}
        emptyMessage={
          filters.growerId
            ? "No vendor is currently holding any of these items for that grower. Note this filter only looks at each vendor's latest report."
            : "No vendor/item mappings match these filters."
        }
      />
    </div>
  )
}
