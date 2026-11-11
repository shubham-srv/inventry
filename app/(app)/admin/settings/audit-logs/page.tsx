import { formatDate } from "@/lib/dates"
import { type Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { parseListParams } from "@/lib/query"
import { AUDIT_ACTIONS } from "@/lib/constants"
import { getLocale, getT } from "@/lib/i18n/server"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"

const ENTITY_TYPES = [
  "Item", "Commodity", "MaterialCategory", "SubCategory", "Location",
  "Grower", "Vendor", "User", "GrowerItemAuthorization", "PackagingChain",
  "ItemThreshold", "SchedulerSetting", "MasterData",
]

type Row = {
  id: number
  createdAt: Date
  action: string
  entityType: string
  entityId: string | null
  changes: string | null
  user: { firstName: string; lastName: string }
}

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.ACCESS_SETTINGS)
  const t = await getT()
  const locale = await getLocale()
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams, { pageSize: 20 })

  const and: Prisma.AuditLogWhereInput[] = []
  if (raw.q) and.push({ OR: [{ entityId: { contains: raw.q } }, { entityType: { contains: raw.q } }] })
  if (raw.entity) and.push({ entityType: raw.entity })
  if (raw.action) and.push({ action: raw.action })
  const where: Prisma.AuditLogWhereInput = and.length ? { AND: and } : {}

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, include: { user: true }, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.auditLog.count({ where }),
  ])

  // Unknown values show as stored.
  const label = (group: "actions" | "entities", value: string) => {
    const key = `admin.settings.auditLogs.${group}.${value}`
    const text = t(key)
    return text === key ? value : text
  }

  const columns: Column<Row>[] = [
    { key: "time", header: t("admin.settings.auditLogs.when"), className: "whitespace-nowrap text-xs text-muted-foreground", cell: (r) => formatDate(r.createdAt, "MMM d, HH:mm", locale) },
    { key: "user", header: t("admin.settings.auditLogs.user"), cell: (r) => `${r.user.firstName} ${r.user.lastName}` },
    { key: "action", header: t("admin.settings.auditLogs.action"), cell: (r) => <Badge variant="outline">{label("actions", r.action)}</Badge> },
    { key: "entity", header: t("admin.settings.auditLogs.entity"), cell: (r) => <span className="font-medium">{label("entities", r.entityType)}</span> },
    { key: "entityId", header: t("admin.settings.auditLogs.id"), className: "font-mono text-xs", cell: (r) => r.entityId ?? "—" },
    { key: "changes", header: t("admin.settings.auditLogs.changes"), className: "max-w-xs", cell: (r) => <span className="text-muted-foreground line-clamp-1 text-xs">{r.changes ?? "—"}</span> },
  ]

  return (
    <>
      <PageHeader title={t("admin.settings.auditLogs.title")} description={t("admin.settings.auditLogs.description")} />
      <div className="space-y-4">
        <DataTableToolbar
          searchPlaceholder={t("admin.settings.auditLogs.searchPlaceholder")}
          filters={[
            { key: "action", label: t("admin.settings.auditLogs.action"), options: [...Object.values(AUDIT_ACTIONS), "RunReminders"].map((a) => ({ label: label("actions", a), value: a })) },
            { key: "entity", label: t("admin.settings.auditLogs.entity"), options: ENTITY_TYPES.map((e) => ({ label: label("entities", e), value: e })) },
          ]}
        />
        <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} emptyMessage={t("admin.settings.auditLogs.empty")} />
      </div>
    </>
  )
}
