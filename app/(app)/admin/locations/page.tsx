import { Pencil, Plus, Trash2 } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { locationsWhere } from "@/lib/admin/queries"
import { selectableLocationTypes, allLocationTypes } from "@/lib/location-types"
import { parseListParams } from "@/lib/query"
import { getT } from "@/lib/i18n/server"
import { createLocation, updateLocation, deleteLocation } from "@/lib/actions/master-data"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { ConfirmButton } from "@/components/crud/confirm-button"

type Row = {
  id: number
  locationName: string
  locationTypeId: number | null
  locationType: { name: string } | null
  regionId: number | null
  region: { name: string } | null
  countryId: number | null
  country: { name: string } | null
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
  const t = await getT()
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams)
  const where = locationsWhere(raw)
  const [rows, total, regions, countries, typeOptionsRaw, allTypes] = await Promise.all([
    prisma.location.findMany({ where, include: { region: true, country: true, locationType: true }, orderBy: { locationName: "asc" }, skip, take }),
    prisma.location.count({ where }),
    prisma.region.findMany({ orderBy: { name: "asc" } }),
    // Placeholder rows (N/A) are excluded — a site is somewhere real.
    prisma.country.findMany({ where: { isSelectable: true }, orderBy: { name: "asc" } }),
    // Only active types are offered for NEW sites; the filter below lists every
    // type, so a site on a retired one can still be found.
    selectableLocationTypes(),
    allLocationTypes(),
  ])

  const regionOptions = regions.map((r) => ({ label: r.name, value: String(r.id) }))
  const countryOptions = countries.map((c) => ({ label: c.name, value: String(c.id) }))
  const typeLabel = (name: string, appliesTo: string) => {
    const side = t(`admin.locations.side.${appliesTo}`)
    return `${name} (${side.startsWith("admin.") ? appliesTo.toLowerCase() : side})`
  }
  const fields: Field[] = [
    { name: "locationName", label: t("admin.common.name"), type: "text", required: true, colSpan: 2 },
    // The type decides where the location can be attached: grower-side types
    // are not offered on the vendor form and vice versa, so the label spells
    // out which side each one serves.
    { name: "locationTypeId", label: t("admin.common.type"), type: "select", required: true, placeholder: t("admin.locations.selectType"), options: typeOptionsRaw.map((lt) => ({ label: typeLabel(lt.name, lt.appliesTo), value: String(lt.id) })), description: t("admin.locations.typeDescription") },
    { name: "regionId", label: t("admin.common.region"), type: "select", placeholder: t("admin.locations.selectRegion"), options: regionOptions },
    { name: "countryId", label: t("admin.common.country"), type: "select", placeholder: t("admin.locations.selectCountry"), options: countryOptions },
    { name: "commodityFocus", label: t("admin.locations.commodityFocus"), type: "text" },
    { name: "keyPersonnel", label: t("admin.locations.keyPersonnel"), type: "text" },
    { name: "notes", label: t("admin.common.notes"), type: "textarea" },
  ]

  const columns: Column<Row>[] = [
    { key: "name", header: t("admin.common.name"), cell: (r) => <span className="font-medium">{r.locationName}</span> },
    { key: "type", header: t("admin.common.type"), cell: (r) => r.locationType?.name ?? "—" },
    { key: "region", header: t("admin.common.region"), cell: (r) => r.region?.name ?? "—" },
    { key: "country", header: t("admin.common.country"), cell: (r) => r.country?.name ?? "—" },
    { key: "focus", header: t("admin.locations.commodityFocus"), cell: (r) => r.commodityFocus ?? "—" },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog title={t("admin.locations.editTitle")} fields={fields} action={updateLocation} values={{ id: r.id, locationName: r.locationName, locationTypeId: r.locationTypeId ? String(r.locationTypeId) : "", regionId: r.regionId ?? "", countryId: r.countryId ?? "", commodityFocus: r.commodityFocus ?? "", keyPersonnel: r.keyPersonnel ?? "", notes: r.notes ?? "" }} submitLabel={t("admin.common.saveChanges")} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("admin.common.edit")}><Pencil /></Button>} />
          <ConfirmButton title={t("admin.locations.deleteTitle")} description={t("admin.locations.deleteConfirm", { name: r.locationName })} confirmLabel={t("admin.common.delete")} typeToConfirm action={deleteLocation.bind(null, r.id)} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("admin.common.delete")}><Trash2 /></Button>} />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader title={t("nav.locations")} description={t("admin.locations.description")} />
      <div className="space-y-4">
        <DataTableToolbar
          searchPlaceholder={t("admin.locations.searchPlaceholder")}
          exportEntity="locations"
          filters={[
            { key: "type", label: t("admin.common.type"), options: allTypes.map((t) => ({ label: t.name, value: String(t.id) })) },
            { key: "region", label: t("admin.common.region"), options: regionOptions },
            { key: "country", label: t("admin.common.country"), options: countryOptions },
          ]}
        >
          <EntityFormDialog title={t("admin.locations.newTitle")} fields={fields} action={createLocation} submitLabel={t("admin.common.create")} trigger={<Button size="sm"><Plus className="size-4" /> {t("admin.locations.addButton")}</Button>} />
        </DataTableToolbar>
        <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
      </div>
    </>
  )
}
