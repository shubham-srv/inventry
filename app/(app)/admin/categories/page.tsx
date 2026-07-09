import { Pencil, Plus, Trash2 } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { categoriesWhere } from "@/lib/admin/queries"
import { parseListParams } from "@/lib/query"
import { createCategory, updateCategory, deleteCategory } from "@/lib/actions/master-data"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { ConfirmButton } from "@/components/crud/confirm-button"

const fields: Field[] = [
  { name: "code", label: "Code", type: "text", required: true, placeholder: "BX", lockOnEdit: true, description: "Material category code, e.g. BX" },
  { name: "name", label: "Name", type: "text", required: true, colSpan: 2 },
]

type Row = { code: string; name: string; _count: { items: number; subCategories: number } }

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_MASTER_DATA)
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams)
  const where = categoriesWhere(raw)
  const [rows, total] = await Promise.all([
    prisma.materialCategory.findMany({ where, include: { _count: { select: { items: true, subCategories: true } } }, orderBy: { code: "asc" }, skip, take }),
    prisma.materialCategory.count({ where }),
  ])

  const columns: Column<Row>[] = [
    { key: "code", header: "Code", className: "font-mono text-xs", cell: (r) => r.code },
    { key: "name", header: "Name", cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "subs", header: "Sub-categories", cell: (r) => r._count.subCategories },
    { key: "items", header: "Items", cell: (r) => r._count.items },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog title="Edit category" fields={fields} action={updateCategory} values={{ code: r.code, name: r.name }} submitLabel="Save changes" trigger={<Button variant="ghost" size="icon-sm" aria-label="Edit"><Pencil /></Button>} />
          <ConfirmButton title="Delete category" description={`Delete ${r.code}?`} confirmLabel="Delete" action={deleteCategory.bind(null, r.code)} trigger={<Button variant="ghost" size="icon-sm" aria-label="Delete"><Trash2 /></Button>} />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Material categories" description="Categories that group items (boxes, bags, labels…)." />
      <div className="space-y-4">
        <DataTableToolbar searchPlaceholder="Search categories…" exportEntity="categories">
          <EntityFormDialog title="New category" fields={fields} action={createCategory} submitLabel="Create" trigger={<Button size="sm"><Plus className="size-4" /> Add category</Button>} />
        </DataTableToolbar>
        <DataTable columns={columns} rows={rows} getRowKey={(r) => r.code} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
      </div>
    </>
  )
}
