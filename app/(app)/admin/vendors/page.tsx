import { Pencil, Plus, Trash2 } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { vendorsWhere } from "@/lib/admin/queries"
import { parseListParams } from "@/lib/query"
import { ENTITY_STATUS, locationTypesFor } from "@/lib/constants"
import { LOCALE_OPTIONS } from "@/lib/i18n/config"
import { createVendor, updateVendor, deleteVendor } from "@/lib/actions/partners"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { ConfirmButton } from "@/components/crud/confirm-button"
import { StatusBadge } from "@/components/status-badge"

const VENDOR_TYPES = ["Manufacturer", "Pallet Pooling", "3PL", "Distributor"]
const STATUSES = [ENTITY_STATUS.ACTIVE, ENTITY_STATUS.INACTIVE]

type Row = {
  id: number
  vendorName: string
  vendorType: string | null
  countryId: number | null
  homeCountry: { name: string } | null
  // Regions are read through the vendor's locations rather than stored on the
  // vendor, so a vendor with sites in two regions shows both.
  locations: {
    locationId: number
    location: { locationName: string; region: { name: string } | null }
  }[]
  primaryContact: string | null
  contactEmail: string | null
  contactPhone: string | null
  leadTimeDays: number | null
  paymentTermsDays: number | null
  ptAccountNumber: string | null
  notes: string | null
  status: string
  preferredLocale: string
  itemVendors: { itemId: string }[]
  materialCategories: { materialCategoryCode: string }[]
  supplyCountries: { countryId: number }[]
  _count: { users: number }
}

