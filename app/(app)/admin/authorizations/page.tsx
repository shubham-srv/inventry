import { Plus, Trash2, ShieldX, ShieldCheck } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { authorizationsWhere } from "@/lib/admin/queries"
import { parseListParams } from "@/lib/query"
import {
  createAuthorization,
  setAuthorizationActive,
  deleteAuthorization,
} from "@/lib/actions/authorizations"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { ConfirmButton } from "@/components/crud/confirm-button"
import { ActionButton } from "@/components/action-button"
import { StatusBadge } from "@/components/status-badge"

type Row = {
  id: number
  isActive: boolean
  itemId: string
  grower: { growerName: string }
  item: { itemName: string }
}

export default async function AuthorizationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_GROWERS_VENDORS)
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams, { pageSize: 15 })
  const where = authorizationsWhere(raw)
  const [rows, total, growers, items] = await Promise.all([
    prisma.growerItemAuthorization.findMany({ where, include: { grower: true, item: true }, orderBy: [{ growerId: "asc" }, { itemId: "asc" }], skip, take }),
    prisma.growerItemAuthorization.count({ where }),
    prisma.grower.findMany({ orderBy: { growerName: "asc" } }),
    prisma.item.findMany({ where: { status: "Active" }, orderBy: { id: "asc" } }),
  ])

  const fields: Field[] = [
    { name: "growerId", label: "Grower", type: "select", required: true, placeholder: "Select grower", options: growers.map((g) => ({ label: g.growerName, value: String(g.id) })), colSpan: 2 },
    { name: "itemId", label: "Item", type: "select", required: true, placeholder: "Select item", options: items.map((i) => ({ label: `${i.id} — ${i.itemName}`, value: i.id })), colSpan: 2 },
  ]

  const columns: Column<Row>[] = [
    { key: "grower", header: "Grower", cell: (r) => <span className="font-medium">{r.grower.growerName}</span> },
    { key: "itemId", header: "Item ID", className: "font-mono text-xs", cell: (r) => r.itemId },
    { key: "itemName", header: "Item", cell: (r) => r.item.itemName },
    { key: "active", header: "Status", cell: (r) => <StatusBadge status={r.isActive ? "Active" : "Inactive"} /> },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <ActionButton action={setAuthorizationActive.bind(null, r.id, !r.isActive)}>
            {r.isActive ? <><ShieldX className="size-4" /> Revoke</> : <><ShieldCheck className="size-4" /> Activate</>}
          </ActionButton>
          <ConfirmButton title="Remove authorization" description={`Remove ${r.itemId} from ${r.grower.growerName}?`} confirmLabel="Remove" action={deleteAuthorization.bind(null, r.id)} trigger={<Button variant="ghost" size="icon-sm" aria-label="Remove"><Trash2 /></Button>} />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Item authorizations" description="Control which items each grower can submit inventory for." />
      <div className="space-y-4">
        <DataTableToolbar
          searchPlaceholder="Search item id / name…"
          exportEntity="authorizations"
          filters={[
            { key: "grower", label: "Grower", options: growers.map((g) => ({ label: g.growerName, value: String(g.id) })) },
            { key: "status", label: "Status", options: [{ label: "Active", value: "active" }, { label: "Inactive", value: "inactive" }] },
          ]}
        >
          <EntityFormDialog title="Authorize item" fields={fields} action={createAuthorization} submitLabel="Authorize" trigger={<Button size="sm"><Plus className="size-4" /> Authorize item</Button>} />
        </DataTableToolbar>
        <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
      </div>
    </>
  )
}
