import { formatDistanceToNow } from "date-fns"
import { Plus } from "lucide-react"
import { requireRole } from "@/lib/auth/session"
import { ROLES } from "@/lib/constants"
import { prisma } from "@/lib/db"
import { createMissingItemRequest } from "@/lib/actions/grower"
import { parseListParams } from "@/lib/query"
import { getT } from "@/lib/i18n/server"
import { PageHeader } from "@/components/page-header"
import { Pager } from "@/components/pager"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { StatusBadge } from "@/components/status-badge"

export default async function GrowerRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireRole([ROLES.GROWER_USER])
  if (!user.growerId) return <p className="text-sm">Your account is not mapped to a grower.</p>

  const t = await getT()
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams, { pageSize: 10 })
  // Previously an unbounded findMany — this list only grows.
  const where = { growerId: user.growerId }
  const [requests, total] = await Promise.all([
    prisma.missingItemRequest.findMany({
      where,
      include: { requester: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.missingItemRequest.count({ where }),
  ])

  const fields: Field[] = [
    { name: "itemName", label: t("grower.requests.itemName"), type: "text", required: true, colSpan: 2, placeholder: t("grower.requests.itemNamePh") },
    { name: "commodityHint", label: t("grower.requests.commodity"), type: "text" },
    { name: "categoryHint", label: t("grower.requests.category"), type: "text" },
    { name: "notes", label: t("grower.requests.notes"), type: "textarea" },
  ]

  return (
    <>
      <PageHeader
        title={t("grower.requests.title")}
        description={t("grower.requests.description")}
      >
        <EntityFormDialog
          title={t("grower.requests.dialogTitle")}
          description={t("grower.requests.dialogDesc")}
          fields={fields}
          action={createMissingItemRequest}
          submitLabel={t("grower.requests.submitRequest")}
          trigger={<Button size="sm"><Plus className="size-4" /> {t("grower.requests.newRequest")}</Button>}
        />
      </PageHeader>

      <div className="grid gap-3">
        {requests.length === 0 && (
          <Card><CardContent className="text-muted-foreground p-6 text-sm">{t("grower.requests.none")}</CardContent></Card>
        )}
        {requests.map((r) => (
          <Card key={r.id} className="py-0">
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.itemName}</span>
                  <StatusBadge status={r.status} label={t(`status.${r.status}`)} />
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {[r.commodityHint, r.categoryHint].filter(Boolean).join(" · ") || t("grower.requests.noHints")}
                  {r.notes ? ` — ${r.notes}` : ""}
                </p>
                {r.reviewNotes && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t("grower.requests.admin")}: {r.reviewNotes}
                  </p>
                )}
              </div>
              <span className="text-muted-foreground shrink-0 text-xs">
                {formatDistanceToNow(r.createdAt, { addSuffix: true })}
              </span>
            </CardContent>
          </Card>
        ))}
        <Pager
          page={page}
          pageCount={Math.ceil(total / pageSize)}
          total={total}
          searchParams={raw}
        />
      </div>
    </>
  )
}
