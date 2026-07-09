import { format } from "date-fns"
import { type Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { parseListParams } from "@/lib/query"
import { AUDIT_ACTIONS } from "@/lib/constants"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"

const ENTITY_TYPES = [
  "Item", "Commodity", "MaterialCategory", "SubCategory", "Location",
  "Grower", "Vendor", "User", "GrowerItemAuthorization", "UnitConversion",
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

  const columns: Column<Row>[] = [
    { key: "time", header: "When", className: "whitespace-nowrap text-xs text-muted-foreground", cell: (r) => format(r.createdAt, "MMM d, HH:mm") },
    { key: "user", header: "User", cell: (r) => `${r.user.firstName} ${r.user.lastName}` },
    { key: "action", header: "Action", cell: (r) => <Badge variant="outline">{r.action}</Badge> },
    { key: "entity", header: "Entity", cell: (r) => <span className="font-medium">{r.entityType}</span> },
    { key: "entityId", header: "ID", className: "font-mono text-xs", cell: (r) => r.entityId ?? "—" },
    { key: "changes", header: "Changes", className: "max-w-xs", cell: (r) => <span className="text-muted-foreground line-clamp-1 text-xs">{r.changes ?? "—"}</span> },
  ]

  return (
    <>
      <PageHeader title="Audit logs" description="Every create / update / delete / export by internal users." />
      <div className="space-y-4">
        <DataTableToolbar
          searchPlaceholder="Search entity / id…"
          filters={[
            { key: "action", label: "Action", options: [...Object.values(AUDIT_ACTIONS), "RunReminders"].map((a) => ({ label: a, value: a })) },
            { key: "entity", label: "Entity", options: ENTITY_TYPES.map((e) => ({ label: e, value: e })) },
          ]}
        />
        <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} emptyMessage="No audit entries match your filters." />
      </div>
    </>
  )
}
