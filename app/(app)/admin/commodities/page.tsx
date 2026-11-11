import { Pencil, Plus, Power, PowerOff, Trash2 } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { commoditiesWhere } from "@/lib/admin/queries"
import { parseListParams } from "@/lib/query"
import {
  createCommodity,
  updateCommodity,
  deleteCommodity,
  setCommodityActive,
} from "@/lib/actions/master-data"
import { StatusBadge } from "@/components/status-badge"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import {
  EntityFormDialog,
  type Field,
} from "@/components/crud/entity-form-dialog"
import { ConfirmButton } from "@/components/crud/confirm-button"
import { CommodityItemsDialog } from "@/components/commodities/commodity-items-dialog"
import { TranslationBadge } from "@/components/translation-badge"
import { getT } from "@/lib/i18n/server"

type Row = {
  code: string
  name: string
  isActive: boolean
  _count: { items: number }
  translations: { name: string; isMachine: boolean }[]
}

export default async function CommoditiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_MASTER_DATA)
  const t = await getT()
  const { page, pageSize, skip, take, raw } = parseListParams(
    await searchParams
  )
  const where = commoditiesWhere(raw)
  const [rows, total] = await Promise.all([
    prisma.commodity.findMany({
      where,
      include: {
        _count: { select: { items: true } },
        translations: { where: { locale: "es" }, select: { name: true, isMachine: true } },
      },
      orderBy: { code: "asc" },
      skip,
      take,
    }),
    prisma.commodity.count({ where }),
  ])

  const fields: Field[] = [
    {
      name: "code",
      label: t("admin.common.code"),
      type: "text",
      required: true,
      placeholder: "AP",
      lockOnEdit: true,
      description: t("admin.commodities.codeHelp"),
    },
    { name: "name", label: t("admin.common.name"), type: "text", required: true, colSpan: 2 },
    {
      name: "nameEs",
      label: t("admin.commodities.spanishName"),
      type: "text",
      translationOf: "name",
      colSpan: 2,
      description: t("admin.commodities.spanishNameHelp"),
    },
  ]

  const columns: Column<Row>[] = [
    {
      key: "code",
      header: t("admin.common.code"),
      className: "font-mono text-xs",
      cell: (r) => r.code,
    },
    {
      key: "name",
      header: t("admin.common.name"),
      cell: (r) => (
        <div className="space-y-1">
          <span className="font-medium">{r.name}</span>
          <div>
            <TranslationBadge translation={r.translations[0]} />
          </div>
        </div>
      ),
    },
    {
      key: "items",
      header: t("admin.common.items"),
      cell: (r) => (
        <CommodityItemsDialog code={r.code} name={r.name} count={r._count.items} isActive={r.isActive} />
      ),
    },
    {
      key: "status",
      header: t("admin.common.status"),
      cell: (r) => <StatusBadge status={r.isActive ? "Active" : "Inactive"} />,
    },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <ConfirmButton
            title={t(r.isActive ? "admin.commodities.disableTitle" : "admin.commodities.enableTitle", { code: r.code })}
            description={t(
              r.isActive ? "admin.commodities.disableDescription" : "admin.commodities.enableDescription",
              { count: r._count.items }
            )}
            confirmLabel={t(r.isActive ? "admin.commodities.disable" : "admin.commodities.enable")}
            variant={r.isActive ? "destructive" : "default"}
            typeToConfirm={r.isActive}
            confirmWord="disable"
            action={setCommodityActive.bind(null, r.code, !r.isActive)}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={t(r.isActive ? "admin.commodities.disable" : "admin.commodities.enable")}>
                {r.isActive ? <PowerOff /> : <Power />}
              </Button>
            }
          />
          <EntityFormDialog
            title={t("admin.commodities.editCommodity")}
            fields={fields}
            action={updateCommodity}
            values={{ code: r.code, name: r.name, nameEs: r.translations[0]?.name ?? "" }}
            submitLabel={t("admin.common.saveChanges")}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={t("admin.common.edit")}>
                <Pencil />
              </Button>
            }
          />
          <ConfirmButton
            title={t("admin.commodities.deleteCommodity")}
            description={t("admin.commodities.deleteDescription", { code: r.code })}
            confirmLabel={t("admin.common.delete")} typeToConfirm
            action={deleteCommodity.bind(null, r.code)}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={t("admin.common.delete")}>
                <Trash2 />
              </Button>
            }
          />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title={t("nav.commodities")}
        description={t("admin.commodities.description")}
      />
      <div className="space-y-4">
        <DataTableToolbar
          searchPlaceholder={t("admin.commodities.searchPlaceholder")}
          exportEntity="commodities"
          filters={[
            {
              key: "status",
              label: t("admin.common.status"),
              options: [
                { label: t("status.Active"), value: "active" },
                { label: t("admin.commodities.disabled"), value: "inactive" },
              ],
            },
          ]}
        >
          <EntityFormDialog
            title={t("admin.commodities.newCommodity")}
            fields={fields}
            action={createCommodity}
            submitLabel={t("admin.common.create")}
            trigger={
              <Button size="sm">
                <Plus className="size-4" /> {t("admin.commodities.addCommodity")}
              </Button>
            }
          />
        </DataTableToolbar>

        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.code}
          page={page}
          pageCount={Math.ceil(total / pageSize)}
          total={total}
          searchParams={raw}
        />
      </div>
    </>
  )
}
