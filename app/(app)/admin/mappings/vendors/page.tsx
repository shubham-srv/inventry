import { Plus, Trash2, ShieldX, ShieldCheck, Package, ChevronRight, Timer } from "lucide-react"
import { prisma } from "@/lib/db"
import { ACTIVE_ITEM } from "@/lib/items/active"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { itemVendorsWhere } from "@/lib/admin/queries"
import { parseListParams } from "@/lib/query"
import { getT } from "@/lib/i18n/server"
import {
  setVendorItems,
  setItemVendorActive,
  deleteItemVendor,
  setItemVendorPackaging,
  setItemVendorLeadTime,
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
  packagingChainId: number | null
  leadTimeDays: number | null
  vendor: { vendorName: string; leadTimeDays: number | null }
  item: {
    itemName: string
    materialCategoryCode: string | null
    materialCategory: { name: string } | null
  }
  packagingChain: { id: number; name: string; levels: { level: number; unitName: string }[] } | null
  packRatios: { level: number; perParent: number }[]
}

export default async function VendorItemMappingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_GROWERS_VENDORS)
  const t = await getT()
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams, { pageSize: 15 })
  const where = itemVendorsWhere(raw)

  const [rows, total, vendors, items, chains, allMappings] = await Promise.all([
    prisma.itemVendor.findMany({
      where,
      include: {
        vendor: true,
        item: {
          select: {
            itemName: true,
            materialCategoryCode: true,
            materialCategory: { select: { name: true } },
          },
        },
        packagingChain: { include: { levels: { orderBy: { level: "asc" } } } },
        packRatios: { orderBy: { level: "asc" } },
      },
      orderBy: [{ vendorId: "asc" }, { itemId: "asc" }],
      skip,
      take,
    }),
    prisma.itemVendor.count({ where }),
    prisma.vendor.findMany({ orderBy: { vendorName: "asc" } }),
    prisma.item.findMany({ where: ACTIVE_ITEM, orderBy: { id: "asc" } }),
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
    { name: "vendorId", label: t("admin.common.vendor"), type: "select", required: true, placeholder: t("admin.mappings.selectVendor"), options: vendors.map((v) => ({ label: v.vendorName, value: String(v.id) })), colSpan: 2 },
    {
      name: "itemIds",
      label: t("admin.common.items"),
      type: "multiselect",
      placeholder: t("admin.mappings.selectItems"),
      // Picking a vendor ticks what it already supplies; this dialog edits the
      // whole set rather than only adding to it.
      dependsOn: "vendorId",
      presetFrom: mappedByVendor,
      options: items.map((i) => ({ label: `${i.id} — ${i.itemName}`, value: i.id })),
      colSpan: 2,
      description: t("admin.mappings.vendorItemsDescription"),
    },
  ]

  // A chain is offered for an item in the same material category — the chain
  // starts from that category, so the two cannot disagree by construction.
  function packagingFields(r: Row): Field[] {
    const eligible = chains.filter(
      (c) => c.materialCategoryCode === r.item.materialCategoryCode
    )
    const chain = r.packagingChain
    const base = r.item.materialCategory?.name ?? t("admin.mappings.itemCategory")
    return [
      { name: "id", type: "hidden" },
      {
        name: "packagingChainId",
        label: t("admin.mappings.conversionChain"),
        type: "select",
        placeholder: eligible.length ? t("admin.mappings.selectChain") : t("admin.mappings.noChainForCategory"),
        options: [
          { label: t("admin.mappings.chainNone"), value: "none" },
          ...eligible.map((c) => ({ label: c.name, value: String(c.id) })),
        ],
        colSpan: 2,
        description: eligible.length
          ? t("admin.mappings.chainDescription")
          : t("admin.mappings.noChainDefined", { code: r.item.materialCategoryCode ?? "—" }),
      },
      {
        name: "ratios",
        label: chain ? t("admin.mappings.quantitiesPer", { levels: chain.levels.map((l) => t("admin.mappings.perUnit", { unit: l.unitName })).join(", ") }) : t("admin.mappings.quantities"),
        type: "text",
        placeholder: chain ? chain.levels.map(() => "10").join(", ") : "10, 5",
        colSpan: 2,
        description: chain
          ? chain.levels.length > 1
            ? t("admin.mappings.ratiosHintNext", { base, inner: chain.levels[0].unitName, outer: chain.levels[1].unitName })
            : t("admin.mappings.ratiosHint", { base, inner: chain.levels[0]?.unitName ?? t("admin.mappings.container") })
          : t("admin.mappings.pickChainFirst"),
      },
    ]
  }

  const columns: Column<Row>[] = [
    { key: "vendor", header: t("admin.common.vendor"), cell: (r) => <span className="font-medium">{r.vendor.vendorName}</span> },
    { key: "itemId", header: t("admin.mappings.itemId"), className: "font-mono text-xs", cell: (r) => r.itemId },
    {
      key: "itemName",
      header: t("admin.common.item"),
      cell: (r) => (
        <div>
          {r.item.itemName}
          <p className="text-muted-foreground text-xs">{r.item.materialCategory?.name ?? t("admin.mappings.noCategory")}</p>
        </div>
      ),
    },
    {
      key: "packaging",
      header: t("nav.conversions"),
      cell: (r) => {
        if (!r.packagingChain)
          return <span className="text-muted-foreground text-xs">{t("admin.mappings.plainUnits")}</span>
        const byLevel = new Map(r.packRatios.map((p) => [p.level, p.perParent]))
        return (
          <div>
            <span className="flex flex-wrap items-center gap-1 text-xs">
              <Badge variant="secondary" className="font-mono text-[10px]">
                {r.item.materialCategory?.name ?? t("admin.mappings.units")}
              </Badge>
              {r.packagingChain.levels.map((l) => (
                <span key={l.level} className="flex items-center gap-1">
                  <span className="text-muted-foreground tabular-nums">×{byLevel.get(l.level) ?? "?"}</span>
                  <ChevronRight className="text-muted-foreground size-3" />
                  <Badge variant="outline">{l.unitName}</Badge>
                </span>
              ))}
            </span>
          </div>
        )
      },
    },
    {
      key: "lead",
      header: t("admin.mappings.leadTime"),
      className: "text-xs whitespace-nowrap",
      cell: (r) => (
        <div className="flex items-center gap-1">
          {r.leadTimeDays != null ? (
            <span className="font-medium tabular-nums">{t("admin.mappings.daysCount", { count: r.leadTimeDays })}</span>
          ) : (
            <span className="text-muted-foreground">
              {r.vendor.leadTimeDays != null ? t("admin.mappings.vendorDefault", { days: r.vendor.leadTimeDays }) : t("admin.common.none")}
            </span>
          )}
          <EntityFormDialog
            title={t("admin.mappings.itemLeadTime")}
            description={`${r.vendor.vendorName} — ${r.itemId}`}
            fields={[
              {
                name: "leadTimeDays",
                label: t("admin.mappings.minLeadTime"),
                type: "number",
                min: "0",
                step: "1",
                colSpan: 2,
                description: t("admin.mappings.leadTimeHint", { default: r.vendor.leadTimeDays != null ? t("admin.mappings.daysPlural", { count: r.vendor.leadTimeDays }) : t("admin.mappings.noneSet") }),
              },
            ]}
            action={setItemVendorLeadTime}
            values={{ id: r.id, leadTimeDays: r.leadTimeDays ?? "" }}
            submitLabel={t("admin.mappings.saveLeadTime")}
            trigger={<Button variant="ghost" size="icon-sm" aria-label={t("admin.mappings.leadTime")}><Timer /></Button>}
          />
        </div>
      ),
    },
    { key: "active", header: t("admin.common.status"), cell: (r) => <StatusBadge status={r.isActive ? "Active" : "Inactive"} /> },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog
            title={t("nav.conversions")}
            description={`${r.vendor.vendorName} — ${r.itemId}`}
            fields={packagingFields(r)}
            action={setItemVendorPackaging}
            values={{
              id: r.id,
              packagingChainId: r.packagingChainId ? String(r.packagingChainId) : "none",
              ratios: r.packRatios.map((p) => p.perParent).join(", "),
            }}
            submitLabel={t("admin.mappings.saveConversions")}
            trigger={<Button variant="ghost" size="icon-sm" aria-label={t("nav.conversions")}><Package /></Button>}
          />
          <ActionButton action={setItemVendorActive.bind(null, r.id, !r.isActive)}>
            {r.isActive ? <><ShieldX className="size-4" /> {t("admin.mappings.deactivate")}</> : <><ShieldCheck className="size-4" /> {t("admin.mappings.activate")}</>}
          </ActionButton>
          <ConfirmButton title={t("admin.mappings.removeMapping")} description={t("admin.mappings.removeMappingConfirm", { item: r.itemId, name: r.vendor.vendorName })} confirmLabel={t("admin.mappings.remove")} typeToConfirm action={deleteItemVendor.bind(null, r.id)} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("admin.mappings.remove")}><Trash2 /></Button>} />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <DataTableToolbar
        searchPlaceholder={t("admin.mappings.searchItem")}
        filters={[
          { key: "vendor", label: t("admin.common.vendor"), options: vendors.map((v) => ({ label: v.vendorName, value: String(v.id) })) },
          { key: "status", label: t("admin.common.status"), options: [{ label: t("admin.common.active"), value: "active" }, { label: t("admin.common.inactive"), value: "inactive" }] },
          { key: "packaging", label: t("nav.conversions"), options: [{ label: t("admin.mappings.configured"), value: "configured" }, { label: t("admin.mappings.notSet"), value: "missing" }] },
        ]}
      >
        <EntityFormDialog title={t("admin.mappings.vendorDialogTitle")} description={t("admin.mappings.vendorDialogDescription")} fields={createFields} action={setVendorItems} submitLabel={t("admin.mappings.saveMappings")} trigger={<Button size="sm"><Plus className="size-4" /> {t("admin.mappings.mapItems")}</Button>} />
      </DataTableToolbar>
      <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
    </div>
  )
}
