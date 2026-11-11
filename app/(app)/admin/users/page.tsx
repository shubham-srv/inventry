import { Pencil, Plus, Trash2 } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { usersWhere } from "@/lib/admin/queries"
import { parseListParams } from "@/lib/query"
import { getT } from "@/lib/i18n/server"
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
  const t = await getT()
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams)
  const where = usersWhere(raw)
  const [rows, total, roles, growers, vendors] = await Promise.all([
    prisma.user.findMany({ where, include: { role: true, grower: true, vendor: true }, orderBy: [{ roleId: "asc" }, { firstName: "asc" }], skip, take }),
    prisma.user.count({ where }),
    prisma.role.findMany({ orderBy: { id: "asc" } }),
    prisma.grower.findMany({ orderBy: { growerName: "asc" } }),
    prisma.vendor.findMany({ orderBy: { vendorName: "asc" } }),
  ])

  const roleLabel = (name: string) => {
    const key = `common.roles.${name}`
    const label = t(key)
    return label === key ? name : label
  }
  const roleOptions = roles.map((r) => ({ label: roleLabel(r.roleName), value: String(r.id) }))
  const fields: Field[] = [
    { name: "firstName", label: t("admin.users.firstName"), type: "text", required: true },
    { name: "lastName", label: t("admin.users.lastName"), type: "text", required: true },
    { name: "email", label: t("admin.common.email"), type: "text", required: true, colSpan: 2 },
    { name: "roleId", label: t("admin.common.role"), type: "select", required: true, placeholder: t("admin.users.selectRole"), options: roleOptions },
    { name: "isActive", label: t("admin.common.active"), type: "switch" },
    { name: "growerId", label: t("admin.common.grower"), type: "select", placeholder: t("admin.users.noGrower"), options: growers.map((g) => ({ label: g.growerName, value: String(g.id) })), description: t("admin.users.growerDescription") },
    { name: "vendorId", label: t("admin.common.vendor"), type: "select", placeholder: t("admin.users.noVendor"), options: vendors.map((v) => ({ label: v.vendorName, value: String(v.id) })), description: t("admin.users.vendorDescription") },
  ]

  const columns: Column<Row>[] = [
    { key: "name", header: t("admin.common.name"), cell: (r) => <span className="font-medium">{r.firstName} {r.lastName}</span> },
    { key: "email", header: t("admin.common.email"), cell: (r) => r.email },
    { key: "role", header: t("admin.common.role"), cell: (r) => <Badge variant="secondary">{roleLabel(r.role.roleName)}</Badge> },
    { key: "mapping", header: t("admin.users.mappedTo"), cell: (r) => r.grower?.growerName ?? r.vendor?.vendorName ?? "—" },
    { key: "active", header: t("admin.common.active"), cell: (r) => <StatusBadge status={r.isActive ? "Yes" : "No"} /> },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog title={t("admin.users.editTitle")} fields={fields} action={updateUser} values={{ id: r.id, firstName: r.firstName, lastName: r.lastName, email: r.email, roleId: r.roleId, isActive: r.isActive, growerId: r.growerId ?? "", vendorId: r.vendorId ?? "" }} submitLabel={t("admin.common.saveChanges")} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("admin.common.edit")}><Pencil /></Button>} />
          <ConfirmButton title={t("admin.users.deleteTitle")} description={t("admin.users.deleteConfirm", { name: `${r.firstName} ${r.lastName}` })} confirmLabel={t("admin.common.delete")} typeToConfirm action={deleteUser.bind(null, r.id)} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("admin.common.delete")}><Trash2 /></Button>} />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader title={t("nav.users")} description={t("admin.users.description")} />
      <div className="space-y-4">
        <DataTableToolbar
          searchPlaceholder={t("admin.users.searchPlaceholder")}
          exportEntity="users"
          filters={[
            { key: "role", label: t("admin.common.role"), options: roleOptions },
            { key: "status", label: t("admin.common.status"), options: [{ label: t("admin.common.active"), value: "active" }, { label: t("admin.common.inactive"), value: "inactive" }] },
          ]}
        >
          <EntityFormDialog title={t("admin.users.newTitle")} fields={fields} action={createUser} values={{ isActive: true }} submitLabel={t("admin.users.createUser")} trigger={<Button size="sm"><Plus className="size-4" /> {t("admin.users.addButton")}</Button>} />
        </DataTableToolbar>
        <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
      </div>
    </>
  )
}
