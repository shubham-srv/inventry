import { format } from "date-fns"
import { Pencil, Plus, Trash2, Languages } from "lucide-react"
import { type Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { ACTIVE_ITEM } from "@/lib/items/active"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { parseListParams } from "@/lib/query"
import {
  ITEM_MESSAGE_TYPES,
  ITEM_MESSAGE_TYPE_LABELS,
  ITEM_MESSAGE_SEVERITIES,
  ITEM_MESSAGE_RECIPIENTS,
  ITEM_MESSAGE_RECIPIENT_LABELS,
  type ItemMessageRecipients,
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
  recipients: string
  audience: string
  isActive: boolean
  startsAt: Date | null
  endsAt: Date | null
  item: { itemName: string }
  targets: { growerId: number }[]
  vendorTargets: { vendorId: number }[]
  translations: { locale: string; body: string; isMachine: boolean }[]
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
  if (raw.recipients) and.push({ recipients: raw.recipients })
  if (raw.state === "active") and.push({ isActive: true })
  else if (raw.state === "disabled") and.push({ isActive: false })
  const where: Prisma.ItemMessageWhereInput = and.length ? { AND: and } : {}

  const [rows, total, items, growers, auths, vendors, itemVendors] = await Promise.all([
    prisma.itemMessage.findMany({
      where,
      include: {
        item: true,
        targets: { select: { growerId: true } },
        vendorTargets: { select: { vendorId: true } },
        translations: { select: { locale: true, body: true, isMachine: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.itemMessage.count({ where }),
    prisma.item.findMany({ where: ACTIVE_ITEM, orderBy: { id: "asc" }, select: { id: true, itemName: true } }),
    prisma.grower.findMany({ orderBy: { growerName: "asc" }, select: { id: true, growerName: true } }),
    // Which growers can actually see a message about a given item. A message
    // targeted at a grower not authorized for the item is invisible to them —
    // getGrowerSubmitData only surfaces messages for their authorized items —
    // so offering those growers is offering a no-op.
    prisma.growerItemAuthorization.findMany({
      where: { isActive: true },
      select: { itemId: true, growerId: true },
      orderBy: { grower: { growerName: "asc" } },
    }),
    prisma.vendor.findMany({ orderBy: { vendorName: "asc" }, select: { id: true, vendorName: true } }),
    // Same idea for vendors: only those mapped to the item can see it.
    prisma.itemVendor.findMany({
      where: { isActive: true },
      select: { itemId: true, vendorId: true },
      orderBy: { vendor: { vendorName: "asc" } },
    }),
  ])

  const growerName = new Map(growers.map((g) => [g.id, g.growerName]))
  const vendorName = new Map(vendors.map((v) => [v.id, v.vendorName]))
  const recipientLabel = (r: string) => ITEM_MESSAGE_RECIPIENT_LABELS[r as ItemMessageRecipients] ?? r

  const fields: Field[] = [
    { name: "itemId", label: "Item", type: "select", required: true, colSpan: 2, placeholder: "Select item", options: items.map((i) => ({ label: `${i.id} — ${i.itemName}`, value: i.id })) },
    { name: "type", label: "Type", type: "select", required: true, options: ITEM_MESSAGE_TYPES.map((t) => ({ label: ITEM_MESSAGE_TYPE_LABELS[t], value: t })) },
    { name: "severity", label: "Severity", type: "select", required: true, options: ITEM_MESSAGE_SEVERITIES.map((s) => ({ label: cap(s), value: s })) },
    { name: "recipients", label: "Show to", type: "select", required: true, options: ITEM_MESSAGE_RECIPIENTS.map((r) => ({ label: recipientLabel(r), value: r })) },
    { name: "audience", label: "Audience", type: "select", required: true, options: [{ label: "Everyone (all mapped to the item)", value: "All" }, { label: "Only selected", value: "Selected" }] },
    {
      name: "growerIds",
      label: "Growers",
      type: "multiselect",
      showWhen: { audience: ["Selected"], recipients: ["Growers", "Both"] },
      colSpan: 2,
      placeholder: "Select growers",
      // One option per (item, grower) authorization; the dialog filters by the
      // chosen item and collapses the duplicate grower values that leaves.
      dependsOn: "itemId",
      options: auths.map((a) => ({
        label: growerName.get(a.growerId) ?? String(a.growerId),
        value: String(a.growerId),
        parent: a.itemId,
      })),
      description:
        "Only growers authorized for the selected item. Others would never see the message.",
    },
    {
      name: "vendorIds",
      label: "Vendors",
      type: "multiselect",
      showWhen: { audience: ["Selected"], recipients: ["Vendors", "Both"] },
      colSpan: 2,
      placeholder: "Select vendors",
      dependsOn: "itemId",
      options: itemVendors.map((m) => ({
        label: vendorName.get(m.vendorId) ?? String(m.vendorId),
        value: String(m.vendorId),
        parent: m.itemId,
      })),
      description: "Only vendors mapped to the selected item. Others would never see the message.",
    },
    { name: "body", label: "Note (optional — shown as typed)", type: "textarea", colSpan: 2 },
    {
      name: "bodyEs",
      label: "Spanish note",
      type: "textarea",
      colSpan: 2,
      translationOf: "body",
      description:
        "Leave blank to machine-translate the note on save; changing the English note re-translates it. Anything typed here is used as-is and marked reviewed. Spanish-language growers and vendors see this instead of the English note.",
    },
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
      key: "translation",
      header: "Español",
      className: "text-xs",
      cell: (r) => {
        if (!r.body) return <span className="text-muted-foreground">—</span>
        const es = r.translations.find((t) => t.locale === "es")
        if (!es)
          return (
            <Badge variant="outline" className="border-transparent bg-red-500/15 text-red-700 dark:text-red-400">
              Missing
            </Badge>
          )
        // Raw machine output nobody has checked. These notes drive behaviour
        // ("clear inventory"), so an unverified translation is worth flagging.
        return es.isMachine ? (
          <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400">
            <Languages className="mr-1 size-3" /> Auto
          </Badge>
        ) : (
          <Badge variant="secondary">Reviewed</Badge>
        )
      },
    },
    {
      key: "audience",
      header: "Audience",
      className: "text-xs",
      cell: (r) => {
        if (r.audience === "All")
          return r.recipients === "Vendors" ? "All vendors" : r.recipients === "Both" ? "All growers & vendors" : "All growers"
        const names = [
          ...r.targets.map((t) => growerName.get(t.growerId) ?? String(t.growerId)),
          ...r.vendorTargets.map((t) => vendorName.get(t.vendorId) ?? String(t.vendorId)),
        ]
        return (
          <div>
            <span className="text-muted-foreground">{recipientLabel(r.recipients)}:</span> {names.join(", ") || "— none —"}
          </div>
        )
      },
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
              recipients: r.recipients,
              audience: r.audience,
              body: r.body ?? "",
              bodyEs: r.translations.find((t) => t.locale === "es")?.body ?? "",
              growerIds: r.targets.map((t) => String(t.growerId)).join(","),
              vendorIds: r.vendorTargets.map((t) => String(t.vendorId)).join(","),
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
            confirmLabel="Delete" typeToConfirm
            action={deleteItemMessage.bind(null, r.id)}
            trigger={<Button variant="ghost" size="icon-sm" aria-label="Delete"><Trash2 /></Button>}
          />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Item messages" description="Notices shown under a specific item to growers, vendors or both — everyone mapped to the item, or a selected few." />
      <div className="space-y-4">
        <DataTableToolbar
          searchPlaceholder="Search item or note…"
          filters={[
            { key: "type", label: "Type", options: ITEM_MESSAGE_TYPES.map((t) => ({ label: ITEM_MESSAGE_TYPE_LABELS[t], value: t })) },
            { key: "recipients", label: "Show to", options: ITEM_MESSAGE_RECIPIENTS.map((r) => ({ label: recipientLabel(r), value: r })) },
            { key: "state", label: "State", options: [{ label: "Active", value: "active" }, { label: "Disabled", value: "disabled" }] },
          ]}
        >
          <EntityFormDialog
            title="New item message"
            fields={fields}
            action={createItemMessage}
            values={{ type: "Info", severity: "info", recipients: "Growers", audience: "All", isActive: "true", itemId: "", growerIds: "", vendorIds: "", body: "", bodyEs: "", startsAt: "", endsAt: "" }}
            submitLabel="Create"
            trigger={<Button size="sm"><Plus className="size-4" /> Add message</Button>}
          />
        </DataTableToolbar>
        <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
      </div>
    </>
  )
}
