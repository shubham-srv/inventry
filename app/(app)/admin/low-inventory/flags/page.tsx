import { format } from "date-fns"
import { CheckCircle2 } from "lucide-react"
import { type Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { parseListParams } from "@/lib/query"
import { reviewLowFlag } from "@/lib/actions/low-inventory"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"

type Row = {
  id: number
  itemId: string
  reason: string | null
  isActive: boolean
  createdAt: Date
  flaggedBy: number
  grower: { growerName: string }
  item: { itemName: string }
}

const reviewFields: Field[] = [
  { name: "reviewNotes", label: "Review notes (optional)", type: "textarea", colSpan: 2 },
]

export default async function AdminLowInventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_GROWERS_VENDORS)
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams)

  const and: Prisma.LowInventoryFlagWhereInput[] = []
  if (raw.q) and.push({ item: { itemName: { contains: raw.q } } })
  if (raw.grower) and.push({ growerId: Number(raw.grower) || 0 })
  // Default view is the review queue (awaiting review); admins can switch.
  if (raw.state === "reviewed") and.push({ isActive: false })
  else if (raw.state !== "all") and.push({ isActive: true })
  const where: Prisma.LowInventoryFlagWhereInput = and.length ? { AND: and } : {}

  const [rows, total, growers] = await Promise.all([
    prisma.lowInventoryFlag.findMany({
      where,
      include: { grower: true, item: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.lowInventoryFlag.count({ where }),
    prisma.grower.findMany({ orderBy: { growerName: "asc" } }),
  ])

  // flaggedBy is a plain audit column (no relation) — resolve names in one query.
  const flaggerIds = [...new Set(rows.map((r) => r.flaggedBy))]
  const flaggers = flaggerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: flaggerIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : []
  const flaggerById = new Map(flaggers.map((u) => [u.id, `${u.firstName} ${u.lastName}`]))

  const columns: Column<Row>[] = [
    {
      key: "item",
      header: "Item",
      cell: (r) => (
        <div>
          <span className="font-medium">{r.item.itemName}</span>
          <p className="text-muted-foreground font-mono text-xs">{r.itemId}</p>
        </div>
      ),
    },
    { key: "grower", header: "Grower", cell: (r) => r.grower.growerName },
    { key: "by", header: "Flagged by", className: "text-muted-foreground text-xs", cell: (r) => flaggerById.get(r.flaggedBy) ?? "—" },
    { key: "reason", header: "Reason", className: "text-muted-foreground text-xs", cell: (r) => r.reason ?? "—" },
    {
      key: "state",
      header: "State",
      cell: (r) =>
        r.isActive ? (
          <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400">
            Awaiting review
          </Badge>
        ) : (
          <Badge variant="outline" className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
            Reviewed
          </Badge>
        ),
    },
    { key: "when", header: "When", className: "text-muted-foreground whitespace-nowrap text-xs", cell: (r) => format(r.createdAt, "MMM d") },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) =>
        r.isActive ? (
          <EntityFormDialog
            title="Review low-inventory flag"
            description={`${r.item.itemName} — ${r.grower.growerName}`}
            fields={reviewFields}
            action={reviewLowFlag}
            values={{ id: r.id, reviewNotes: "" }}
            submitLabel="Review & clear"
            trigger={
              <Button variant="outline" size="xs">
                <CheckCircle2 className="size-3.5" /> Review
              </Button>
            }
          />
        ) : null,
    },
  ]

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Flags growers raised by hand. Reviewing one clears it and notifies the grower; it then
        disappears from their view.
      </p>
      <DataTableToolbar
        searchPlaceholder="Search item…"
        filters={[
          {
            key: "state",
            label: "State",
            options: [
              { label: "Awaiting review", value: "active" },
              { label: "Reviewed", value: "reviewed" },
              { label: "All", value: "all" },
            ],
          },
          { key: "grower", label: "Grower", options: growers.map((g) => ({ label: g.growerName, value: String(g.id) })) },
        ]}
      />
      <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
    </div>
  )
}
