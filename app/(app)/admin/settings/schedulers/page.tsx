import { Pencil, Plus, Trash2, Play, Send } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { CADENCE_TYPES, SCHEDULER_SCOPES } from "@/lib/constants"
import { cadenceDays } from "@/lib/scheduler/reminders"
import { getT } from "@/lib/i18n/server"
import {
  createScheduler,
  updateScheduler,
  deleteScheduler,
  runRemindersAction,
  flushEmailQueueAction,
} from "@/lib/actions/settings"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { ConfirmButton } from "@/components/crud/confirm-button"
import { ActionButton } from "@/components/action-button"
import { StatusBadge } from "@/components/status-badge"

type Row = {
  id: number
  scope: string
  growerId: number | null
  vendorId: number | null
  cadenceType: string
  thresholdDays: number
  isEnabled: boolean
  grower: { growerName: string } | null
  vendor: { vendorName: string } | null
}

const S = SCHEDULER_SCOPES

export default async function SchedulersPage() {
  await requireCapability(CAPABILITIES.ACCESS_SETTINGS)
  const t = await getT()
  const [rows, growers, vendors] = await Promise.all([
    prisma.schedulerSetting.findMany({ include: { grower: true, vendor: true }, orderBy: [{ scope: "asc" }, { id: "asc" }] }),
    prisma.grower.findMany({ orderBy: { growerName: "asc" } }),
    prisma.vendor.findMany({ orderBy: { vendorName: "asc" } }),
  ])

  const scopeOptions = [
    { label: t("admin.settings.schedulers.scopeGrowerDefault"), value: S.GROWER_DEFAULT },
    { label: t("admin.settings.schedulers.scopeGrower"), value: S.GROWER },
    { label: t("admin.settings.schedulers.scopeVendorDefault"), value: S.VENDOR_DEFAULT },
    { label: t("admin.settings.schedulers.scopeVendor"), value: S.VENDOR },
  ]

  const fields: Field[] = [
    { name: "scope", label: t("admin.settings.schedulers.whoReminds"), type: "select", required: true, options: scopeOptions, description: t("admin.settings.schedulers.whoRemindsHelp") },
    { name: "growerId", label: t("admin.common.grower"), type: "select", placeholder: t("admin.settings.schedulers.selectGrower"), options: growers.map((g) => ({ label: g.growerName, value: String(g.id) })), showWhen: { scope: [S.GROWER] } },
    { name: "vendorId", label: t("admin.common.vendor"), type: "select", placeholder: t("admin.settings.schedulers.selectVendor"), options: vendors.map((v) => ({ label: v.vendorName, value: String(v.id) })), showWhen: { scope: [S.VENDOR] } },
    { name: "cadenceType", label: t("admin.settings.schedulers.cadence"), type: "select", required: true, options: CADENCE_TYPES.map((c) => ({ label: t(`status.${c}`), value: c })) },
    // Only read when cadence is "AfterNDays" — the other cadences imply their
    // own tolerance (Daily 1, Weekly 7, Monthly 30). The description says so
    // rather than the field disappearing, so the stored value stays visible.
    { name: "thresholdDays", label: t("admin.settings.schedulers.remindAfterDays"), type: "number", required: true, step: "1", min: "1", description: t("admin.settings.schedulers.remindAfterDaysHelp") },
    { name: "isEnabled", label: t("admin.settings.schedulers.enabled"), type: "switch" },
  ]

  const columns: Column<Row>[] = [
    {
      key: "scope",
      header: t("admin.settings.schedulers.reminds"),
      cell: (r) =>
        r.scope === S.GROWER_DEFAULT ? <Badge variant="outline">{t("admin.settings.schedulers.allGrowers")}</Badge>
        : r.scope === S.VENDOR_DEFAULT ? <Badge variant="outline">{t("admin.settings.schedulers.allVendors")}</Badge>
        : r.scope === S.VENDOR ? <Badge variant="secondary">{t("admin.settings.schedulers.vendorBadge", { name: r.vendor?.vendorName ?? "—" })}</Badge>
        : <Badge variant="secondary">{t("admin.settings.schedulers.growerBadge", { name: r.grower?.growerName ?? "—" })}</Badge>,
    },
    { key: "cadence", header: t("admin.settings.schedulers.cadence"), cell: (r) => <StatusBadge status={r.cadenceType} /> },
    // Show the tolerance actually in force, not the raw column, so a Weekly row
    // with thresholdDays=3 no longer reads as if it reminds after three days.
    { key: "days", header: t("admin.settings.schedulers.overdueAfter"), className: "tabular-nums", cell: (r) => t("admin.settings.schedulers.daysValue", { count: cadenceDays(r) }) },
    { key: "enabled", header: t("admin.settings.schedulers.enabled"), cell: (r) => <StatusBadge status={r.isEnabled ? "Yes" : "No"} /> },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog title={t("admin.settings.schedulers.editSchedule")} fields={fields} action={updateScheduler} values={{ id: r.id, scope: r.scope, growerId: r.growerId ? String(r.growerId) : "", vendorId: r.vendorId ? String(r.vendorId) : "", cadenceType: r.cadenceType, thresholdDays: r.thresholdDays, isEnabled: r.isEnabled }} submitLabel={t("admin.common.saveChanges")} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("admin.common.edit")}><Pencil /></Button>} />
          <ConfirmButton title={t("admin.settings.schedulers.deleteSchedule")} description={t("admin.settings.schedulers.deleteConfirm")} confirmLabel={t("admin.common.delete")} typeToConfirm action={deleteScheduler.bind(null, r.id)} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("admin.common.delete")}><Trash2 /></Button>} />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader title={t("admin.settings.schedulers.title")} description={t("admin.settings.schedulers.description")}>
        <ActionButton action={runRemindersAction} variant="default" size="sm">
          <Play className="size-4" /> {t("admin.settings.schedulers.runNow")}
        </ActionButton>
        <ActionButton action={flushEmailQueueAction} variant="outline" size="sm">
          <Send className="size-4" /> {t("admin.settings.schedulers.sendQueued")}
        </ActionButton>
        <EntityFormDialog title={t("admin.settings.schedulers.newSchedule")} fields={fields} action={createScheduler} values={{ scope: S.GROWER_DEFAULT, cadenceType: "AfterNDays", thresholdDays: 3, isEnabled: true }} submitLabel={t("admin.common.create")} trigger={<Button size="sm" variant="outline"><Plus className="size-4" /> {t("admin.settings.schedulers.addSchedule")}</Button>} />
      </PageHeader>

      <Card className="mb-4 py-0">
        <CardContent className="text-muted-foreground p-4 text-sm">
          {t("admin.settings.schedulers.note.intro", { run: t("admin.settings.schedulers.runNow") })}{" "}
          {t("admin.settings.schedulers.note.before")} <em>{t("admin.settings.schedulers.note.queues")}</em>{" "}
          {t("admin.settings.schedulers.note.middle")}{" "}
          <a className="text-primary hover:underline" href="/admin/settings/outbox">{t("nav.outbox")}</a>{" "}
          {t("admin.settings.schedulers.note.after", { send: t("admin.settings.schedulers.sendQueued") })}
        </CardContent>
      </Card>

      <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={1} pageCount={1} total={rows.length} searchParams={{}} />
    </>
  )
}
