import { Pencil, Plus, Trash2 } from "lucide-react"
import { prisma } from "@/lib/db"
import { ACTIVE_ITEM } from "@/lib/items/active"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { vendorsWhere } from "@/lib/admin/queries"
import { parseListParams } from "@/lib/query"
import { ENTITY_STATUS } from "@/lib/constants"
import { locationTypeIdsFor } from "@/lib/location-types"
import { LOCALE_OPTIONS } from "@/lib/i18n/config"
import { getT } from "@/lib/i18n/server"
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
  const t = await getT()
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
    prisma.item.findMany({ where: ACTIVE_ITEM, orderBy: { id: "asc" }, select: { id: true, itemName: true, materialCategoryCode: true } }),
    prisma.materialCategory.findMany({ orderBy: { name: "asc" } }),
    // Still needed for the Region filter, which matches a vendor if ANY of its
    // locations sits in the region. There is no Region field on the vendor form.
    prisma.region.findMany({ orderBy: { name: "asc" } }),
    // Placeholder rows (N/A) are excluded: "supplies to N/A" is not a fact
    // anyone can act on, and neither is a vendor based there.
    prisma.country.findMany({ where: { isSelectable: true }, orderBy: { name: "asc" } }),
    // Only vendor-side sites (and shared ones) can be a vendor's location.
    prisma.location.findMany({
      where: { locationTypeId: { in: await locationTypeIdsFor("Vendor") } },
      orderBy: { locationName: "asc" },
      select: { id: true, locationName: true },
    }),
  ])

  const regionOptions = regions.map((r) => ({ label: r.name, value: String(r.id) }))
  const countryOptions = countries.map((c) => ({ label: c.name, value: String(c.id) }))
  const typeLabel = (v: string) => {
    const key = `admin.vendors.types.${v.replace(/\s/g, "")}`
    const label = t(key)
    return label === key ? v : label
  }
  const typeOptions = VENDOR_TYPES.map((v) => ({ label: typeLabel(v), value: v }))
  const statusOptions = STATUSES.map((s) => ({ label: t(`status.${s}`), value: s }))
  const fields: Field[] = [
    { name: "vendorName", label: t("admin.common.name"), type: "text", required: true, colSpan: 2 },
    { name: "vendorType", label: t("admin.common.type"), type: "select", placeholder: t("admin.vendors.selectType"), options: typeOptions },
    { name: "status", label: t("admin.common.status"), type: "select", required: true, options: statusOptions },
    { name: "preferredLocale", label: t("admin.vendors.emailLanguage"), type: "select", required: true, options: LOCALE_OPTIONS },
    { name: "countryId", label: t("admin.vendors.countryHq"), type: "select", placeholder: t("admin.vendors.selectCountry"), options: countryOptions, description: t("admin.vendors.countryHqDescription") },
    {
      name: "locationIds",
      label: t("admin.vendors.locationsLabel"),
      type: "multiselect",
      placeholder: t("admin.vendors.selectLocations"),
      colSpan: 2,
      options: locations.map((l) => ({ label: l.locationName, value: String(l.id) })),
      description: t("admin.vendors.locationsDescription"),
    },
    { name: "primaryContact", label: t("admin.vendors.primaryContact"), type: "text" },
    { name: "contactEmail", label: t("admin.vendors.contactEmail"), type: "text" },
    { name: "contactPhone", label: t("admin.vendors.contactPhone"), type: "text" },
    {
      name: "leadTimeDays",
      label: t("admin.vendors.leadTime"),
      type: "number",
      min: "0",
      step: "1",
      placeholder: "5",
      description: t("admin.vendors.leadTimeDescription"),
    },
    { name: "paymentTermsDays", label: t("admin.vendors.paymentTerms"), type: "number", min: "0", step: "1", placeholder: "30", description: t("admin.vendors.paymentTermsDescription") },
    { name: "ptAccountNumber", label: t("admin.vendors.ptAccount"), type: "text" },
    {
      name: "materialCategoryCodes",
      label: t("admin.vendors.categoriesLabel"),
      type: "multiselect",
      placeholder: t("admin.vendors.selectCategories"),
      colSpan: 2,
      options: categories.map((c) => ({ label: `${c.code} — ${c.name}`, value: c.code })),
    },
    {
      name: "supplyCountryIds",
      label: t("admin.vendors.suppliesTo"),
      type: "multiselect",
      placeholder: t("admin.vendors.selectCountries"),
      colSpan: 2,
      options: countryOptions,
    },
    {
      name: "itemIds",
      label: t("admin.vendors.itemsLabel"),
      type: "multiselect",
      placeholder: t("admin.vendors.selectItems"),
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
      description: t("admin.vendors.itemsDescription"),
    },
    { name: "notes", label: t("admin.common.notes"), type: "textarea" },
  ]

  const columns: Column<Row>[] = [
    { key: "name", header: t("admin.common.name"), cell: (r) => <span className="font-medium">{r.vendorName}</span> },
    { key: "type", header: t("admin.common.type"), cell: (r) => (r.vendorType ? typeLabel(r.vendorType) : "—") },
    // Deduped: two sites in the same region should read "West", not "West, West".
    { key: "region", header: t("admin.common.region"), cell: (r) => regionNames(r).join(", ") || "—" },
    { key: "country", header: t("admin.common.country"), cell: (r) => r.homeCountry?.name ?? "—" },
    {
      key: "locations",
      header: t("nav.locations"),
      cell: (r) => r.locations.map((l) => l.location.locationName).join(", ") || "—",
    },
    { key: "supplies", header: t("admin.vendors.suppliesToCol"), cell: (r) => r.supplyCountries.length },
    { key: "email", header: t("admin.vendors.contact"), cell: (r) => r.contactEmail ?? "—" },
    { key: "categories", header: t("nav.categories"), cell: (r) => r.materialCategories.length },
    { key: "items", header: t("admin.common.items"), cell: (r) => r.itemVendors.length },
    { key: "status", header: t("admin.common.status"), cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog
            title={t("admin.vendors.editTitle")}
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
            submitLabel={t("admin.common.saveChanges")}
            trigger={<Button variant="ghost" size="icon-sm" aria-label={t("admin.common.edit")}><Pencil /></Button>}
          />
          <ConfirmButton title={t("admin.vendors.deleteTitle")} description={t("admin.vendors.deleteConfirm", { name: r.vendorName })} confirmLabel={t("admin.common.delete")} typeToConfirm action={deleteVendor.bind(null, r.id)} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("admin.common.delete")}><Trash2 /></Button>} />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader title={t("nav.vendors")} description={t("admin.vendors.description")} />
      <div className="space-y-4">
        <DataTableToolbar
          searchPlaceholder={t("admin.vendors.searchPlaceholder")}
          exportEntity="vendors"
          filters={[
            { key: "status", label: t("admin.common.status"), options: statusOptions },
            { key: "type", label: t("admin.common.type"), options: typeOptions },
            { key: "region", label: t("admin.common.region"), options: regionOptions },
            { key: "country", label: t("admin.common.country"), options: countryOptions },
          ]}
        >
          <EntityFormDialog title={t("admin.vendors.newTitle")} fields={fields} action={createVendor} submitLabel={t("admin.common.create")} trigger={<Button size="sm"><Plus className="size-4" /> {t("admin.vendors.addButton")}</Button>} />
        </DataTableToolbar>
        <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
      </div>
    </>
  )
}
