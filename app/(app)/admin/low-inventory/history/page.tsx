import { format } from "date-fns"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { parseListParams } from "@/lib/query"
import { getFlagHistory, type FlagHistoryRow, type FlagOutcome } from "@/lib/low-inventory/history"
import { allGrowerOptions } from "@/lib/admin/filter-options"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { FlagOutcomeBadge } from "@/components/low-inventory/flag-outcome-badge"

const OUTCOME_LABEL: Record<FlagOutcome, string> = {
  Open: "Open",
  ClearedByGrower: "Unflagged by grower",
  Reviewed: "Reviewed by admin",
}

/** Every flag ever raised — the audit trail behind the "Raised flags" queue. */
export default async function FlagHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_GROWERS_VENDORS)
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams, { pageSize: 15 })

  const [{ rows, total }, growers] = await Promise.all([
    getFlagHistory({ growerId: Number(raw.grower) || undefined, outcome: raw.outcome, q: raw.q }, { skip, take }),
    // History: inactive growers' flags stay listed, so they stay filterable.
    allGrowerOptions(),
  ])

  const qty = (v: number | null, unit: string | null) =>
    v == null ? <span className="text-muted-foreground">—</span> : `${v} ${unit ?? ""}`
  const stamp = (d: Date, who: string | null) => (
    <div>
      {format(d, "MMM d, yyyy HH:mm")}
      {who && <p className="text-muted-foreground">by {who}</p>}
    </div>
  )

  const columns: Column<FlagHistoryRow>[] = [
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
    { key: "raised", header: "Raised", className: "text-xs whitespace-nowrap", cell: (r) => stamp(r.raisedAt, r.raisedBy) },
    { key: "then", header: "On hand then", className: "tabular-nums", cell: (r) => qty(r.onHandAtFlag, r.categoryName) },
    { key: "now", header: "On hand now", className: "tabular-nums", cell: (r) => qty(r.onHandNow, r.categoryName) },
    { key: "status", header: "Status", cell: (r) => <FlagOutcomeBadge outcome={r.outcome} label={OUTCOME_LABEL[r.outcome]} /> },
    {
      key: "cleared",
      header: "Cleared",
      className: "text-xs whitespace-nowrap",
      cell: (r) => (r.clearedAt ? stamp(r.clearedAt, r.clearedBy) : <span className="text-muted-foreground">—</span>),
    },
    {
      key: "notes",
      header: "Review notes",
      className: "text-muted-foreground text-xs",
      cell: (r) => r.reviewNotes ?? "—",
    },
  ]

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Every flag growers have raised with the &ldquo;Low&rdquo; toggle — still open, unflagged by the grower, or
        cleared by an admin review — with the on-hand total when it was raised next to the total now.
      </p>
      <DataTableToolbar
        searchPlaceholder="Search item…"
        filters={[
          {
            key: "outcome",
            label: "Status",
            options: [
              { label: OUTCOME_LABEL.Open, value: "open" },
              { label: OUTCOME_LABEL.ClearedByGrower, value: "grower" },
              { label: OUTCOME_LABEL.Reviewed, value: "reviewed" },
            ],
          },
          { key: "grower", label: "Grower", options: growers },
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
        emptyMessage="No flags match these filters."
      />
    </div>
  )
}
