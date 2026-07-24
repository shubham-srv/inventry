import { format } from "date-fns"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { type Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { parseListParams } from "@/lib/query"
import {
  ENTITY_STATUS,
  ITEM_MESSAGE_TYPES,
  ITEM_MESSAGE_TYPE_LABELS,
  ITEM_MESSAGE_SEVERITIES,
} from "@/lib/constants"
import { createItemMessage, updateItemMessage, deleteItemMessage } from "@/lib/actions/item-messages"
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
  type: string
  body: string | null
  severity: string
  audience: string
  isActive: boolean
  startsAt: Date | null
  endsAt: Date | null
  item: { itemName: string }
  targets: { growerId: number }[]
}

const SEVERITY_STYLES: Record<string, string> = {
  info: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  critical: "bg-red-500/15 text-red-700 dark:text-red-400",
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const toDateInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "")

export default async function AdminItemMessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_GROWERS_VENDORS)
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams)

  const and: Prisma.ItemMessageWhereInput[] = []
  if (raw.q) and.push({ OR: [{ item: { itemName: { contains: raw.q } } }, { body: { contains: raw.q } }] })
  if (raw.type) and.push({ type: raw.type })
  if (raw.state === "active") and.push({ isActive: true })
  else if (raw.state === "disabled") and.push({ isActive: false })
  const where: Prisma.ItemMessageWhereInput = and.length ? { AND: and } : {}

  const [rows, total, items, growers] = await Promise.all([
    prisma.itemMessage.findMany({
      where,
      include: { item: true, targets: { select: { growerId: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.itemMessage.count({ where }),
    prisma.item.findMany({ where: { status: ENTITY_STATUS.ACTIVE }, orderBy: { id: "asc" }, select: { id: true, itemName: true } }),
    prisma.grower.findMany({ orderBy: { growerName: "asc" }, select: { id: true, growerName: true } }),
  ])

  const growerName = new Map(growers.map((g) => [g.id, g.growerName]))

  const fields: Field[] = [
    { name: "itemId", label: "Item", type: "select", required: true, colSpan: 2, placeholder: "Select item", options: items.map((i) => ({ label: `${i.id} — ${i.itemName}`, value: i.id })) },
    { name: "type", label: "Type", type: "select", required: true, options: ITEM_MESSAGE_TYPES.map((t) => ({ label: ITEM_MESSAGE_TYPE_LABELS[t], value: t })) },
    { name: "severity", label: "Severity", type: "select", required: true, options: ITEM_MESSAGE_SEVERITIES.map((s) => ({ label: cap(s), value: s })) },
    { name: "audience", label: "Audience", type: "select", required: true, options: [{ label: "All growers", value: "All" }, { label: "Selected growers", value: "Selected" }] },
    { name: "growerIds", label: "Growers (when audience = Selected)", type: "multiselect", colSpan: 2, placeholder: "Select growers", options: growers.map((g) => ({ label: g.growerName, value: String(g.id) })) },
    { name: "body", label: "Note (optional — shown to growers as typed)", type: "textarea", colSpan: 2 },
    { name: "startsAt", label: "Starts (optional)", type: "date" },
    { name: "endsAt", label: "Ends (optional)", type: "date" },
    { name: "isActive", label: "State", type: "select", required: true, options: [{ label: "Active", value: "true" }, { label: "Disabled", value: "false" }] },
  ]

  const columns: Column<Row>[] = [
    {
      key: "item",
      header: "Item",
      cell: (r) => (
        <div>
          <span className="font-medium">{r.item.itemName}</span>
          <p className="text-muted-foreground font-mono text-xs">{r.itemId}</p>
        </div>
      ),
    },
    { key: "type", header: "Type", cell: (r) => ITEM_MESSAGE_TYPE_LABELS[r.type as keyof typeof ITEM_MESSAGE_TYPE_LABELS] ?? r.type },
    {
      key: "severity",
      header: "Severity",
      cell: (r) => (
        <Badge variant="outline" className={`border-transparent ${SEVERITY_STYLES[r.severity] ?? ""}`}>
          {cap(r.severity)}
        </Badge>
      ),
    },
    {
      key: "audience",
      header: "Audience",
      className: "text-xs",
      cell: (r) =>
        r.audience === "All"
          ? "All growers"
          : r.targets.map((t) => growerName.get(t.growerId) ?? t.growerId).join(", ") || "— none —",
    },
    {
      key: "window",
      header: "Window",
      className: "text-muted-foreground whitespace-nowrap text-xs",
      cell: (r) =>
        r.startsAt || r.endsAt
          ? `${r.startsAt ? format(r.startsAt, "MMM d") : "…"} – ${r.endsAt ? format(r.endsAt, "MMM d") : "…"}`
          : "Always",
    },
    {
      key: "state",
      header: "State",
      cell: (r) =>
        r.isActive ? (
          <Badge variant="outline" className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Active</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">Disabled</Badge>
        ),
    },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog
            title="Edit item message"
            description={`${r.item.itemName} — ${r.itemId}`}
            fields={fields}
            action={updateItemMessage}
            values={{
              id: r.id,
              itemId: r.itemId,
              type: r.type,
              severity: r.severity,
              audience: r.audience,
              body: r.body ?? "",
              growerIds: r.targets.map((t) => String(t.growerId)).join(","),
              startsAt: toDateInput(r.startsAt),
              endsAt: toDateInput(r.endsAt),
              isActive: String(r.isActive),
            }}
            submitLabel="Save changes"
            trigger={<Button variant="ghost" size="icon-sm" aria-label="Edit"><Pencil /></Button>}
          />
          <ConfirmButton
            title="Delete item message"
            description={`Delete this ${ITEM_MESSAGE_TYPE_LABELS[r.type as keyof typeof ITEM_MESSAGE_TYPE_LABELS] ?? r.type} message for ${r.item.itemName}?`}
            confirmLabel="Delete"
            action={deleteItemMessage.bind(null, r.id)}
            trigger={<Button variant="ghost" size="icon-sm" aria-label="Delete"><Trash2 /></Button>}
          />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Item messages" description="Notices shown to growers under a specific item — for all growers or a selected subset." />
      <div className="space-y-4">
        <DataTableToolbar
          searchPlaceholder="Search item or note…"
          filters={[
            { key: "type", label: "Type", options: ITEM_MESSAGE_TYPES.map((t) => ({ label: ITEM_MESSAGE_TYPE_LABELS[t], value: t })) },
            { key: "state", label: "State", options: [{ label: "Active", value: "active" }, { label: "Disabled", value: "disabled" }] },
          ]}
        >
          <EntityFormDialog
            title="New item message"
            fields={fields}
            action={createItemMessage}
            values={{ type: "Info", severity: "info", audience: "All", isActive: "true", itemId: "", growerIds: "", body: "", startsAt: "", endsAt: "" }}
            submitLabel="Create"
            trigger={<Button size="sm"><Plus className="size-4" /> Add message</Button>}
          />
        </DataTableToolbar>
        <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
      </div>
    </>
  )
}
