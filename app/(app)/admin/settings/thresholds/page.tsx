import { Pencil, Plus, Trash2 } from "lucide-react"
import { prisma } from "@/lib/db"
import { ACTIVE_ITEM } from "@/lib/items/active"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { parseListParams } from "@/lib/query"
import { getT } from "@/lib/i18n/server"
import { createThreshold, updateThreshold, deleteThreshold } from "@/lib/actions/settings"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { ConfirmButton } from "@/components/crud/confirm-button"

type Row = {
  id: number
  itemId: string
  growerId: number | null
  thresholdQuantity: unknown
  item: { itemName: string; materialCategory: { name: string } | null }
  grower: { growerName: string } | null
}

export default async function ThresholdsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.ACCESS_SETTINGS)
  const t = await getT()
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams)

  const where = raw.q ? { OR: [{ itemId: { contains: raw.q } }, { item: { itemName: { contains: raw.q } } }] } : {}
  const [rows, total, items, growers] = await Promise.all([
    prisma.itemThreshold.findMany({ where, include: { item: { include: { materialCategory: true } }, grower: true }, orderBy: { itemId: "asc" }, skip, take }),
    prisma.itemThreshold.count({ where }),
    prisma.item.findMany({ where: ACTIVE_ITEM, orderBy: { id: "asc" }, select: { id: true, itemName: true, materialCategory: { select: { name: true } } } }),
    prisma.grower.findMany({ orderBy: { growerName: "asc" } }),
  ])

  const fields: Field[] = [
    { name: "itemId", label: t("admin.common.item"), type: "select", required: true, placeholder: t("admin.settings.thresholds.selectItem"), options: items.map((i) => ({ label: `${i.id} — ${i.itemName}`, value: i.id })), colSpan: 2 },
    { name: "growerId", label: t("admin.settings.thresholds.scope"), type: "select", placeholder: t("admin.settings.thresholds.global"), options: [{ label: t("admin.settings.thresholds.globalAllGrowers"), value: "0" }, ...growers.map((g) => ({ label: g.growerName, value: String(g.id) }))] },
    { name: "thresholdQuantity", label: t("admin.settings.thresholds.thresholdQty"), type: "number", required: true, step: "any" },
    // Read-only and derived. A quantity is counted in the item's material
    // category, so the threshold and the counts it is compared against are in
    // the same terms by construction. Never posted.
    {
      name: "categoryName",
      label: t("admin.settings.thresholds.countedIn"),
      type: "preview",
      dependsOn: "itemId",
      derive: Object.fromEntries(
        items
          .filter((i) => i.materialCategory)
          .map((i) => [i.id, i.materialCategory!.name])
      ),
      placeholder: t("admin.settings.thresholds.itemCategory"),
    },
  ]

  const columns: Column<Row>[] = [
    {
      key: "item",
      header: t("admin.common.item"),
      cell: (r) => (
        <>
          <span className="font-medium">{r.item.itemName}</span>
          <span className="text-muted-foreground ml-2 font-mono text-xs">{r.itemId}</span>
        </>
      ),
    },
    { key: "scope", header: t("admin.settings.thresholds.scope"), cell: (r) => (r.grower ? <Badge variant="secondary">{r.grower.growerName}</Badge> : <Badge variant="outline">{t("admin.settings.thresholds.global")}</Badge>) },
    { key: "qty", header: t("admin.settings.thresholds.threshold"), className: "tabular-nums", cell: (r) => `${Number(r.thresholdQuantity)} ${r.item.materialCategory?.name ?? ""}` },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog title={t("admin.settings.thresholds.editThreshold")} fields={fields} action={updateThreshold} values={{ id: r.id, itemId: r.itemId, growerId: r.growerId ? String(r.growerId) : "0", thresholdQuantity: Number(r.thresholdQuantity) }} submitLabel={t("admin.common.saveChanges")} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("admin.common.edit")}><Pencil /></Button>} />
          <ConfirmButton title={t("admin.settings.thresholds.deleteThreshold")} description={t("admin.settings.thresholds.deleteConfirm")} confirmLabel={t("admin.common.delete")} typeToConfirm action={deleteThreshold.bind(null, r.id)} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("admin.common.delete")}><Trash2 /></Button>} />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader title={t("admin.settings.thresholds.title")} description={t("admin.settings.thresholds.description")} />
      <div className="space-y-4">
        <DataTableToolbar searchPlaceholder={t("admin.settings.thresholds.searchPlaceholder")}>
          <EntityFormDialog title={t("admin.settings.thresholds.newThreshold")} fields={fields} action={createThreshold} submitLabel={t("admin.common.create")} trigger={<Button size="sm"><Plus className="size-4" /> {t("admin.settings.thresholds.addThreshold")}</Button>} />
        </DataTableToolbar>
        <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
      </div>
    </>
  )
}
