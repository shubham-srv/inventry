import { Pencil, Plus, Trash2 } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { growersWhere } from "@/lib/admin/queries"
import { parseListParams } from "@/lib/query"
import { ENTITY_STATUS } from "@/lib/constants"
import { createGrower, updateGrower, deleteGrower } from "@/lib/actions/partners"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { ConfirmButton } from "@/components/crud/confirm-button"
import { StatusBadge } from "@/components/status-badge"

const STATUSES = [ENTITY_STATUS.ACTIVE, ENTITY_STATUS.INACTIVE, ENTITY_STATUS.PENDING]

type Row = {
  id: number
  growerName: string
  primaryEmail: string | null
  status: string
  authorizations: { itemId: string }[]
  _count: { users: number }
}

export default async function GrowersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_GROWERS_VENDORS)
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams)
  const where = growersWhere(raw)
  const [rows, total, items] = await Promise.all([
    prisma.grower.findMany({
      where,
      include: {
        authorizations: { where: { isActive: true }, select: { itemId: true } },
        _count: { select: { users: true } },
      },
      orderBy: { growerName: "asc" },
      skip,
      take,
    }),
    prisma.grower.count({ where }),
    prisma.item.findMany({ where: { status: ENTITY_STATUS.ACTIVE }, orderBy: { id: "asc" }, select: { id: true, itemName: true } }),
  ])

  const fields: Field[] = [
    { name: "growerName", label: "Name", type: "text", required: true, colSpan: 2 },
    { name: "primaryEmail", label: "Primary email", type: "text", colSpan: 2 },
    { name: "status", label: "Status", type: "select", required: true, options: STATUSES.map((s) => ({ label: s, value: s })) },
    {
      name: "itemIds",
      label: "Items (this grower can access)",
      type: "multiselect",
      placeholder: "Select items",
      colSpan: 2,
      options: items.map((i) => ({ label: `${i.id} — ${i.itemName}`, value: i.id })),
    },
  ]

  const columns: Column<Row>[] = [
    { key: "name", header: "Name", cell: (r) => <span className="font-medium">{r.growerName}</span> },
    { key: "email", header: "Primary email", cell: (r) => r.primaryEmail ?? "—" },
    { key: "users", header: "Users", cell: (r) => r._count.users },
    { key: "items", header: "Items", cell: (r) => r.authorizations.length },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog title="Edit grower" fields={fields} action={updateGrower} values={{ id: r.id, growerName: r.growerName, primaryEmail: r.primaryEmail ?? "", status: r.status, itemIds: r.authorizations.map((a) => a.itemId).join(",") }} submitLabel="Save changes" trigger={<Button variant="ghost" size="icon-sm" aria-label="Edit"><Pencil /></Button>} />
          <ConfirmButton title="Delete grower" description={`Delete ${r.growerName}? If it has users or history, set status Inactive instead.`} confirmLabel="Delete" action={deleteGrower.bind(null, r.id)} trigger={<Button variant="ghost" size="icon-sm" aria-label="Delete"><Trash2 /></Button>} />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Growers" description="Grower organizations and their inventory access." />
      <div className="space-y-4">
        <DataTableToolbar
          searchPlaceholder="Search growers…"
          exportEntity="growers"
          filters={[{ key: "status", label: "Status", options: STATUSES.map((s) => ({ label: s, value: s })) }]}
        >
          <EntityFormDialog title="New grower" fields={fields} action={createGrower} submitLabel="Create" trigger={<Button size="sm"><Plus className="size-4" /> Add grower</Button>} />
        </DataTableToolbar>
        <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
      </div>
    </>
  )
}
