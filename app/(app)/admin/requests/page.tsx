import { formatDate } from "@/lib/dates"
import { Pencil } from "lucide-react"
import { type Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { parseListParams } from "@/lib/query"
import { REQUEST_STATUSES } from "@/lib/constants"
import { reviewRequest } from "@/lib/actions/requests"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { StatusBadge } from "@/components/status-badge"
import { getLocale, getT } from "@/lib/i18n/server"

type Row = {
  id: number
  itemName: string
  commodityHint: string | null
  categoryHint: string | null
  notes: string | null
  status: string
  reviewNotes: string | null
  createdAt: Date
  grower: { growerName: string }
  requester: { firstName: string; lastName: string }
}

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_GROWERS_VENDORS)
  const t = await getT()
  const locale = await getLocale()
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams)

  const and: Prisma.MissingItemRequestWhereInput[] = []
  if (raw.q) and.push({ itemName: { contains: raw.q } })
  if (raw.status) and.push({ status: raw.status })
  if (raw.grower) and.push({ growerId: Number(raw.grower) || 0 })
  const where: Prisma.MissingItemRequestWhereInput = and.length ? { AND: and } : {}

  const [rows, total, growers] = await Promise.all([
    prisma.missingItemRequest.findMany({ where, include: { grower: true, requester: true }, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.missingItemRequest.count({ where }),
    prisma.grower.findMany({ orderBy: { growerName: "asc" } }),
  ])

  const statusOptions = REQUEST_STATUSES.map((s) => ({ label: t(`status.${s}`), value: s }))
  const fields: Field[] = [
    { name: "status", label: t("admin.common.status"), type: "select", required: true, colSpan: 2, options: statusOptions },
    { name: "reviewNotes", label: t("admin.requests.reviewNotes"), type: "textarea", colSpan: 2 },
  ]

  const columns: Column<Row>[] = [
    { key: "item", header: t("admin.requests.requestedItem"), cell: (r) => <span className="font-medium">{r.itemName}</span> },
    { key: "grower", header: t("admin.common.grower"), cell: (r) => r.grower.growerName },
    { key: "by", header: t("admin.requests.by"), cell: (r) => `${r.requester.firstName} ${r.requester.lastName}` },
    { key: "hints", header: t("admin.requests.hints"), className: "text-xs text-muted-foreground", cell: (r) => [r.commodityHint, r.categoryHint].filter(Boolean).join(" · ") || "—" },
    { key: "status", header: t("admin.common.status"), cell: (r) => <StatusBadge status={r.status} /> },
    { key: "when", header: t("admin.requests.when"), className: "whitespace-nowrap text-xs text-muted-foreground", cell: (r) => formatDate(r.createdAt, "MMM d", locale) },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <EntityFormDialog
          title={t("admin.requests.reviewTitle")}
          description={`${r.itemName} — ${r.grower.growerName}`}
          fields={fields}
          action={reviewRequest}
          values={{ id: r.id, status: r.status, reviewNotes: r.reviewNotes ?? "" }}
          submitLabel={t("common.save")}
          trigger={<Button variant="ghost" size="icon-sm" aria-label={t("admin.requests.review")}><Pencil /></Button>}
        />
      ),
    },
  ]

  return (
    <>
      <PageHeader title={t("admin.requests.title")} description={t("admin.requests.description")} />
      <div className="space-y-4">
        <DataTableToolbar
          searchPlaceholder={t("admin.requests.searchPlaceholder")}
          filters={[
            { key: "status", label: t("admin.common.status"), options: statusOptions },
            { key: "grower", label: t("admin.common.grower"), options: growers.map((g) => ({ label: g.growerName, value: String(g.id) })) },
          ]}
        />
        <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
      </div>
    </>
  )
}
