import { Pencil, Plus, Trash2, Play } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { CADENCE_TYPES } from "@/lib/constants"
import {
  createScheduler,
  updateScheduler,
  deleteScheduler,
  runRemindersAction,
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
  cadenceType: string
  thresholdDays: number
  reminderFrequency: string
  isEnabled: boolean
  grower: { growerName: string } | null
}

export default async function SchedulersPage() {
  await requireCapability(CAPABILITIES.ACCESS_SETTINGS)
  const [rows, growers] = await Promise.all([
    prisma.schedulerSetting.findMany({ include: { grower: true }, orderBy: [{ scope: "asc" }, { id: "asc" }] }),
    prisma.grower.findMany({ orderBy: { growerName: "asc" } }),
  ])

  const fields: Field[] = [
    { name: "scope", label: "Scope", type: "select", required: true, options: [{ label: "Global", value: "Global" }, { label: "Grower-specific", value: "Grower" }] },
    { name: "growerId", label: "Grower (if grower-scoped)", type: "select", placeholder: "Select grower", options: growers.map((g) => ({ label: g.growerName, value: String(g.id) })) },
    { name: "cadenceType", label: "Cadence", type: "select", required: true, options: CADENCE_TYPES.map((c) => ({ label: c, value: c })) },
    { name: "thresholdDays", label: "Remind after N days", type: "number", required: true, step: "1", description: "Days without a submission before reminders start" },
    { name: "reminderFrequency", label: "Reminder frequency", type: "select", required: true, options: [{ label: "Daily", value: "Daily" }, { label: "Weekly", value: "Weekly" }] },
    { name: "isEnabled", label: "Enabled", type: "switch" },
  ]

  const columns: Column<Row>[] = [
    { key: "scope", header: "Scope", cell: (r) => (r.scope === "Global" ? <Badge variant="outline">Global</Badge> : <Badge variant="secondary">{r.grower?.growerName ?? "Grower"}</Badge>) },
    { key: "cadence", header: "Cadence", cell: (r) => <StatusBadge status={r.cadenceType} /> },
    { key: "days", header: "After (days)", className: "tabular-nums", cell: (r) => r.thresholdDays },
    { key: "freq", header: "Frequency", cell: (r) => r.reminderFrequency },
    { key: "enabled", header: "Enabled", cell: (r) => <StatusBadge status={r.isEnabled ? "Yes" : "No"} /> },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog title="Edit schedule" fields={fields} action={updateScheduler} values={{ id: r.id, scope: r.scope, growerId: r.growerId ? String(r.growerId) : "", cadenceType: r.cadenceType, thresholdDays: r.thresholdDays, reminderFrequency: r.reminderFrequency, isEnabled: r.isEnabled }} submitLabel="Save changes" trigger={<Button variant="ghost" size="icon-sm" aria-label="Edit"><Pencil /></Button>} />
          <ConfirmButton title="Delete schedule" description="Delete this schedule?" confirmLabel="Delete" typeToConfirm action={deleteScheduler.bind(null, r.id)} trigger={<Button variant="ghost" size="icon-sm" aria-label="Delete"><Trash2 /></Button>} />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Email schedulers" description="Reminder cadences for growers who haven't submitted. Per-grower schedules override the global default.">
        <ActionButton action={runRemindersAction} variant="default" size="sm">
          <Play className="size-4" /> Run reminder check now
        </ActionButton>
        <EntityFormDialog title="New schedule" fields={fields} action={createScheduler} submitLabel="Create" trigger={<Button size="sm" variant="outline"><Plus className="size-4" /> Add schedule</Button>} />
      </PageHeader>

      <Card className="mb-4 py-0">
        <CardContent className="text-muted-foreground p-4 text-sm">
          &ldquo;Run reminder check now&rdquo; executes the same logic the Azure Function runs on a timer. Reminders are written to the{" "}
          <a className="text-primary hover:underline" href="/admin/settings/outbox">Outbox</a> (one per overdue grower per day).
        </CardContent>
      </Card>

      <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={1} pageCount={1} total={rows.length} searchParams={{}} />
    </>
  )
}
