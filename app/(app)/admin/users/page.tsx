import { Pencil, Plus, Trash2 } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { usersWhere } from "@/lib/admin/queries"
import { parseListParams } from "@/lib/query"
import { createUser, updateUser, deleteUser } from "@/lib/actions/users"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { ConfirmButton } from "@/components/crud/confirm-button"
import { StatusBadge } from "@/components/status-badge"

type Row = {
  id: number
  firstName: string
  lastName: string
  email: string
  roleId: number
  growerId: number | null
  vendorId: number | null
  isActive: boolean
  role: { roleName: string }
  grower: { growerName: string } | null
  vendor: { vendorName: string } | null
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_USERS)
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams)
  const where = usersWhere(raw)
  const [rows, total, roles, growers, vendors] = await Promise.all([
    prisma.user.findMany({ where, include: { role: true, grower: true, vendor: true }, orderBy: [{ roleId: "asc" }, { firstName: "asc" }], skip, take }),
    prisma.user.count({ where }),
    prisma.role.findMany({ orderBy: { id: "asc" } }),
    prisma.grower.findMany({ orderBy: { growerName: "asc" } }),
    prisma.vendor.findMany({ orderBy: { vendorName: "asc" } }),
  ])

  const fields: Field[] = [
    { name: "firstName", label: "First name", type: "text", required: true },
    { name: "lastName", label: "Last name", type: "text", required: true },
    { name: "email", label: "Email", type: "text", required: true, colSpan: 2 },
    { name: "roleId", label: "Role", type: "select", required: true, placeholder: "Select role", options: roles.map((r) => ({ label: r.roleName, value: String(r.id) })) },
    { name: "isActive", label: "Active", type: "switch" },
    { name: "growerId", label: "Grower (grower users only)", type: "select", placeholder: "Select grower", options: growers.map((g) => ({ label: g.growerName, value: String(g.id) })), description: "Applies only when role is GrowerUser" },
    { name: "vendorId", label: "Vendor (vendor users only)", type: "select", placeholder: "Select vendor", options: vendors.map((v) => ({ label: v.vendorName, value: String(v.id) })), description: "Applies only when role is VendorUser" },
  ]

  const columns: Column<Row>[] = [
    { key: "name", header: "Name", cell: (r) => <span className="font-medium">{r.firstName} {r.lastName}</span> },
    { key: "email", header: "Email", cell: (r) => r.email },
    { key: "role", header: "Role", cell: (r) => <Badge variant="secondary">{r.role.roleName}</Badge> },
    { key: "mapping", header: "Mapped to", cell: (r) => r.grower?.growerName ?? r.vendor?.vendorName ?? "—" },
    { key: "active", header: "Active", cell: (r) => <StatusBadge status={r.isActive ? "Yes" : "No"} /> },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog title="Edit user" fields={fields} action={updateUser} values={{ id: r.id, firstName: r.firstName, lastName: r.lastName, email: r.email, roleId: r.roleId, isActive: r.isActive, growerId: r.growerId ?? "", vendorId: r.vendorId ?? "" }} submitLabel="Save changes" trigger={<Button variant="ghost" size="icon-sm" aria-label="Edit"><Pencil /></Button>} />
          <ConfirmButton title="Delete user" description={`Delete ${r.firstName} ${r.lastName}? If they have submission history, set Active off instead.`} confirmLabel="Delete" typeToConfirm action={deleteUser.bind(null, r.id)} trigger={<Button variant="ghost" size="icon-sm" aria-label="Delete"><Trash2 /></Button>} />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Users" description="Onboard internal users and map external users to a grower or vendor." />
      <div className="space-y-4">
        <DataTableToolbar
          searchPlaceholder="Search users…"
          exportEntity="users"
          filters={[
            { key: "role", label: "Role", options: roles.map((r) => ({ label: r.roleName, value: String(r.id) })) },
            { key: "status", label: "Status", options: [{ label: "Active", value: "active" }, { label: "Inactive", value: "inactive" }] },
          ]}
        >
          <EntityFormDialog title="New user" fields={fields} action={createUser} submitLabel="Create user" trigger={<Button size="sm"><Plus className="size-4" /> Add user</Button>} />
        </DataTableToolbar>
        <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
      </div>
    </>
  )
}
