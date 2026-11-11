import { Pencil, Plus, Trash2 } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import {
  createLocationType,
  updateLocationType,
  deleteLocationType,
} from "@/lib/actions/location-types"
import { parseListParams } from "@/lib/query"
import { getT } from "@/lib/i18n/server"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { ConfirmButton } from "@/components/crud/confirm-button"

type Row = {
  id: number
  name: string
  appliesTo: string
  isActive: boolean
  sortOrder: number
  _count: { locations: number }
}

/**
 * Kinds of physical site. Small screen, long reach: `appliesTo` is what decides
 * whether a site can be attached to growers, vendors or either, so getting it
 * wrong quietly removes sites from one side's picker.
 */
export default async function LocationTypesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_MASTER_DATA)
  const t = await getT()
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams)

  const [rows, total] = await Promise.all([
    prisma.locationType.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { locations: true } } },
      skip,
      take,
    }),
    prisma.locationType.count(),
  ])

  const labels: Record<string, string> = {
    Grower: t("admin.locationTypes.appliesTo.Grower"),
    Vendor: t("admin.locationTypes.appliesTo.Vendor"),
    Both: t("admin.locationTypes.appliesTo.Both"),
  }
  const fields: Field[] = [
    { name: "name", label: t("admin.common.name"), type: "text", required: true, colSpan: 2 },
    {
      name: "appliesTo",
      label: t("admin.locationTypes.usedBy"),
      type: "select",
      required: true,
      options: [
        { label: labels.Grower, value: "Grower" },
        { label: labels.Vendor, value: "Vendor" },
        { label: labels.Both, value: "Both" },
      ],
      description: t("admin.locationTypes.usedByDescription"),
    },
    {
      name: "sortOrder",
      label: t("admin.locationTypes.order"),
      type: "number",
      min: "0",
      description: t("admin.locationTypes.orderDescription"),
    },
    {
      name: "isActive",
      label: t("admin.common.active"),
      type: "switch",
      colSpan: 2,
      description: t("admin.locationTypes.activeDescription"),
    },
  ]

  const columns: Column<Row>[] = [
    { key: "name", header: t("admin.common.name"), cell: (r) => <span className="font-medium">{r.name}</span> },
    {
      key: "appliesTo",
      header: t("admin.locationTypes.usedBy"),
      cell: (r) => labels[r.appliesTo] ?? r.appliesTo,
    },
    {
      key: "locations",
      header: t("admin.locationTypes.sites"),
      cell: (r) => (
        <span className={r._count.locations ? "" : "text-muted-foreground"}>
          {r._count.locations}
        </span>
      ),
    },
    {
      key: "isActive",
      header: t("admin.common.status"),
      cell: (r) =>
        r.isActive ? (
          <Badge variant="outline">{t("admin.common.active")}</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            {t("admin.common.inactive")}
          </Badge>
        ),
    },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog
            title={t("admin.locationTypes.editTitle")}
            fields={fields}
            action={updateLocationType}
            values={{
              id: r.id,
              name: r.name,
              appliesTo: r.appliesTo,
              sortOrder: r.sortOrder,
              isActive: r.isActive,
            }}
            submitLabel={t("admin.common.saveChanges")}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={t("admin.common.edit")}>
                <Pencil />
              </Button>
            }
          />
          <ConfirmButton
            action={deleteLocationType.bind(null, r.id)}
            title={t("admin.locationTypes.deleteTitle")}
            description={
              r._count.locations > 0
                ? t("admin.locationTypes.deleteInUse", { count: r._count.locations })
                : t("admin.locationTypes.deleteConfirm", { name: r.name })
            }
            confirmLabel={t("admin.common.delete")}
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
        title={t("nav.locationTypes")}
        description={t("admin.locationTypes.description")}
      >
        <EntityFormDialog
          title={t("admin.locationTypes.newTitle")}
          fields={fields}
          action={createLocationType}
          trigger={
            <Button>
              <Plus /> {t("admin.locationTypes.newButton")}
            </Button>
          }
        />
      </PageHeader>
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        page={page}
        pageCount={Math.ceil(total / pageSize)}
        total={total}
        searchParams={raw}
      />
    </>
  )
}
