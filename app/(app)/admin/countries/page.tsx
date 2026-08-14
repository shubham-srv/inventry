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

const fields: Field[] = [
  {
    name: "name",
    label: "Country",
    type: "text",
    required: true,
    placeholder: "Mexico",
    colSpan: 2,
    description:
      "Used by an item's country of origin, a location's country, a vendor's home country, and vendor supply-to lists.",
  },
  {
    name: "isSelectable",
    label: "Selectable as a real country",
    type: "select",
    options: [
      { value: "true", label: "Yes" },
      { value: "false", label: "No — origin dropdown only" },
    ],
    colSpan: 2,
    description:
      "Turn off for placeholder rows like N/A. They stay available as an item's country of origin but are hidden from location, vendor and supply-to pickers.",
  },
]

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

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Country",
      cell: (r) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">{r.name}</span>
          {!r.isSelectable && (
            <span className="text-muted-foreground text-xs">
              origin only
            </span>
          )}
        </span>
      ),
    },
    { key: "items", header: "Items", cell: (r) => r._count.items },
    { key: "locations", header: "Locations", cell: (r) => r._count.locations },
    {
      key: "supplied",
      header: "Vendor supply lists",
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
            title="Edit country"
            fields={fields}
            action={updateCountry}
            values={{
              id: r.id,
              name: r.name,
              isSelectable: String(r.isSelectable),
            }}
            submitLabel="Save changes"
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="Edit">
                <Pencil />
              </Button>
            }
          />
          <ConfirmButton
            title="Delete country"
            description={
              r._count.items + r._count.locations + r._count.suppliedBy > 0
                ? `${r.name} is in use (${r._count.items} item(s), ${r._count.locations} location(s), ${r._count.suppliedBy} vendor supply list(s)) and cannot be deleted until those are changed.`
                : `Delete ${r.name}?`
            }
            confirmLabel="Delete"
            typeToConfirm
            action={deleteCountry.bind(null, r.id)}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="Delete">
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
        title="Countries"
        description="Shared lookup behind an item's country of origin, a location's country, a vendor's home country, and vendor supply-to lists."
      />
      <div className="space-y-4">
        <DataTableToolbar
          searchPlaceholder="Search countries…"
          exportEntity="countries"
        >
          <EntityFormDialog
            title="New country"
            fields={fields}
            action={createCountry}
            submitLabel="Create"
            trigger={
              <Button size="sm">
                <Plus className="size-4" /> Add country
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
          emptyMessage="No countries match your search."
        />
      </div>
    </>
  )
}
