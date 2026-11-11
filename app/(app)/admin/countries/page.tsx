import { Pencil, Plus, Trash2 } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { countriesWhere } from "@/lib/admin/queries"
import { parseListParams } from "@/lib/query"
import {
  createCountry,
  updateCountry,
  deleteCountry,
} from "@/lib/actions/master-data"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import {
  EntityFormDialog,
  type Field,
} from "@/components/crud/entity-form-dialog"
import { ConfirmButton } from "@/components/crud/confirm-button"
import { getT } from "@/lib/i18n/server"

type Row = {
  id: number
  name: string
  isSelectable: boolean
  _count: { items: number; locations: number; suppliedBy: number }
}

export default async function CountriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_MASTER_DATA)
  const t = await getT()
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams)
  const where = countriesWhere(raw)
  const [rows, total] = await Promise.all([
    prisma.country.findMany({
      where,
      include: {
        _count: { select: { items: true, locations: true, suppliedBy: true } },
      },
      orderBy: { name: "asc" },
      skip,
      take,
    }),
    prisma.country.count({ where }),
  ])

  const fields: Field[] = [
    {
      name: "name",
      label: t("admin.common.country"),
      type: "text",
      required: true,
      placeholder: "Mexico",
      colSpan: 2,
      description: t("admin.countries.nameHelp"),
    },
    {
      name: "isSelectable",
      label: t("admin.countries.selectable"),
      type: "select",
      options: [
        { value: "true", label: t("common.yes") },
        { value: "false", label: t("admin.countries.notSelectable") },
      ],
      colSpan: 2,
      description: t("admin.countries.selectableHelp"),
    },
  ]

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: t("admin.common.country"),
      cell: (r) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">{r.name}</span>
          {!r.isSelectable && (
            <span className="text-muted-foreground text-xs">
              {t("admin.countries.originOnly")}
            </span>
          )}
        </span>
      ),
    },
    { key: "items", header: t("admin.common.items"), cell: (r) => r._count.items },
    { key: "locations", header: t("nav.locations"), cell: (r) => r._count.locations },
    {
      key: "supplied",
      header: t("admin.countries.supplyLists"),
      cell: (r) => r._count.suppliedBy,
    },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog
            title={t("admin.countries.editCountry")}
            fields={fields}
            action={updateCountry}
            values={{
              id: r.id,
              name: r.name,
              isSelectable: String(r.isSelectable),
            }}
            submitLabel={t("admin.common.saveChanges")}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={t("admin.common.edit")}>
                <Pencil />
              </Button>
            }
          />
          <ConfirmButton
            title={t("admin.countries.deleteCountry")}
            description={
              r._count.items + r._count.locations + r._count.suppliedBy > 0
                ? t("admin.countries.inUse", {
                    name: r.name,
                    items: r._count.items,
                    locations: r._count.locations,
                    lists: r._count.suppliedBy,
                  })
                : t("admin.countries.deleteDescription", { name: r.name })
            }
            confirmLabel={t("admin.common.delete")}
            typeToConfirm
            action={deleteCountry.bind(null, r.id)}
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
        title={t("admin.countries.title")}
        description={t("admin.countries.description")}
      />
      <div className="space-y-4">
        <DataTableToolbar
          searchPlaceholder={t("admin.countries.searchPlaceholder")}
          exportEntity="countries"
        >
          <EntityFormDialog
            title={t("admin.countries.newCountry")}
            fields={fields}
            action={createCountry}
            submitLabel={t("admin.common.create")}
            trigger={
              <Button size="sm">
                <Plus className="size-4" /> {t("admin.countries.addCountry")}
              </Button>
            }
          />
        </DataTableToolbar>

        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          page={page}
          pageCount={Math.ceil(total / pageSize)}
          total={total}
          searchParams={raw}
          emptyMessage={t("admin.countries.empty")}
        />
      </div>
    </>
  )
}
