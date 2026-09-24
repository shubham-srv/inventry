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

  const fields: Field[] = [
    { name: "name", label: "Name", type: "text", required: true, colSpan: 2 },
    {
      name: "appliesTo",
      label: "Used by",
      type: "select",
      required: true,
      options: [
        { label: "Growers only", value: "Grower" },
        { label: "Vendors only", value: "Vendor" },
        { label: "Growers or vendors", value: "Both" },
      ],
      description:
        "Decides which side can attach a site of this type. Changing it can remove sites from a picker they currently appear in.",
    },
    {
      name: "sortOrder",
      label: "Order",
      type: "number",
      min: "0",
      description: "Position in the dropdown. Lower comes first.",
    },
    {
      name: "isActive",
      label: "Active",
      type: "switch",
      colSpan: 2,
      description:
        "Inactive types are hidden when creating a site, but sites already using them keep working.",
    },
  ]

  const columns: Column<Row>[] = [
    { key: "name", header: "Name", cell: (r) => <span className="font-medium">{r.name}</span> },
    {
      key: "appliesTo",
      header: "Used by",
      cell: (r) => LABELS[r.appliesTo] ?? r.appliesTo,
    },
    {
      key: "locations",
      header: "Sites",
      cell: (r) => (
        <span className={r._count.locations ? "" : "text-muted-foreground"}>
          {r._count.locations}
        </span>
      ),
    },
    {
      key: "isActive",
      header: "Status",
      cell: (r) =>
        r.isActive ? (
          <Badge variant="outline">Active</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Inactive
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
            title="Edit location type"
            fields={fields}
            action={updateLocationType}
            values={{
              id: r.id,
              name: r.name,
              appliesTo: r.appliesTo,
              sortOrder: r.sortOrder,
              isActive: r.isActive,
            }}
            submitLabel="Save changes"
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="Edit">
                <Pencil />
              </Button>
            }
          />
          <ConfirmButton
            action={deleteLocationType.bind(null, r.id)}
            title="Delete location type"
            description={
              r._count.locations > 0
                ? `${r._count.locations} site(s) use this type, so it cannot be deleted. Deactivate it instead.`
                : `Delete "${r.name}"? No sites are using it.`
            }
            confirmLabel="Delete"
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
        title="Location types"
        description="The kinds of site a location can be. Each type decides whether growers, vendors or both can use it."
      >
        <EntityFormDialog
          title="New location type"
          fields={fields}
          action={createLocationType}
          trigger={
            <Button>
              <Plus /> New type
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

const LABELS: Record<string, string> = {
  Grower: "Growers only",
  Vendor: "Vendors only",
  Both: "Growers or vendors",
}
