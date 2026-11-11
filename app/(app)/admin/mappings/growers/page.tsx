import { Plus, Trash2, ShieldX, ShieldCheck } from "lucide-react"
import { prisma } from "@/lib/db"
import { ACTIVE_ITEM } from "@/lib/items/active"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { authorizationsWhere } from "@/lib/admin/queries"
import { parseListParams } from "@/lib/query"
import { getT } from "@/lib/i18n/server"
import {
  setGrowerAuthorizations,
  setAuthorizationActive,
  deleteAuthorization,
} from "@/lib/actions/authorizations"
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

export default async function GrowerAuthorizationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_GROWERS_VENDORS)
  const t = await getT()
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams, { pageSize: 15 })
  const where = authorizationsWhere(raw)
  const [rows, total, growers, items, allAuths] = await Promise.all([
    prisma.growerItemAuthorization.findMany({ where, include: { grower: true, item: true }, orderBy: [{ growerId: "asc" }, { itemId: "asc" }], skip, take }),
    prisma.growerItemAuthorization.count({ where }),
    prisma.grower.findMany({ orderBy: { growerName: "asc" } }),
    prisma.item.findMany({ where: ACTIVE_ITEM, orderBy: { id: "asc" } }),
    // Every ACTIVE authorization, not just the current page's rows — the dialog
    // pre-ticks a grower's whole set, so a paged subset would silently drop the
    // ones that happen to be on another page and then deactivate them on save.
    // Deliberately unbounded: this is growers x their items. It is the first
    // thing to move behind an on-change server lookup if that grows large.
    prisma.growerItemAuthorization.findMany({
      where: { isActive: true },
      select: { growerId: true, itemId: true },
      orderBy: { itemId: "asc" },
    }),
  ])

  // growerId -> the items it is currently authorized for.
  const mappedByGrower: Record<string, string[]> = {}
  for (const a of allAuths) (mappedByGrower[String(a.growerId)] ??= []).push(a.itemId)

  const fields: Field[] = [
    { name: "growerId", label: t("admin.common.grower"), type: "select", required: true, placeholder: t("admin.mappings.selectGrower"), options: growers.map((g) => ({ label: g.growerName, value: String(g.id) })), colSpan: 2 },
    {
      name: "itemIds",
      label: t("admin.common.items"),
      type: "multiselect",
      placeholder: t("admin.mappings.selectItems"),
      // Picking a grower ticks what it already has, so this dialog edits the
      // whole set. Options are NOT filtered by grower — the point is to see
      // everything and add to it — hence `presetFrom` without tagged parents.
      dependsOn: "growerId",
      presetFrom: mappedByGrower,
      options: items.map((i) => ({ label: `${i.id} — ${i.itemName}`, value: i.id })),
      colSpan: 2,
      description: t("admin.mappings.growerItemsDescription"),
    },
  ]

  const columns: Column<Row>[] = [
    { key: "grower", header: t("admin.common.grower"), cell: (r) => <span className="font-medium">{r.grower.growerName}</span> },
    { key: "itemId", header: t("admin.mappings.itemId"), className: "font-mono text-xs", cell: (r) => r.itemId },
    { key: "itemName", header: t("admin.common.item"), cell: (r) => r.item.itemName },
    { key: "active", header: t("admin.common.status"), cell: (r) => <StatusBadge status={r.isActive ? "Active" : "Inactive"} /> },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <ActionButton action={setAuthorizationActive.bind(null, r.id, !r.isActive)}>
            {r.isActive ? <><ShieldX className="size-4" /> {t("admin.mappings.deactivate")}</> : <><ShieldCheck className="size-4" /> {t("admin.mappings.activate")}</>}
          </ActionButton>
          <ConfirmButton title={t("admin.mappings.removeAuthorization")} description={t("admin.mappings.removeAuthorizationConfirm", { item: r.itemId, name: r.grower.growerName })} confirmLabel={t("admin.mappings.remove")} typeToConfirm action={deleteAuthorization.bind(null, r.id)} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("admin.mappings.remove")}><Trash2 /></Button>} />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <DataTableToolbar
        searchPlaceholder={t("admin.mappings.searchItem")}
        exportEntity="authorizations"
        filters={[
          { key: "grower", label: t("admin.common.grower"), options: growers.map((g) => ({ label: g.growerName, value: String(g.id) })) },
          { key: "status", label: t("admin.common.status"), options: [{ label: t("admin.common.active"), value: "active" }, { label: t("admin.common.inactive"), value: "inactive" }] },
        ]}
      >
        <EntityFormDialog title={t("admin.mappings.growerDialogTitle")} description={t("admin.mappings.growerDialogDescription")} fields={fields} action={setGrowerAuthorizations} submitLabel={t("admin.mappings.saveAuthorizations")} trigger={<Button size="sm"><Plus className="size-4" /> {t("admin.mappings.authorizeItems")}</Button>} />
      </DataTableToolbar>
      <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
    </div>
  )
}
