import { formatDate } from "@/lib/dates"
import { CheckCircle2 } from "lucide-react"
import { type Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { parseListParams } from "@/lib/query"
import { reviewLowFlag } from "@/lib/actions/low-inventory"
import { currentOnHand, onHandKey } from "@/lib/inventory/on-hand"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { getLocale, getT } from "@/lib/i18n/server"

type Row = {
  id: number
  growerId: number
  itemId: string
  reason: string | null
  isActive: boolean
  createdAt: Date
  flaggedBy: number
  onHandAtFlag: Prisma.Decimal | null
  grower: { growerName: string }
  item: { itemName: string; materialCategory: { name: string } | null }
}

export default async function AdminLowInventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_GROWERS_VENDORS)
  const t = await getT()
  const locale = await getLocale()
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams)

  const and: Prisma.LowInventoryFlagWhereInput[] = []
  if (raw.q) and.push({ item: { itemName: { contains: raw.q } } })
  if (raw.grower) and.push({ growerId: Number(raw.grower) || 0 })
  // Default view is the review queue (awaiting review); admins can switch.
  if (raw.state === "reviewed") and.push({ isActive: false })
  else if (raw.state !== "all") and.push({ isActive: true })
  const where: Prisma.LowInventoryFlagWhereInput = and.length ? { AND: and } : {}

  const [rows, total, growers] = await Promise.all([
    prisma.lowInventoryFlag.findMany({
      where,
      include: { grower: true, item: { include: { materialCategory: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.lowInventoryFlag.count({ where }),
    prisma.grower.findMany({ orderBy: { growerName: "asc" } }),
  ])

  // flaggedBy is a plain audit column (no relation) — resolve names in one query.
  const flaggerIds = [...new Set(rows.map((r) => r.flaggedBy))]
  const flaggers = flaggerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: flaggerIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : []
  const flaggerById = new Map(flaggers.map((u) => [u.id, `${u.firstName} ${u.lastName}`]))

  // What the grower holds right now, so a flag can be judged without leaving the queue.
  const onHand = await currentOnHand(prisma, {
    growerIds: [...new Set(rows.map((r) => r.growerId))],
    itemIds: [...new Set(rows.map((r) => r.itemId))],
  })

  const reviewFields: Field[] = [
    { name: "reviewNotes", label: t("admin.lowInventory.reviewNotesOptional"), type: "textarea", colSpan: 2 },
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
    { key: "grower", header: t("admin.common.grower"), cell: (r) => r.grower.growerName },
    {
      key: "onHand",
      header: t("admin.lowInventory.currentOnHand"),
      cell: (r) => {
        const unit = r.item.materialCategory?.name ?? ""
        const now = onHand.get(onHandKey(r.growerId, r.itemId))
        if (!now) return <span className="text-muted-foreground text-xs">{t("admin.lowInventory.neverCounted")}</span>
        return (
          <div className="text-xs">
            <span className="text-sm font-medium tabular-nums">
              {now.total} {unit}
            </span>
            {/* Per site, so a low total can be traced to the location that is short. */}
            {now.byLocation.length > 1 && (
              <p className="text-muted-foreground">
                {now.byLocation.map((l) => `${l.locationName} ${l.quantity}`).join(" · ")}
              </p>
            )}
            <p className="text-muted-foreground">
              {t("admin.lowInventory.asOf", { date: formatDate(now.asOf, "MMM d", locale) })}
              {r.onHandAtFlag != null && ` · ${t("admin.lowInventory.whenFlagged", { qty: Number(r.onHandAtFlag) })}`}
            </p>
          </div>
        )
      },
    },
    { key: "by", header: t("admin.lowInventory.flaggedBy"), className: "text-muted-foreground text-xs", cell: (r) => flaggerById.get(r.flaggedBy) ?? "—" },
    { key: "reason", header: t("admin.lowInventory.reason"), className: "text-muted-foreground text-xs", cell: (r) => r.reason ?? "—" },
    {
      key: "state",
      header: t("admin.lowInventory.state"),
      cell: (r) =>
        r.isActive ? (
          <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400">
            {t("admin.lowInventory.awaitingReview")}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
            {t("status.Reviewed")}
          </Badge>
        ),
    },
    { key: "when", header: t("admin.lowInventory.when"), className: "text-muted-foreground whitespace-nowrap text-xs", cell: (r) => formatDate(r.createdAt, "MMM d", locale) },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) =>
        r.isActive ? (
          <EntityFormDialog
            title={t("admin.lowInventory.reviewFlagTitle")}
            description={`${r.item.itemName} — ${r.grower.growerName}`}
            fields={reviewFields}
            action={reviewLowFlag}
            values={{ id: r.id, reviewNotes: "" }}
            submitLabel={t("admin.lowInventory.reviewAndClear")}
            trigger={
              <Button variant="outline" size="xs">
                <CheckCircle2 className="size-3.5" /> {t("admin.lowInventory.review")}
              </Button>
            }
          />
        ) : null,
    },
  ]

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {t("admin.lowInventory.flagsIntro")}
      </p>
      <DataTableToolbar
        searchPlaceholder={t("admin.lowInventory.searchItem")}
        filters={[
          {
            key: "state",
            label: t("admin.lowInventory.state"),
            options: [
              { label: t("admin.lowInventory.awaitingReview"), value: "active" },
              { label: t("status.Reviewed"), value: "reviewed" },
              { label: t("common.all"), value: "all" },
            ],
          },
          { key: "grower", label: t("admin.common.grower"), options: growers.map((g) => ({ label: g.growerName, value: String(g.id) })) },
        ]}
      />
      <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
    </div>
  )
}
