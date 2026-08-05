import { Pencil, Plus, Trash2 } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { parseListParams } from "@/lib/query"
import { UNITS_OF_MEASURE } from "@/lib/constants"
import { createThreshold, updateThreshold, deleteThreshold } from "@/lib/actions/settings"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { ConfirmButton } from "@/components/crud/confirm-button"

type Row = {
  id: number
  itemId: string
  growerId: number | null
  thresholdQuantity: unknown
  unitOfMeasure: string | null
  item: { itemName: string }
  grower: { growerName: string } | null
}

export default async function ThresholdsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.ACCESS_SETTINGS)
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams)

  const where = raw.q ? { OR: [{ itemId: { contains: raw.q } }, { item: { itemName: { contains: raw.q } } }] } : {}
  const [rows, total, items, growers] = await Promise.all([
    prisma.itemThreshold.findMany({ where, include: { item: true, grower: true }, orderBy: { itemId: "asc" }, skip, take }),
    prisma.itemThreshold.count({ where }),
    prisma.item.findMany({ where: { status: "Active" }, orderBy: { id: "asc" } }),
    prisma.grower.findMany({ orderBy: { growerName: "asc" } }),
  ])

  const fields: Field[] = [
    { name: "itemId", label: "Item", type: "select", required: true, placeholder: "Select item", options: items.map((i) => ({ label: `${i.id} — ${i.itemName}`, value: i.id })), colSpan: 2 },
    { name: "growerId", label: "Scope", type: "select", placeholder: "Global", options: [{ label: "Global (all growers)", value: "0" }, ...growers.map((g) => ({ label: g.growerName, value: String(g.id) }))] },
    { name: "thresholdQuantity", label: "Threshold qty", type: "number", required: true, step: "any" },
    { name: "unitOfMeasure", label: "Unit", type: "select", placeholder: "Unit", options: UNITS_OF_MEASURE.map((u) => ({ label: u, value: u })) },
  ]

  const columns: Column<Row>[] = [
    {
      key: "item",
      header: "Item",
      cell: (r) => (
        <>
          <span className="font-medium">{r.item.itemName}</span>
          <span className="text-muted-foreground ml-2 font-mono text-xs">{r.itemId}</span>
        </>
      ),
    },
    { key: "scope", header: "Scope", cell: (r) => (r.grower ? <Badge variant="secondary">{r.grower.growerName}</Badge> : <Badge variant="outline">Global</Badge>) },
    { key: "qty", header: "Threshold", className: "tabular-nums", cell: (r) => `${Number(r.thresholdQuantity)} ${r.unitOfMeasure ?? ""}` },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog title="Edit threshold" fields={fields} action={updateThreshold} values={{ id: r.id, itemId: r.itemId, growerId: r.growerId ? String(r.growerId) : "0", thresholdQuantity: Number(r.thresholdQuantity), unitOfMeasure: r.unitOfMeasure ?? "" }} submitLabel="Save changes" trigger={<Button variant="ghost" size="icon-sm" aria-label="Edit"><Pencil /></Button>} />
          <ConfirmButton title="Delete threshold" description="Delete this threshold?" confirmLabel="Delete" typeToConfirm action={deleteThreshold.bind(null, r.id)} trigger={<Button variant="ghost" size="icon-sm" aria-label="Delete"><Trash2 /></Button>} />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Item thresholds" description="Low-stock thresholds. Grower-specific values override the global default." />
      <div className="space-y-4">
        <DataTableToolbar searchPlaceholder="Search items…">
          <EntityFormDialog title="New threshold" fields={fields} action={createThreshold} submitLabel="Create" trigger={<Button size="sm"><Plus className="size-4" /> Add threshold</Button>} />
        </DataTableToolbar>
        <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
      </div>
    </>
  )
}
