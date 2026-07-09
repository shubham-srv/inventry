import { Pencil, Plus, Trash2, ArrowRight } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { parseListParams } from "@/lib/query"
import { UNITS_OF_MEASURE } from "@/lib/constants"
import { createConversion, updateConversion, deleteConversion } from "@/lib/actions/conversions"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { ConfirmButton } from "@/components/crud/confirm-button"

type Row = {
  id: number
  fromUnit: string
  toUnit: string
  factor: unknown
  itemId: string | null
  commodityCode: string | null
  notes: string | null
  item: { itemName: string } | null
  commodity: { name: string } | null
}

export default async function ConversionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_CONVERSIONS)
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams)

  const where = raw.q
    ? { OR: [{ fromUnit: { contains: raw.q } }, { toUnit: { contains: raw.q } }] }
    : {}

  const [rows, total, items, commodities] = await Promise.all([
    prisma.unitConversion.findMany({ where, include: { item: true, commodity: true }, orderBy: { fromUnit: "asc" }, skip, take }),
    prisma.unitConversion.count({ where }),
    prisma.item.findMany({ where: { status: "Active" }, orderBy: { id: "asc" } }),
    prisma.commodity.findMany({ orderBy: { name: "asc" } }),
  ])

  const unitOptions = UNITS_OF_MEASURE.map((u) => ({ label: u, value: u }))
  const fields: Field[] = [
    { name: "fromUnit", label: "From unit", type: "select", required: true, placeholder: "Bags", options: unitOptions },
    { name: "toUnit", label: "To unit", type: "select", required: true, placeholder: "Boxes", options: unitOptions },
    { name: "factor", label: "Factor (1 from = factor to)", type: "number", required: true, step: "any", colSpan: 2, description: "e.g. 0.25 means 4 bags = 1 box" },
    { name: "commodityCode", label: "Scope: commodity (optional)", type: "select", placeholder: "All commodities", options: [{ label: "— none (global) —", value: "none" }, ...commodities.map((c) => ({ label: c.name, value: c.code }))] },
    { name: "itemId", label: "Scope: item (optional)", type: "select", placeholder: "All items", options: [{ label: "— none (global) —", value: "none" }, ...items.map((i) => ({ label: `${i.id} — ${i.itemName}`, value: i.id }))] },
    { name: "notes", label: "Notes", type: "textarea" },
  ]

  const columns: Column<Row>[] = [
    {
      key: "conv",
      header: "Conversion",
      cell: (r) => (
        <span className="flex items-center gap-2 font-medium">
          {r.fromUnit} <ArrowRight className="text-muted-foreground size-3.5" /> {r.toUnit}
        </span>
      ),
    },
    { key: "factor", header: "Factor", className: "tabular-nums", cell: (r) => String(Number(r.factor)) },
    { key: "scope", header: "Scope", cell: (r) => r.item?.itemName ?? r.commodity?.name ?? "Global" },
    { key: "notes", header: "Notes", cell: (r) => r.notes ?? "—" },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog
            title="Edit conversion"
            fields={fields}
            action={updateConversion}
            values={{ id: r.id, fromUnit: r.fromUnit, toUnit: r.toUnit, factor: Number(r.factor), commodityCode: r.commodityCode ?? "none", itemId: r.itemId ?? "none", notes: r.notes ?? "" }}
            submitLabel="Save changes"
            trigger={<Button variant="ghost" size="icon-sm" aria-label="Edit"><Pencil /></Button>}
          />
          <ConfirmButton title="Delete conversion" description={`Delete ${r.fromUnit} → ${r.toUnit}?`} confirmLabel="Delete" action={deleteConversion.bind(null, r.id)} trigger={<Button variant="ghost" size="icon-sm" aria-label="Delete"><Trash2 /></Button>} />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Unit conversions" description="How packaging units convert (bags → boxes → packaged boxes → pallets…)." />
      <div className="space-y-4">
        <DataTableToolbar searchPlaceholder="Search units…">
          <EntityFormDialog title="New conversion" fields={fields} action={createConversion} submitLabel="Create" trigger={<Button size="sm"><Plus className="size-4" /> Add conversion</Button>} />
        </DataTableToolbar>
        <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
      </div>
    </>
  )
}
