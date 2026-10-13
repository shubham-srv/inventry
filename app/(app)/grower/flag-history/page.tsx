import { format } from "date-fns"
import { requireRole } from "@/lib/auth/session"
import { ROLES } from "@/lib/constants"
import { getT } from "@/lib/i18n/server"
import { parseListParams } from "@/lib/query"
import { getFlagHistory, type FlagHistoryRow } from "@/lib/low-inventory/history"
import { PageHeader } from "@/components/page-header"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { FlagOutcomeBadge } from "@/components/low-inventory/flag-outcome-badge"

/** Every "Low" flag this grower raised, and how each one ended. */
export default async function GrowerFlagHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireRole([ROLES.GROWER_USER])
  if (!user.growerId) return <p className="text-sm">Your account is not mapped to a grower.</p>

  const t = await getT()
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams, { pageSize: 15 })
  const { rows, total } = await getFlagHistory(
    // Scoped by the session, never by a URL parameter.
    { growerId: user.growerId, outcome: raw.outcome, q: raw.q },
    { skip, take }
  )

  const qty = (v: number | null, unit: string | null) =>
    v == null ? <span className="text-muted-foreground">—</span> : `${v} ${unit ?? ""}`

  const columns: Column<FlagHistoryRow>[] = [
    {
      key: "item",
      header: t("grower.flagHistory.item"),
      cell: (r) => (
        <div>
          <span className="font-medium">{r.itemName}</span>
          <p className="text-muted-foreground font-mono text-xs">{r.itemId}</p>
        </div>
      ),
    },
    {
      key: "raised",
      header: t("grower.flagHistory.raised"),
      className: "text-xs whitespace-nowrap",
      cell: (r) => (
        <div>
          {format(r.raisedAt, "MMM d, yyyy HH:mm")}
          {r.raisedBy && <p className="text-muted-foreground">{t("grower.flagHistory.by", { name: r.raisedBy })}</p>}
        </div>
      ),
    },
    { key: "then", header: t("grower.flagHistory.onHandThen"), className: "tabular-nums", cell: (r) => qty(r.onHandAtFlag, r.categoryName) },
    { key: "now", header: t("grower.flagHistory.onHandNow"), className: "tabular-nums", cell: (r) => qty(r.onHandNow, r.categoryName) },
    {
      key: "status",
      header: t("grower.flagHistory.status"),
      cell: (r) => <FlagOutcomeBadge outcome={r.outcome} label={t(`grower.flagHistory.outcome.${r.outcome}`)} />,
    },
    {
      key: "cleared",
      header: t("grower.flagHistory.cleared"),
      className: "text-xs whitespace-nowrap",
      cell: (r) =>
        r.clearedAt ? (
          <div>
            {format(r.clearedAt, "MMM d, yyyy HH:mm")}
            {r.clearedBy && <p className="text-muted-foreground">{t("grower.flagHistory.by", { name: r.clearedBy })}</p>}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "notes",
      header: t("grower.flagHistory.reviewNotes"),
      className: "text-xs",
      cell: (r) => r.reviewNotes ?? <span className="text-muted-foreground">—</span>,
    },
  ]

  return (
    <>
      <PageHeader title={t("grower.flagHistory.title")} description={t("grower.flagHistory.description")} />
      <div className="space-y-4">
        <DataTableToolbar
          searchPlaceholder={t("submitList.search")}
          filters={[
            {
              key: "outcome",
              label: t("grower.flagHistory.status"),
              options: [
                { label: t("grower.flagHistory.outcome.Open"), value: "open" },
                { label: t("grower.flagHistory.outcome.ClearedByGrower"), value: "grower" },
                { label: t("grower.flagHistory.outcome.Reviewed"), value: "reviewed" },
              ],
            },
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
          emptyMessage={t("grower.flagHistory.none")}
        />
      </div>
    </>
  )
}
