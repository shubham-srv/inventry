import { Pencil, Plus, Trash2 } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { itemsWhere } from "@/lib/admin/queries"
import { parseListParams } from "@/lib/query"
import { ENTITY_STATUS, APPLICATION_METHODS, UNITS_OF_MEASURE } from "@/lib/constants"
import { createItem, updateItem, deleteItem } from "@/lib/actions/items"
import { peekNextSequence, padSequence } from "@/lib/items/item-id"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { ConfirmButton } from "@/components/crud/confirm-button"
import { StatusBadge } from "@/components/status-badge"

type ItemRow = Awaited<ReturnType<typeof getItems>>["rows"][number]

async function getItems(where: ReturnType<typeof itemsWhere>, skip: number, take: number) {
  const [rows, total] = await Promise.all([
    prisma.item.findMany({
      where,
      include: {
        commodity: true,
        materialCategory: true,
        subCategory: true,
        countryOfOrigin: true,
        region: true,
        authorizations: { where: { isActive: true }, select: { growerId: true } },
        itemVendors: { where: { isActive: true }, select: { vendorId: true } },
      },
      orderBy: { id: "asc" },
      skip,
      take,
    }),
    prisma.item.count({ where }),
  ])
  return { rows, total }
}

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_MASTER_DATA)
  const sp = await searchParams
  const { page, pageSize, skip, take, raw } = parseListParams(sp)
  const where = itemsWhere(raw)

  const [{ rows, total }, nextSequence, commodities, categories, subCategories, countries, regions, growers, vendors] =
    await Promise.all([
      getItems(where, skip, take),
      peekNextSequence(prisma),
      prisma.commodity.findMany({ orderBy: { name: "asc" } }),
      prisma.materialCategory.findMany({ orderBy: { name: "asc" } }),
      prisma.subCategory.findMany({
        include: { materialCategory: true },
        orderBy: { name: "asc" },
      }),
      prisma.country.findMany({ orderBy: { name: "asc" } }),
      prisma.region.findMany({ orderBy: { name: "asc" } }),
      prisma.grower.findMany({ where: { status: "Active" }, orderBy: { growerName: "asc" } }),
      prisma.vendor.findMany({ where: { status: "Active" }, orderBy: { vendorName: "asc" } }),
    ])
  const pageCount = Math.ceil(total / pageSize)

  // Shared by the create and edit dialogs. The item ID is NOT here: it is
  // generated from commodity + category on create (see lib/items/item-id.ts)
  // and immutable afterwards, so only the edit dialog shows it (read-only).
  const fields: Field[] = [
    { name: "itemName", label: "Name", type: "text", required: true, colSpan: 2 },
    {
      name: "commodityCode",
      label: "Commodity",
      type: "select",
      required: true,
      placeholder: "Select commodity",
      options: commodities.map((c) => ({ label: `${c.code} — ${c.name}`, value: c.code })),
    },
    {
      name: "materialCategoryCode",
      label: "Category",
      type: "select",
      required: true,
      placeholder: "Select category",
      options: categories.map((c) => ({ label: `${c.code} — ${c.name}`, value: c.code })),
    },
    {
      name: "subCategoryId",
      label: "Sub-category",
      type: "select",
      required: true,
      placeholder: "Select category first",
      dependsOn: "materialCategoryCode",
      options: subCategories.map((s) => ({
        label: s.name,
        value: String(s.id),
        parent: s.materialCategoryCode,
      })),
    },
    {
      name: "countryOfOriginId",
      label: "Country of origin",
      type: "select",
      required: true,
      placeholder: "Select country",
      options: countries.map((c) => ({ label: c.name, value: String(c.id) })),
    },
    {
      name: "regionId",
      label: "Region",
      type: "select",
      required: true,
      placeholder: "Select region",
      options: regions.map((r) => ({ label: r.name, value: String(r.id) })),
    },
    {
      name: "unitOfMeasure",
      label: "Unit of measure",
      type: "select",
      required: true,
      placeholder: "Select unit",
      description: "Used for every count and order of this item.",
      options: UNITS_OF_MEASURE.map((u) => ({ label: u, value: u })),
    },
    {
      name: "applicationMethod",
      label: "Application",
      type: "select",
      placeholder: "Method",
      options: APPLICATION_METHODS.map((m) => ({ label: m, value: m })),
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      required: true,
      options: [ENTITY_STATUS.ACTIVE, ENTITY_STATUS.INACTIVE, ENTITY_STATUS.REVIEW].map((s) => ({ label: s, value: s })),
    },
    {
      name: "growerIds",
      label: "Growers (who use this item)",
      type: "multiselect",
      placeholder: "Select growers",
      colSpan: 2,
      options: growers.map((g) => ({ label: g.growerName, value: String(g.id) })),
    },
    {
      name: "vendorIds",
      label: "Vendors (source this item from)",
      type: "multiselect",
      placeholder: "Select vendors",
      colSpan: 2,
      options: vendors.map((v) => ({ label: v.vendorName, value: String(v.id) })),
    },
    { name: "notes", label: "Notes", type: "textarea" },
  ]

  // Create previews the ID it will get; edit shows the real one (read-only) so
  // it is posted back as the PK.
  const createFields: Field[] = [
    {
      name: "idPreview",
      label: "Item ID",
      type: "preview",
      colSpan: 2,
      pattern: `{commodityCode}-{materialCategoryCode}-${padSequence(nextSequence)}`,
      placeholder: "Pick a commodity and a category to see the ID",
      description: "Generated on save — the number is the next one available.",
    },
    ...fields,
  ]
  const editFields: Field[] = [
    { name: "id", label: "Item ID", type: "text", lockOnEdit: true, colSpan: 2 },
    ...fields,
  ]

  const columns: Column<ItemRow>[] = [
    { key: "id", header: "Item ID", className: "font-mono text-xs", cell: (r) => r.id },
    { key: "itemName", header: "Name", cell: (r) => <span className="font-medium">{r.itemName}</span> },
    { key: "commodity", header: "Commodity", cell: (r) => r.commodity?.name ?? "—" },
    { key: "category", header: "Category", cell: (r) => r.materialCategory?.name ?? "—" },
    { key: "coo", header: "Origin", cell: (r) => r.countryOfOrigin?.name ?? "—" },
    { key: "region", header: "Region", cell: (r) => r.region?.name ?? "—" },
    { key: "uom", header: "Unit", cell: (r) => r.unitOfMeasure ?? "—" },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog
            title="Edit item"
            description={r.id}
            fields={editFields}
            action={updateItem}
            values={{
              id: r.id,
              itemName: r.itemName,
              commodityCode: r.commodityCode ?? "",
              materialCategoryCode: r.materialCategoryCode ?? "",
              subCategoryId: r.subCategoryId ?? "",
              countryOfOriginId: r.countryOfOriginId ?? "",
              regionId: r.regionId ?? "",
              unitOfMeasure: r.unitOfMeasure ?? "",
              applicationMethod: r.applicationMethod ?? "",
              status: r.status,
              growerIds: r.authorizations.map((a) => String(a.growerId)).join(","),
              vendorIds: r.itemVendors.map((iv) => String(iv.vendorId)).join(","),
              notes: r.notes ?? "",
            }}
            submitLabel="Save changes"
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="Edit">
                <Pencil />
              </Button>
            }
          />
          <ConfirmButton
            title="Delete item"
            description={`Delete ${r.id}? This cannot be undone. If it has history, deactivate it instead.`}
            confirmLabel="Delete"
            typeToConfirm
            action={deleteItem.bind(null, r.id)}
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
      <PageHeader title="Items" description="Master list of inventory items." />

      <div className="space-y-4">
        <DataTableToolbar
          searchPlaceholder="Search items…"
          exportEntity="items"
          filters={[
            {
              key: "status",
              label: "Status",
              options: [ENTITY_STATUS.ACTIVE, ENTITY_STATUS.INACTIVE, ENTITY_STATUS.REVIEW].map((s) => ({ label: s, value: s })),
            },
            {
              key: "commodity",
              label: "Commodity",
              options: commodities.map((c) => ({ label: c.name, value: c.code })),
            },
            {
              key: "category",
              label: "Category",
              options: categories.map((c) => ({ label: c.name, value: c.code })),
            },
            {
              key: "region",
              label: "Region",
              options: regions.map((r) => ({ label: r.name, value: String(r.id) })),
            },
          ]}
        >
          <EntityFormDialog
            title="New item"
            description="The item ID is generated from the commodity and category."
            fields={createFields}
            action={createItem}
            submitLabel="Create item"
            trigger={
              <Button size="sm">
                <Plus className="size-4" /> Add item
              </Button>
            }
          />
        </DataTableToolbar>

        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          page={page}
          pageCount={pageCount}
          total={total}
          searchParams={raw}
          emptyMessage="No items match your filters."
        />
      </div>
    </>
  )
}
