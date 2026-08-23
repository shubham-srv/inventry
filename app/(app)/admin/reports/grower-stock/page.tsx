import { format } from "date-fns"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { parseListParams } from "@/lib/query"
import {
  getInventorySnapshot,
  type InventorySnapshotRow,
} from "@/lib/admin/inventory-snapshot"
import {
  activeGrowerOptions,
  categoryOptions,
  commodityOptions,
  countingLocationOptions,
} from "@/lib/admin/filter-options"
import { Badge } from "@/components/ui/badge"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"

const STOCK_STATES = [
  { label: "Uncounted", value: "uncounted" },
  { label: "Zero", value: "zero" },
  { label: "Below threshold", value: "low" },
  { label: "OK", value: "ok" },
]

const STATE_TONE: Record<InventorySnapshotRow["state"], string> = {
  Uncounted: "text-muted-foreground",
  Zero: "border-transparent bg-red-500/15 text-red-700 dark:text-red-400",
  Low: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
  OK: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
}

export default async function InventorySnapshotPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.VIEW_REPORTS)
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams, { pageSize: 25 })

  const filters = {
    growerId: Number(raw.grower) || undefined,
    locationId: Number(raw.location) || undefined,
    commodity: raw.commodity || undefined,
    category: raw.category || undefined,
    stock: raw.stock || undefined,
    q: raw.q || undefined,
  }

  const [{ rows, total }, growers, locations, commodities, categories] = await Promise.all([
    getInventorySnapshot(filters, { skip, take }),
    activeGrowerOptions(),
    countingLocationOptions(),
    commodityOptions(),
    categoryOptions(),
  ])

  const columns: Column<InventorySnapshotRow>[] = [
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
    { key: "commodity", header: "Commodity", cell: (r) => r.commodityName ?? "—" },
    // Doubles as the unit: quantities are counted in the item's category.
    { key: "category", header: "Category", cell: (r) => r.categoryName ?? "—" },
    {
      key: "onHand",
      header: "On hand",
      className: "tabular-nums",
      cell: (r) =>
        r.onHand == null ? (
          <span className="text-muted-foreground text-xs">Never counted</span>
        ) : (
          `${r.onHand} ${r.categoryName ?? ""}`
        ),
    },
    {
      key: "threshold",
      header: "Threshold",
      className: "tabular-nums",
      cell: (r) =>
        r.threshold == null ? (
          "—"
        ) : (
          <span className="flex items-center gap-2">
            {r.threshold}
            <Badge variant={r.thresholdScope === "Grower" ? "secondary" : "outline"}>
              {r.thresholdScope === "Grower" ? "Grower override" : "Global"}
            </Badge>
          </span>
        ),
    },
    {
      key: "state",
      header: "State",
      cell: (r) => (
        <Badge variant="outline" className={STATE_TONE[r.state]}>
          {r.state === "Low" ? "Below threshold" : r.state}
        </Badge>
      ),
    },
    {
      key: "asOf",
      header: "Last counted",
      className: "text-xs text-muted-foreground",
      cell: (r) => (r.asOf ? format(r.asOf, "MMM d") : "—"),
    },
  ]

  return (
    <div className="space-y-4">
      <DataTableToolbar
        searchPlaceholder="Search grower / item id / name…"
        exportEntity="inventory-snapshot"
        filters={[
          { key: "grower", label: "Grower", options: growers },
          { key: "location", label: "Location", options: locations },
          { key: "commodity", label: "Commodity", options: commodities },
          { key: "category", label: "Category", options: categories },
          { key: "stock", label: "Stock", options: STOCK_STATES },
        ]}
      />
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => `${r.growerId}:${r.itemId}`}
        page={page}
        pageCount={Math.ceil(total / pageSize)}
        total={total}
        searchParams={raw}
        emptyMessage="No authorized grower/item pairs match these filters."
      />
    </div>
  )
}