/** The distinct regions a vendor's sites sit in, in the order the sites list. */
function regionNames(r: Row): string[] {
  return [
    ...new Set(
      r.locations.map((l) => l.location.region?.name).filter((n): n is string => !!n)
    ),
  ]
}

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_GROWERS_VENDORS)
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams)
  const where = vendorsWhere(raw)
  const [rows, total, items, categories, regions, countries, locations] = await Promise.all([
    prisma.vendor.findMany({
      where,
      include: {
        homeCountry: true,
        locations: {
          where: { isActive: true },
          select: {
            locationId: true,
            location: { select: { locationName: true, region: { select: { name: true } } } },
          },
          orderBy: { location: { locationName: "asc" } },
        },
        itemVendors: { where: { isActive: true }, select: { itemId: true } },
        materialCategories: { where: { isActive: true }, select: { materialCategoryCode: true } },
        supplyCountries: { where: { isActive: true }, select: { countryId: true } },
        _count: { select: { users: true } },
      },
      orderBy: { vendorName: "asc" },
      skip,
      take,
    }),
    prisma.vendor.count({ where }),
    prisma.item.findMany({ where: { status: ENTITY_STATUS.ACTIVE }, orderBy: { id: "asc" }, select: { id: true, itemName: true, materialCategoryCode: true } }),
    prisma.materialCategory.findMany({ orderBy: { name: "asc" } }),
    // Still needed for the Region filter, which matches a vendor if ANY of its
    // locations sits in the region. There is no Region field on the vendor form.
    prisma.region.findMany({ orderBy: { name: "asc" } }),
    // Placeholder rows (N/A) are excluded: "supplies to N/A" is not a fact
    // anyone can act on, and neither is a vendor based there.
    prisma.country.findMany({ where: { isSelectable: true }, orderBy: { name: "asc" } }),
    // Only vendor-side sites (and shared ones) can be a vendor's location.
    prisma.location.findMany({
      where: { locationType: { in: locationTypesFor("Vendor") } },
      orderBy: { locationName: "asc" },
      select: { id: true, locationName: true },
    }),
  ])

  const regionOptions = regions.map((r) => ({ label: r.name, value: String(r.id) }))
  const countryOptions = countries.map((c) => ({ label: c.name, value: String(c.id) }))
  const fields: Field[] = [
    { name: "vendorName", label: "Name", type: "text", required: true, colSpan: 2 },
    { name: "vendorType", label: "Type", type: "select", placeholder: "Select type", options: VENDOR_TYPES.map((t) => ({ label: t, value: t })) },
    { name: "status", label: "Status", type: "select", required: true, options: STATUSES.map((s) => ({ label: s, value: s })) },
    { name: "preferredLocale", label: "Email language", type: "select", required: true, options: LOCALE_OPTIONS },
    { name: "countryId", label: "Country (headquarters)", type: "select", placeholder: "Select country", options: countryOptions, description: "Where the vendor is based. Their facility's country comes from the location below and can differ." },
    {
      name: "locationIds",
      label: "Locations (this vendor operates from)",
      type: "multiselect",
      placeholder: "Select locations",
      colSpan: 2,
      options: locations.map((l) => ({ label: l.locationName, value: String(l.id) })),
      description: "Vendor-side sites only. The vendor's region(s) are read from here.",
    },
    { name: "primaryContact", label: "Primary contact", type: "text" },
    { name: "contactEmail", label: "Contact email", type: "text" },
    { name: "contactPhone", label: "Contact phone", type: "text" },
    { name: "leadTimeDays", label: "Lead time (days)", type: "number", min: "0", step: "1", placeholder: "5" },
    { name: "paymentTermsDays", label: "Payment terms (days)", type: "number", min: "0", step: "1", placeholder: "30", description: "Net N days" },
    { name: "ptAccountNumber", label: "PT account #", type: "text" },
    {
      name: "materialCategoryCodes",
      label: "Material categories (this vendor supplies)",
      type: "multiselect",
      placeholder: "Select categories",
      colSpan: 2,
      options: categories.map((c) => ({ label: `${c.code} — ${c.name}`, value: c.code })),
    },
    {
      name: "supplyCountryIds",
      label: "Supplies to (countries)",
      type: "multiselect",
      placeholder: "Select countries",
      colSpan: 2,
      options: countryOptions,
    },
    {
      name: "itemIds",
      label: "Items (this vendor can supply)",
      type: "multiselect",
      placeholder: "Select items",
      colSpan: 2,
      // Narrowed by the categories picked above: an item belongs to exactly one
      // material category, so tagging each option with its code is enough for
      // the dialog to filter. With no categories picked the full list shows.
      dependsOn: "materialCategoryCodes",
      options: items.map((i) => ({
        label: `${i.id} — ${i.itemName}`,
        value: i.id,
        parent: i.materialCategoryCode ?? undefined,
      })),
      description:
        "Filtered by the material categories above. Removing a category also removes its items from this selection.",
    },
    { name: "notes", label: "Notes", type: "textarea" },
  ]

  const columns: Column<Row>[] = [
    { key: "name", header: "Name", cell: (r) => <span className="font-medium">{r.vendorName}</span> },
    { key: "type", header: "Type", cell: (r) => r.vendorType ?? "—" },
    // Deduped: two sites in the same region should read "West", not "West, West".
    { key: "region", header: "Region", cell: (r) => regionNames(r).join(", ") || "—" },
    { key: "country", header: "Country", cell: (r) => r.homeCountry?.name ?? "—" },
    {
      key: "locations",
      header: "Locations",
      cell: (r) => r.locations.map((l) => l.location.locationName).join(", ") || "—",
    },
    { key: "supplies", header: "Supplies to", cell: (r) => r.supplyCountries.length },
    { key: "email", header: "Contact", cell: (r) => r.contactEmail ?? "—" },
    { key: "categories", header: "Categories", cell: (r) => r.materialCategories.length },
    { key: "items", header: "Items", cell: (r) => r.itemVendors.length },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog
            title="Edit vendor"
            fields={fields}
            action={updateVendor}
            values={{
              id: r.id, vendorName: r.vendorName, vendorType: r.vendorType ?? "", status: r.status, preferredLocale: r.preferredLocale,
              countryId: r.countryId ?? "", locationIds: r.locations.map((l) => l.locationId).join(","), primaryContact: r.primaryContact ?? "",
              contactEmail: r.contactEmail ?? "", contactPhone: r.contactPhone ?? "", leadTimeDays: r.leadTimeDays ?? "",
              paymentTermsDays: r.paymentTermsDays ?? "", ptAccountNumber: r.ptAccountNumber ?? "", notes: r.notes ?? "",
              itemIds: r.itemVendors.map((iv) => iv.itemId).join(","),
              materialCategoryCodes: r.materialCategories.map((mc) => mc.materialCategoryCode).join(","),
              supplyCountryIds: r.supplyCountries.map((sc) => sc.countryId).join(","),
            }}
            submitLabel="Save changes"
            trigger={<Button variant="ghost" size="icon-sm" aria-label="Edit"><Pencil /></Button>}
          />
          <ConfirmButton title="Delete vendor" description={`Delete ${r.vendorName}? If it has users or history, set status Inactive instead.`} confirmLabel="Delete" typeToConfirm action={deleteVendor.bind(null, r.id)} trigger={<Button variant="ghost" size="icon-sm" aria-label="Delete"><Trash2 /></Button>} />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Vendors" description="Suppliers and the items they provide." />
      <div className="space-y-4">
        <DataTableToolbar
          searchPlaceholder="Search vendors…"
          exportEntity="vendors"
          filters={[
            { key: "status", label: "Status", options: STATUSES.map((s) => ({ label: s, value: s })) },
            { key: "type", label: "Type", options: VENDOR_TYPES.map((t) => ({ label: t, value: t })) },
            { key: "region", label: "Region", options: regionOptions },
            { key: "country", label: "Country", options: countryOptions },
          ]}
        >
          <EntityFormDialog title="New vendor" fields={fields} action={createVendor} submitLabel="Create" trigger={<Button size="sm"><Plus className="size-4" /> Add vendor</Button>} />
        </DataTableToolbar>
        <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
      </div>
    </>
  )
}
