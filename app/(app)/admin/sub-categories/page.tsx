import { Pencil, Plus, Trash2 } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { subCategoriesWhere } from "@/lib/admin/queries"
import { parseListParams } from "@/lib/query"
import { createSubCategory, updateSubCategory, deleteSubCategory } from "@/lib/actions/master-data"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { ConfirmButton } from "@/components/crud/confirm-button"

type Row = {
  id: number
  name: string
  materialCategoryCode: string
  materialCategory: { name: string }
  _count: { items: number }
}

export default async function SubCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_MASTER_DATA)
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams)
  const where = subCategoriesWhere(raw)
  const [rows, total, categories] = await Promise.all([
    prisma.subCategory.findMany({ where, include: { materialCategory: true, _count: { select: { items: true } } }, orderBy: { name: "asc" }, skip, take }),
    prisma.subCategory.count({ where }),
    prisma.materialCategory.findMany({ orderBy: { name: "asc" } }),
  ])

  const categoryOptions = categories.map((c) => ({ label: `${c.code} — ${c.name}`, value: c.code }))
  const fields: Field[] = [
    { name: "materialCategoryCode", label: "Category", type: "select", required: true, placeholder: "Select category", options: categoryOptions, colSpan: 2 },
    { name: "name", label: "Name", type: "text", required: true, colSpan: 2 },
  ]

  const columns: Column<Row>[] = [
    { key: "name", header: "Name", cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "category", header: "Category", cell: (r) => r.materialCategory.name },
    { key: "items", header: "Items", cell: (r) => r._count.items },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog title="Edit sub-category" fields={fields} action={updateSubCategory} values={{ id: r.id, materialCategoryCode: r.materialCategoryCode, name: r.name }} submitLabel="Save changes" trigger={<Button variant="ghost" size="icon-sm" aria-label="Edit"><Pencil /></Button>} />
          <ConfirmButton title="Delete sub-category" description={`Delete ${r.name}?`} confirmLabel="Delete" action={deleteSubCategory.bind(null, r.id)} trigger={<Button variant="ghost" size="icon-sm" aria-label="Delete"><Trash2 /></Button>} />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Sub-categories" description="Finer grouping within a material category." />
      <div className="space-y-4">
        <DataTableToolbar
          searchPlaceholder="Search sub-categories…"
          exportEntity="sub-categories"
          filters={[{ key: "category", label: "Category", options: categories.map((c) => ({ label: c.name, value: c.code })) }]}
        >
          <EntityFormDialog title="New sub-category" fields={fields} action={createSubCategory} submitLabel="Create" trigger={<Button size="sm"><Plus className="size-4" /> Add sub-category</Button>} />
        </DataTableToolbar>
        <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
      </div>
    </>
  )
}
