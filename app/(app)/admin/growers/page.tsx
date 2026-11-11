import { Pencil, Plus, Trash2 } from "lucide-react"
import { prisma } from "@/lib/db"
import { ACTIVE_ITEM } from "@/lib/items/active"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { growersWhere } from "@/lib/admin/queries"
import { parseListParams } from "@/lib/query"
import { ENTITY_STATUS } from "@/lib/constants"
import { locationTypeIdsFor } from "@/lib/location-types"
import { LOCALE_OPTIONS } from "@/lib/i18n/config"
import { getT } from "@/lib/i18n/server"
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
  preferredLocale: string
  authorizations: { itemId: string }[]
  locations: { locationId: number; location: { locationName: string } }[]
  _count: { users: number }
}

export default async function GrowersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_GROWERS_VENDORS)
  const t = await getT()
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams)
  const where = growersWhere(raw)
  const [rows, total, items, locations] = await Promise.all([
    prisma.grower.findMany({
      where,
      include: {
        authorizations: { where: { isActive: true }, select: { itemId: true } },
        locations: {
          where: { isActive: true },
          select: { locationId: true, location: { select: { locationName: true } } },
          orderBy: { location: { locationName: "asc" } },
        },
        _count: { select: { users: true } },
      },
      orderBy: { growerName: "asc" },
      skip,
      take,
    }),
    prisma.grower.count({ where }),
    prisma.item.findMany({ where: ACTIVE_ITEM, orderBy: { id: "asc" }, select: { id: true, itemName: true } }),
    // Only grower-side sites (and shared ones) can be mapped to a grower.
    prisma.location.findMany({
      where: { locationTypeId: { in: await locationTypeIdsFor("Grower") } },
      orderBy: { locationName: "asc" },
      select: { id: true, locationName: true },
    }),
  ])

  const statusOptions = STATUSES.map((s) => ({ label: t(`status.${s}`), value: s }))
  const fields: Field[] = [
    { name: "growerName", label: t("admin.common.name"), type: "text", required: true, colSpan: 2 },
    { name: "primaryEmail", label: t("admin.growers.primaryEmail"), type: "text", colSpan: 2 },
    { name: "status", label: t("admin.common.status"), type: "select", required: true, options: statusOptions },
    { name: "preferredLocale", label: t("admin.growers.emailLanguage"), type: "select", required: true, options: LOCALE_OPTIONS },
    {
      name: "locationIds",
      label: t("admin.growers.locationsLabel"),
      type: "multiselect",
      placeholder: t("admin.growers.selectLocations"),
      colSpan: 2,
      options: locations.map((l) => ({ label: l.locationName, value: String(l.id) })),
      description: t("admin.growers.locationsDescription"),
    },
    {
      name: "itemIds",
      label: t("admin.growers.itemsLabel"),
      type: "multiselect",
      placeholder: t("admin.growers.selectItems"),
      colSpan: 2,
      options: items.map((i) => ({ label: `${i.id} — ${i.itemName}`, value: i.id })),
    },
  ]

  const columns: Column<Row>[] = [
    { key: "name", header: t("admin.common.name"), cell: (r) => <span className="font-medium">{r.growerName}</span> },
    { key: "email", header: t("admin.growers.primaryEmail"), cell: (r) => r.primaryEmail ?? "—" },
    { key: "users", header: t("nav.users"), cell: (r) => r._count.users },
    { key: "items", header: t("admin.common.items"), cell: (r) => r.authorizations.length },
    {
      key: "locations",
      header: t("nav.locations"),
      cell: (r) =>
        r.locations.length === 0 ? (
          <span className="text-destructive text-xs">{t("admin.growers.noneCannotSubmit")}</span>
        ) : (
          r.locations.map((l) => l.location.locationName).join(", ")
        ),
    },
    { key: "status", header: t("admin.common.status"), cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog title={t("admin.growers.editTitle")} fields={fields} action={updateGrower} values={{ id: r.id, growerName: r.growerName, primaryEmail: r.primaryEmail ?? "", status: r.status, preferredLocale: r.preferredLocale, itemIds: r.authorizations.map((a) => a.itemId).join(","), locationIds: r.locations.map((l) => l.locationId).join(",") }} submitLabel={t("admin.common.saveChanges")} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("admin.common.edit")}><Pencil /></Button>} />
          <ConfirmButton title={t("admin.growers.deleteTitle")} description={t("admin.growers.deleteConfirm", { name: r.growerName })} confirmLabel={t("admin.common.delete")} typeToConfirm action={deleteGrower.bind(null, r.id)} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("admin.common.delete")}><Trash2 /></Button>} />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader title={t("nav.growers")} description={t("admin.growers.description")} />
      <div className="space-y-4">
        <DataTableToolbar
          searchPlaceholder={t("admin.growers.searchPlaceholder")}
          exportEntity="growers"
          filters={[{ key: "status", label: t("admin.common.status"), options: statusOptions }]}
        >
          <EntityFormDialog title={t("admin.growers.newTitle")} fields={fields} action={createGrower} submitLabel={t("admin.common.create")} trigger={<Button size="sm"><Plus className="size-4" /> {t("admin.growers.addButton")}</Button>} />
        </DataTableToolbar>
        <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
      </div>
    </>
  )
}
