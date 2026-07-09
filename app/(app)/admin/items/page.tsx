import { Pencil, Plus, Trash2 } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { itemsWhere } from "@/lib/admin/queries"
import { parseListParams } from "@/lib/query"
import { ENTITY_STATUS, APPLICATION_METHODS, PRODUCT_CLASSES } from "@/lib/constants"
import { createItem, updateItem, deleteItem } from "@/lib/actions/items"
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

  const [{ rows, total }, commodities, categories, subCategories, countries, growers, vendors] =
    await Promise.all([
      getItems(where, skip, take),
      prisma.commodity.findMany({ orderBy: { name: "asc" } }),
      prisma.materialCategory.findMany({ orderBy: { name: "asc" } }),
      prisma.subCategory.findMany({
        include: { materialCategory: true },
        orderBy: { name: "asc" },
      }),
      prisma.countryOfOrigin.findMany({ orderBy: { name: "asc" } }),
      prisma.grower.findMany({ where: { status: "Active" }, orderBy: { growerName: "asc" } }),
      prisma.vendor.findMany({ where: { status: "Active" }, orderBy: { vendorName: "asc" } }),
    ])
  const pageCount = Math.ceil(total / pageSize)

  const fields: Field[] = [
    { name: "id", label: "Item ID", type: "text", required: true, placeholder: "AP-BX-00001", lockOnEdit: true },
    { name: "itemName", label: "Name", type: "text", required: true, colSpan: 2 },
    {
      name: "commodityCode",
      label: "Commodity",
      type: "select",
      placeholder: "Select commodity",
      options: commodities.map((c) => ({ label: `${c.code} — ${c.name}`, value: c.code })),
    },
    {
      name: "materialCategoryCode",
      label: "Category",
      type: "select",
      placeholder: "Select category",
      options: categories.map((c) => ({ label: `${c.code} — ${c.name}`, value: c.code })),
    },
    {
      name: "subCategoryId",
      label: "Sub-category",
      type: "select",
      placeholder: "Select sub-category",
      options: subCategories.map((s) => ({
        label: `${s.materialCategory.name} · ${s.name}`,
        value: String(s.id),
      })),
    },
    {
      name: "productClass",
      label: "Product class",
      type: "select",
      placeholder: "Select class",
      options: PRODUCT_CLASSES.map((p) => ({ label: p, value: p })),
    },
    {
      name: "countryOfOriginId",
      label: "Country of origin",
      type: "select",
      placeholder: "Select country",
      options: countries.map((c) => ({ label: c.name, value: String(c.id) })),
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
    { name: "region", label: "Region", type: "text" },
    { name: "legacyFamousId", label: "Legacy ID", type: "text" },
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

  const columns: Column<ItemRow>[] = [
    { key: "id", header: "Item ID", className: "font-mono text-xs", cell: (r) => r.id },
    { key: "itemName", header: "Name", cell: (r) => <span className="font-medium">{r.itemName}</span> },
    { key: "commodity", header: "Commodity", cell: (r) => r.commodity?.name ?? "—" },
    { key: "category", header: "Category", cell: (r) => r.materialCategory?.name ?? "—" },
    { key: "class", header: "Class", cell: (r) => r.productClass ?? "—" },
    { key: "coo", header: "Origin", cell: (r) => r.countryOfOrigin?.name ?? "—" },
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
            fields={fields}
            action={updateItem}
            values={{
              id: r.id,
              itemName: r.itemName,
              commodityCode: r.commodityCode ?? "",
              materialCategoryCode: r.materialCategoryCode ?? "",
              subCategoryId: r.subCategoryId ?? "",
              productClass: r.productClass ?? "",
              countryOfOriginId: r.countryOfOriginId ?? "",
              applicationMethod: r.applicationMethod ?? "",
              status: r.status,
              region: r.region ?? "",
              legacyFamousId: r.legacyFamousId ?? "",
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
          ]}
        >
          <EntityFormDialog
            title="New item"
            fields={fields}
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
