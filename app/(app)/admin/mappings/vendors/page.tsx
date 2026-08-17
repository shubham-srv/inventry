import { Plus, Trash2, ShieldX, ShieldCheck, Package, ChevronRight } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { itemVendorsWhere } from "@/lib/admin/queries"
import { parseListParams } from "@/lib/query"
import {
  setVendorItems,
  setItemVendorActive,
  deleteItemVendor,
  setItemVendorPackaging,
} from "@/lib/actions/mappings"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { ConfirmButton } from "@/components/crud/confirm-button"
import { ActionButton } from "@/components/action-button"
import { StatusBadge } from "@/components/status-badge"

type Row = {
  id: number
  isActive: boolean
  itemId: string
  shipsInLevel: number
  packagingChainId: number | null
  vendor: { vendorName: string }
  item: { itemName: string; unitOfMeasure: string | null; materialCategoryCode: string | null }
  packagingChain: { id: number; name: string; baseUnit: string; levels: { level: number; unitName: string }[] } | null
  packRatios: { level: number; perParent: number }[]
}

export default async function VendorItemMappingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_GROWERS_VENDORS)
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams, { pageSize: 15 })
  const where = itemVendorsWhere(raw)

  const [rows, total, vendors, items, chains, allMappings] = await Promise.all([
    prisma.itemVendor.findMany({
      where,
      include: {
        vendor: true,
        item: { select: { itemName: true, unitOfMeasure: true, materialCategoryCode: true } },
        packagingChain: { include: { levels: { orderBy: { level: "asc" } } } },
        packRatios: { orderBy: { level: "asc" } },
      },
      orderBy: [{ vendorId: "asc" }, { itemId: "asc" }],
      skip,
      take,
    }),
    prisma.itemVendor.count({ where }),
    prisma.vendor.findMany({ orderBy: { vendorName: "asc" } }),
    prisma.item.findMany({ where: { status: "Active" }, orderBy: { id: "asc" } }),
    prisma.packagingChain.findMany({
      where: { isActive: true },
      include: { levels: { orderBy: { level: "asc" } } },
      orderBy: [{ materialCategoryCode: "asc" }, { name: "asc" }],
    }),
    // Every ACTIVE mapping, unpaged — the dialog pre-ticks a vendor's whole set,
    // so a page-sized subset would quietly deactivate everything not on screen.
    // Same scaling caveat as the grower authorizations page.
    prisma.itemVendor.findMany({
      where: { isActive: true },
      select: { vendorId: true, itemId: true },
      orderBy: { itemId: "asc" },
    }),
  ])

  // vendorId -> the items it currently supplies.
  const mappedByVendor: Record<string, string[]> = {}
  for (const m of allMappings) (mappedByVendor[String(m.vendorId)] ??= []).push(m.itemId)

  const createFields: Field[] = [
    { name: "vendorId", label: "Vendor", type: "select", required: true, placeholder: "Select vendor", options: vendors.map((v) => ({ label: v.vendorName, value: String(v.id) })), colSpan: 2 },
    {
      name: "itemIds",
      label: "Items",
      type: "multiselect",
      placeholder: "Select one or more items",
      // Picking a vendor ticks what it already supplies; this dialog edits the
      // whole set rather than only adding to it.
      dependsOn: "vendorId",
      presetFrom: mappedByVendor,
      options: items.map((i) => ({ label: `${i.id} — ${i.itemName}`, value: i.id })),
      colSpan: 2,
      description:
        "Ticked items are what the vendor supplies today. Unticking one deactivates the mapping — its packaging setup is kept, so re-ticking later restores it.",
    },
  ]

  // A chain is only offered for an item whose unit matches the chain's base
  // unit AND whose material category it belongs to. `parent` drives the
  // dependsOn filter so the dropdown narrows as soon as the row is known.
  function packagingFields(r: Row): Field[] {
    const eligible = chains.filter(
      (c) =>
        c.materialCategoryCode === r.item.materialCategoryCode &&
        (!r.item.unitOfMeasure || c.baseUnit === r.item.unitOfMeasure)
    )
    const chain = r.packagingChain
    const levelOptions = [
      { label: `${r.item.unitOfMeasure ?? "Base unit"} — partial containers allowed`, value: "0" },
      ...(chain?.levels ?? []).map((l) => ({ label: `Whole ${l.unitName}`, value: String(l.level) })),
    ]
    return [
      { name: "id", type: "hidden" },
      {
        name: "packagingChainId",
        label: "Packaging chain",
        type: "select",
        placeholder: eligible.length ? "Select a chain" : "No chain matches this item's unit",
        options: [
          { label: "— none (order in plain units) —", value: "none" },
          ...eligible.map((c) => ({ label: `${c.name}  (${c.baseUnit})`, value: String(c.id) })),
        ],
        colSpan: 2,
        description: eligible.length
          ? undefined
          : `No chain is defined for category ${r.item.materialCategoryCode ?? "—"} starting from ${r.item.unitOfMeasure ?? "this item's unit"}. Add one under Packaging first.`,
      },
      {
        name: "ratios",
        label: chain ? `Quantities (${chain.levels.map((l) => `per ${l.unitName}`).join(", ")})` : "Quantities",
        type: "text",
        placeholder: chain ? chain.levels.map(() => "10").join(", ") : "10, 5",
        colSpan: 2,
        description: chain
          ? `Comma-separated, innermost first: how many ${chain.baseUnit} per ${chain.levels[0]?.unitName ?? "container"}${chain.levels.length > 1 ? `, then how many ${chain.levels[0].unitName} per ${chain.levels[1].unitName}` : ""}.`
          : "Pick a chain first.",
      },
      {
        name: "shipsInLevel",
        label: "Ships in",
        type: "select",
        options: levelOptions,
        colSpan: 2,
        description: "The level that must be a whole number. Anything above the base unit rounds the order up, so the grower may receive more than they asked for.",
      },
    ]
  }

  const columns: Column<Row>[] = [
    { key: "vendor", header: "Vendor", cell: (r) => <span className="font-medium">{r.vendor.vendorName}</span> },
    { key: "itemId", header: "Item ID", className: "font-mono text-xs", cell: (r) => r.itemId },
    {
      key: "itemName",
      header: "Item",
      cell: (r) => (
        <div>
          {r.item.itemName}
          <p className="text-muted-foreground text-xs">{r.item.unitOfMeasure ?? "no unit"}</p>
        </div>
      ),
    },
    {
      key: "packaging",
      header: "Packaging",
      cell: (r) => {
        if (!r.packagingChain)
          return <span className="text-muted-foreground text-xs">Plain units</span>
        const byLevel = new Map(r.packRatios.map((p) => [p.level, p.perParent]))
        return (
          <div>
            <span className="flex flex-wrap items-center gap-1 text-xs">
              <Badge variant="secondary" className="font-mono text-[10px]">{r.packagingChain.baseUnit}</Badge>
              {r.packagingChain.levels.map((l) => (
                <span key={l.level} className="flex items-center gap-1">
                  <span className="text-muted-foreground tabular-nums">×{byLevel.get(l.level) ?? "?"}</span>
                  <ChevronRight className="text-muted-foreground size-3" />
                  <Badge variant="outline">{l.unitName}</Badge>
                </span>
              ))}
            </span>
            <p className="text-muted-foreground mt-0.5 text-xs">
              ships in{" "}
              {r.shipsInLevel === 0
                ? `${r.packagingChain.baseUnit} (partials ok)`
                : `whole ${r.packagingChain.levels.find((l) => l.level === r.shipsInLevel)?.unitName ?? "?"}`}
            </p>
          </div>
        )
      },
    },
    { key: "active", header: "Status", cell: (r) => <StatusBadge status={r.isActive ? "Active" : "Inactive"} /> },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog
            title="Packaging"
            description={`${r.vendor.vendorName} — ${r.itemId}`}
            fields={packagingFields(r)}
            action={setItemVendorPackaging}
            values={{
              id: r.id,
              packagingChainId: r.packagingChainId ? String(r.packagingChainId) : "none",
              ratios: r.packRatios.map((p) => p.perParent).join(", "),
              shipsInLevel: String(r.shipsInLevel),
            }}
            submitLabel="Save packaging"
            trigger={<Button variant="ghost" size="icon-sm" aria-label="Packaging"><Package /></Button>}
          />
          <ActionButton action={setItemVendorActive.bind(null, r.id, !r.isActive)}>
            {r.isActive ? <><ShieldX className="size-4" /> Deactivate</> : <><ShieldCheck className="size-4" /> Activate</>}
          </ActionButton>
          <ConfirmButton title="Remove mapping" description={`Remove ${r.itemId} from ${r.vendor.vendorName}? Its packaging setup is removed too.`} confirmLabel="Remove" typeToConfirm action={deleteItemVendor.bind(null, r.id)} trigger={<Button variant="ghost" size="icon-sm" aria-label="Remove"><Trash2 /></Button>} />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <DataTableToolbar
        searchPlaceholder="Search item id / name…"
        filters={[
          { key: "vendor", label: "Vendor", options: vendors.map((v) => ({ label: v.vendorName, value: String(v.id) })) },
          { key: "status", label: "Status", options: [{ label: "Active", value: "active" }, { label: "Inactive", value: "inactive" }] },
          { key: "packaging", label: "Packaging", options: [{ label: "Configured", value: "configured" }, { label: "Not set", value: "missing" }] },
        ]}
      >
        <EntityFormDialog title="Edit vendor item mappings" description="Pick a vendor to load what it supplies today, then adjust." fields={createFields} action={setVendorItems} submitLabel="Save mappings" trigger={<Button size="sm"><Plus className="size-4" /> Map items</Button>} />
      </DataTableToolbar>
      <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
    </div>
  )
}
