import { formatDate } from "@/lib/dates"
import { Flag } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { parseListParams } from "@/lib/query"
import { getCurrentlyLow, type CurrentlyLowRow } from "@/lib/admin/low-inventory"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { getLocale, getT } from "@/lib/i18n/server"

export default async function CurrentlyLowPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_GROWERS_VENDORS)
  const t = await getT()
  const locale = await getLocale()
  const { raw } = parseListParams(await searchParams)

  const [rows, growers] = await Promise.all([
    getCurrentlyLow({
      growerId: raw.grower ? Number(raw.grower) || undefined : undefined,
      q: raw.q || undefined,
    }),
    prisma.grower.findMany({ orderBy: { growerName: "asc" } }),
  ])

  const columns: Column<CurrentlyLowRow>[] = [
    {
      key: "item",
      header: t("admin.common.item"),
      cell: (r) => (
        <div>
          <span className="font-medium">{r.itemName}</span>
          <p className="text-muted-foreground font-mono text-xs">{r.itemId}</p>
        </div>
      ),
    },
    { key: "grower", header: t("admin.common.grower"), cell: (r) => r.growerName },
    {
      key: "level",
      header: t("admin.lowInventory.onHandVsThreshold"),
      cell: (r) => {
        const pct = r.threshold > 0 ? Math.min(100, (r.onHand / r.threshold) * 100) : 0
        return (
          <div className="min-w-40">
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium tabular-nums">
                {r.onHand} / {r.threshold} {r.categoryName ?? ""}
              </span>
              <span className="text-muted-foreground tabular-nums">{Math.round(pct)}%</span>
            </div>
            <Progress value={pct} />
          </div>
        )
      },
    },
    {
      key: "scope",
      header: t("admin.lowInventory.threshold"),
      cell: (r) => (
        <Badge variant={r.thresholdScope === "Grower" ? "outline" : "secondary"}>
          {r.thresholdScope === "Grower" ? t("admin.lowInventory.growerOverride") : t("admin.lowInventory.global")}
        </Badge>
      ),
    },
    {
      key: "flagged",
      header: t("admin.lowInventory.flagged"),
      cell: (r) =>
        r.flagged ? (
          <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400">
            <Flag className="mr-1 size-3" /> {t("admin.lowInventory.raised")}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
    {
      key: "asOf",
      header: t("admin.lowInventory.lastCounted"),
      className: "text-muted-foreground whitespace-nowrap text-xs",
      cell: (r) => formatDate(r.asOf, "MMM d", locale),
    },
  ]

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {t("admin.lowInventory.currentIntro")}
      </p>
      <DataTableToolbar
        searchPlaceholder={t("admin.lowInventory.searchItemIdName")}
        filters={[
          { key: "grower", label: t("admin.common.grower"), options: growers.map((g) => ({ label: g.growerName, value: String(g.id) })) },
        ]}
      />
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => `${r.growerId}:${r.itemId}`}
        page={1}
        pageCount={1}
        total={rows.length}
        searchParams={raw}
      />
    </div>
  )
}
