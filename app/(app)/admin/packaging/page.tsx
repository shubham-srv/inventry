import { Pencil, Plus, Trash2, ChevronRight } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { parseListParams } from "@/lib/query"
import { UNITS_OF_MEASURE } from "@/lib/constants"
import {
  createPackagingChain,
  updatePackagingChain,
  deletePackagingChain,
} from "@/lib/actions/packaging"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { ConfirmButton } from "@/components/crud/confirm-button"

type Row = {
  id: number
  name: string
  baseUnit: string
  materialCategoryCode: string
  materialCategory: { name: string }
  levels: { level: number; unitName: string }[]
  _count: { itemVendors: number }
}

export default async function PackagingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_CONVERSIONS)
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams)

  const where = raw.q
    ? { OR: [{ name: { contains: raw.q } }, { baseUnit: { contains: raw.q } }] }
    : {}

  const [rows, total, categories] = await Promise.all([
    prisma.packagingChain.findMany({
      where,
      include: {
        materialCategory: true,
        levels: { orderBy: { level: "asc" } },
        _count: { select: { itemVendors: true } },
      },
      orderBy: [{ materialCategoryCode: "asc" }, { name: "asc" }],
      skip,
      take,
    }),
    prisma.packagingChain.count({ where }),
    prisma.materialCategory.findMany({ orderBy: { name: "asc" } }),
  ])

  const fields: Field[] = [
    {
      name: "materialCategoryCode",
      label: "Material category",
      type: "select",
      required: true,
      placeholder: "Select category",
      options: categories.map((c) => ({ label: `${c.code} — ${c.name}`, value: c.code })),
    },
    {
      name: "baseUnit",
      label: "Base unit",
      type: "select",
      required: true,
      placeholder: "Bags",
      options: UNITS_OF_MEASURE.map((u) => ({ label: u, value: u })),
      description: "The item's own unit — a chain is only offered for items measured in this",
    },
    { name: "name", label: "Name", type: "text", required: true, placeholder: "Bags → Boxes → Cases", colSpan: 2 },
    {
      name: "levels",
      label: "Packaging levels",
      type: "text",
      required: true,
      placeholder: "Boxes, Cases",
      colSpan: 2,
      description: "Comma-separated, innermost first. No quantities here — vendors supply those.",
    },
  ]

  const columns: Column<Row>[] = [
    {
      key: "chain",
      header: "Chain",
      cell: (r) => (
        <div>
          <span className="flex flex-wrap items-center gap-1 font-medium">
            <Badge variant="secondary" className="font-mono text-[10px]">{r.baseUnit}</Badge>
            {r.levels.map((l) => (
              <span key={l.level} className="flex items-center gap-1">
                <ChevronRight className="text-muted-foreground size-3" />
                <Badge variant="outline">{l.unitName}</Badge>
              </span>
            ))}
          </span>
          <p className="text-muted-foreground mt-0.5 text-xs">{r.name}</p>
        </div>
      ),
    },
    { key: "category", header: "Category", cell: (r) => r.materialCategory.name },
    {
      key: "used",
      header: "Used by",
      className: "tabular-nums",
      cell: (r) => `${r._count.itemVendors} mapping${r._count.itemVendors === 1 ? "" : "s"}`,
    },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog
            title="Edit packaging chain"
            fields={fields}
            action={updatePackagingChain}
            values={{
              id: r.id,
              materialCategoryCode: r.materialCategoryCode,
              name: r.name,
              baseUnit: r.baseUnit,
              levels: r.levels.map((l) => l.unitName).join(", "),
            }}
            submitLabel="Save changes"
            trigger={<Button variant="ghost" size="icon-sm" aria-label="Edit"><Pencil /></Button>}
          />
          <ConfirmButton
            title="Delete packaging chain"
            description={`Delete "${r.name}"?`}
            confirmLabel="Delete"
            typeToConfirm
            action={deletePackagingChain.bind(null, r.id)}
            trigger={<Button variant="ghost" size="icon-sm" aria-label="Delete"><Trash2 /></Button>}
          />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Packaging"
        description="How a SKU is packed for shipping. Chains define the structure only — each vendor supplies their own quantities on the vendor↔item mapping."
      />
      <div className="space-y-4">
        <DataTableToolbar searchPlaceholder="Search chains…">
          <EntityFormDialog
            title="New packaging chain"
            fields={fields}
            action={createPackagingChain}
            submitLabel="Create"
            trigger={<Button size="sm"><Plus className="size-4" /> Add chain</Button>}
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
        />
      </div>
    </>
  )
}
