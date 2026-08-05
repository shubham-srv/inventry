import { Pencil, Plus, Trash2 } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { locationsWhere } from "@/lib/admin/queries"
import { parseListParams } from "@/lib/query"
import { createLocation, updateLocation, deleteLocation } from "@/lib/actions/master-data"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { ConfirmButton } from "@/components/crud/confirm-button"

const LOCATION_TYPES = ["Packing House", "Warehouse", "Cross-dock", "Grower"]

type Row = {
  id: number
  locationName: string
  locationType: string | null
  regionId: number | null
  region: { name: string } | null
  commodityFocus: string | null
  keyPersonnel: string | null
  notes: string | null
}

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_MASTER_DATA)
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams)
  const where = locationsWhere(raw)
  const [rows, total, regions] = await Promise.all([
    prisma.location.findMany({ where, include: { region: true }, orderBy: { locationName: "asc" }, skip, take }),
    prisma.location.count({ where }),
    prisma.region.findMany({ orderBy: { name: "asc" } }),
  ])

  const regionOptions = regions.map((r) => ({ label: r.name, value: String(r.id) }))
  const fields: Field[] = [
    { name: "locationName", label: "Name", type: "text", required: true, colSpan: 2 },
    { name: "locationType", label: "Type", type: "select", placeholder: "Select type", options: LOCATION_TYPES.map((t) => ({ label: t, value: t })) },
    { name: "regionId", label: "Region", type: "select", placeholder: "Select region", options: regionOptions },
    { name: "commodityFocus", label: "Commodity focus", type: "text" },
    { name: "keyPersonnel", label: "Key personnel", type: "text" },
    { name: "notes", label: "Notes", type: "textarea" },
  ]

  const columns: Column<Row>[] = [
    { key: "name", header: "Name", cell: (r) => <span className="font-medium">{r.locationName}</span> },
    { key: "type", header: "Type", cell: (r) => r.locationType ?? "—" },
    { key: "region", header: "Region", cell: (r) => r.region?.name ?? "—" },
    { key: "focus", header: "Commodity focus", cell: (r) => r.commodityFocus ?? "—" },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog title="Edit location" fields={fields} action={updateLocation} values={{ id: r.id, locationName: r.locationName, locationType: r.locationType ?? "", regionId: r.regionId ?? "", commodityFocus: r.commodityFocus ?? "", keyPersonnel: r.keyPersonnel ?? "", notes: r.notes ?? "" }} submitLabel="Save changes" trigger={<Button variant="ghost" size="icon-sm" aria-label="Edit"><Pencil /></Button>} />
          <ConfirmButton title="Delete location" description={`Delete ${r.locationName}?`} confirmLabel="Delete" typeToConfirm action={deleteLocation.bind(null, r.id)} trigger={<Button variant="ghost" size="icon-sm" aria-label="Delete"><Trash2 /></Button>} />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Locations" description="Physical sites where inventory is held." />
      <div className="space-y-4">
        <DataTableToolbar
          searchPlaceholder="Search locations…"
          exportEntity="locations"
          filters={[
            { key: "type", label: "Type", options: LOCATION_TYPES.map((t) => ({ label: t, value: t })) },
            { key: "region", label: "Region", options: regionOptions },
          ]}
        >
          <EntityFormDialog title="New location" fields={fields} action={createLocation} submitLabel="Create" trigger={<Button size="sm"><Plus className="size-4" /> Add location</Button>} />
        </DataTableToolbar>
        <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
      </div>
    </>
  )
}
