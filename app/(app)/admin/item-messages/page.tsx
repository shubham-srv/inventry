import { formatDate, toDayInput } from "@/lib/dates"
import { Pencil, Plus, Trash2, Languages } from "lucide-react"
import { type Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { ACTIVE_ITEM } from "@/lib/items/active"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { parseListParams } from "@/lib/query"
import {
  ITEM_MESSAGE_TYPES,
  ITEM_MESSAGE_SEVERITIES,
  ITEM_MESSAGE_RECIPIENTS,
} from "@/lib/constants"
import { createItemMessage, updateItemMessage, deleteItemMessage } from "@/lib/actions/item-messages"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { ConfirmButton } from "@/components/crud/confirm-button"
import { getLocale, getT } from "@/lib/i18n/server"

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
const toDateInput = (d: Date | null) => (d ? toDayInput(d) : "")

export default async function AdminItemMessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_GROWERS_VENDORS)
  const t = await getT()
  const locale = await getLocale()
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
  // Unknown values show as stored.
  const label = (key: string, fallback: string) => {
    const v = t(key)
    return v === key ? fallback : v
  }
  const recipientLabel = (r: string) => label(`admin.itemMessages.recipient.${r}`, r)
  const typeLabel = (v: string) => label(`itemMessage.type.${v}`, v)
  const severityLabel = (s: string) => label(`admin.itemMessages.severity.${s}`, cap(s))

  const fields: Field[] = [
    { name: "itemId", label: t("admin.common.item"), type: "select", required: true, colSpan: 2, placeholder: t("admin.itemMessages.selectItem"), options: items.map((i) => ({ label: `${i.id} — ${i.itemName}`, value: i.id })) },
    { name: "type", label: t("admin.common.type"), type: "select", required: true, options: ITEM_MESSAGE_TYPES.map((v) => ({ label: typeLabel(v), value: v })) },
    { name: "severity", label: t("admin.itemMessages.severityLabel"), type: "select", required: true, options: ITEM_MESSAGE_SEVERITIES.map((s) => ({ label: severityLabel(s), value: s })) },
    { name: "recipients", label: t("admin.itemMessages.showTo"), type: "select", required: true, options: ITEM_MESSAGE_RECIPIENTS.map((r) => ({ label: recipientLabel(r), value: r })) },
    { name: "audience", label: t("admin.itemMessages.audience"), type: "select", required: true, options: [{ label: t("admin.itemMessages.audienceAll"), value: "All" }, { label: t("admin.itemMessages.audienceSelected"), value: "Selected" }] },
    {
      name: "growerIds",
      label: t("nav.growers"),
      type: "multiselect",
      showWhen: { audience: ["Selected"], recipients: ["Growers", "Both"] },
      colSpan: 2,
      placeholder: t("admin.itemMessages.selectGrowers"),
      // One option per (item, grower) authorization; the dialog filters by the
      // chosen item and collapses the duplicate grower values that leaves.
      dependsOn: "itemId",
      options: auths.map((a) => ({
        label: growerName.get(a.growerId) ?? String(a.growerId),
        value: String(a.growerId),
        parent: a.itemId,
      })),
      description: t("admin.itemMessages.growersHint"),
    },
    {
      name: "vendorIds",
      label: t("nav.vendors"),
      type: "multiselect",
      showWhen: { audience: ["Selected"], recipients: ["Vendors", "Both"] },
      colSpan: 2,
      placeholder: t("admin.itemMessages.selectVendors"),
      dependsOn: "itemId",
      options: itemVendors.map((m) => ({
        label: vendorName.get(m.vendorId) ?? String(m.vendorId),
        value: String(m.vendorId),
        parent: m.itemId,
      })),
      description: t("admin.itemMessages.vendorsHint"),
    },
    { name: "body", label: t("admin.itemMessages.note"), type: "textarea", colSpan: 2 },
    {
      name: "bodyEs",
      label: t("admin.itemMessages.spanishNote"),
      type: "textarea",
      colSpan: 2,
      translationOf: "body",
      description: t("admin.itemMessages.spanishNoteHint"),
    },
    { name: "startsAt", label: t("admin.itemMessages.starts"), type: "date" },
    { name: "endsAt", label: t("admin.itemMessages.ends"), type: "date" },
    { name: "isActive", label: t("admin.itemMessages.state"), type: "select", required: true, options: [{ label: t("admin.common.active"), value: "true" }, { label: t("admin.itemMessages.disabled"), value: "false" }] },
  ]

  const columns: Column<Row>[] = [
    {
      key: "item",
      header: t("admin.common.item"),
      cell: (r) => (
        <div>
          <span className="font-medium">{r.item.itemName}</span>
          <p className="text-muted-foreground font-mono text-xs">{r.itemId}</p>
        </div>
      ),
    },
    { key: "type", header: t("admin.common.type"), cell: (r) => typeLabel(r.type) },
    {
      key: "severity",
      header: t("admin.itemMessages.severityLabel"),
      cell: (r) => (
        <Badge variant="outline" className={`border-transparent ${SEVERITY_STYLES[r.severity] ?? ""}`}>
          {severityLabel(r.severity)}
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
              {t("admin.itemMessages.translationMissing")}
            </Badge>
          )
        // Raw machine output nobody has checked. These notes drive behaviour
        // ("clear inventory"), so an unverified translation is worth flagging.
        return es.isMachine ? (
          <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400">
            <Languages className="mr-1 size-3" /> {t("admin.itemMessages.translationAuto")}
          </Badge>
        ) : (
          <Badge variant="secondary">{t("admin.itemMessages.translationReviewed")}</Badge>
        )
      },
    },
    {
      key: "audience",
      header: t("admin.itemMessages.audience"),
      className: "text-xs",
      cell: (r) => {
        if (r.audience === "All")
          return r.recipients === "Vendors" ? t("admin.itemMessages.allVendors") : r.recipients === "Both" ? t("admin.itemMessages.allGrowersVendors") : t("admin.itemMessages.allGrowers")
        const names = [
          ...r.targets.map((t) => growerName.get(t.growerId) ?? String(t.growerId)),
          ...r.vendorTargets.map((t) => vendorName.get(t.vendorId) ?? String(t.vendorId)),
        ]
        return (
          <div>
            <span className="text-muted-foreground">{recipientLabel(r.recipients)}:</span> {names.join(", ") || t("admin.itemMessages.noneSelected")}
          </div>
        )
      },
    },
    {
      key: "window",
      header: t("admin.itemMessages.window"),
      className: "text-muted-foreground whitespace-nowrap text-xs",
      cell: (r) =>
        r.startsAt || r.endsAt
          ? `${r.startsAt ? formatDate(r.startsAt, "MMM d", locale) : "…"} – ${r.endsAt ? formatDate(r.endsAt, "MMM d", locale) : "…"}`
          : t("admin.itemMessages.always"),
    },
    {
      key: "state",
      header: t("admin.itemMessages.state"),
      cell: (r) =>
        r.isActive ? (
          <Badge variant="outline" className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">{t("admin.common.active")}</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">{t("admin.itemMessages.disabled")}</Badge>
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
            title={t("admin.itemMessages.editTitle")}
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
            submitLabel={t("admin.common.saveChanges")}
            trigger={<Button variant="ghost" size="icon-sm" aria-label={t("admin.common.edit")}><Pencil /></Button>}
          />
          <ConfirmButton
            title={t("admin.itemMessages.deleteTitle")}
            description={t("admin.itemMessages.deleteDesc", { type: typeLabel(r.type), item: r.item.itemName })}
            confirmLabel={t("admin.common.delete")} typeToConfirm
            action={deleteItemMessage.bind(null, r.id)}
            trigger={<Button variant="ghost" size="icon-sm" aria-label={t("admin.common.delete")}><Trash2 /></Button>}
          />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader title={t("admin.itemMessages.title")} description={t("admin.itemMessages.description")} />
      <div className="space-y-4">
        <DataTableToolbar
          searchPlaceholder={t("admin.itemMessages.searchPlaceholder")}
          filters={[
            { key: "type", label: t("admin.common.type"), options: ITEM_MESSAGE_TYPES.map((v) => ({ label: typeLabel(v), value: v })) },
            { key: "recipients", label: t("admin.itemMessages.showTo"), options: ITEM_MESSAGE_RECIPIENTS.map((r) => ({ label: recipientLabel(r), value: r })) },
            { key: "state", label: t("admin.itemMessages.state"), options: [{ label: t("admin.common.active"), value: "active" }, { label: t("admin.itemMessages.disabled"), value: "disabled" }] },
          ]}
        >
          <EntityFormDialog
            title={t("admin.itemMessages.newTitle")}
            fields={fields}
            action={createItemMessage}
            values={{ type: "Info", severity: "info", recipients: "Growers", audience: "All", isActive: "true", itemId: "", growerIds: "", vendorIds: "", body: "", bodyEs: "", startsAt: "", endsAt: "" }}
            submitLabel={t("admin.common.create")}
            trigger={<Button size="sm"><Plus className="size-4" /> {t("admin.itemMessages.addMessage")}</Button>}
          />
        </DataTableToolbar>
        <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
      </div>
    </>
  )
}
