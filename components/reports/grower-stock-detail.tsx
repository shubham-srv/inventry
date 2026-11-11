import { formatDate } from "@/lib/dates"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { NotesCell } from "@/components/data-table/notes-cell"
import { getLocale, getT } from "@/lib/i18n/server"
import {
  getGrowerStockDetail,
  type InventorySnapshotRow,
  type SnapshotFilters,
} from "@/lib/admin/inventory-snapshot"

export const STOCK_STATUS_TONE: Record<InventorySnapshotRow["state"], string> = {
  Uncounted: "text-muted-foreground",
  Zero: "border-transparent bg-red-500/15 text-red-700 dark:text-red-400",
  Low: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
  OK: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
}

/**
 * One grower's items, opened under its row in the grower-stock report: on hand
 * per location (each site's last submission in its header), the total, and
 * what is on order — under the same filters as the table above it.
 */
export async function GrowerStockDetail({
  growerId,
  filters,
}: {
  growerId: number
  filters: SnapshotFilters
}) {
  const t = await getT()
  const locale = await getLocale()
  const { locations, rows } = await getGrowerStockDetail(growerId, filters)
  if (rows.length === 0)
    return <p className="text-muted-foreground px-1 text-sm">{t("admin.reports.noItemsMatch")}</p>

  const dash = <span className="text-muted-foreground">—</span>

  return (
    <div className="bg-background overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("admin.common.item")}</TableHead>
            <TableHead>{t("admin.reports.legacyId")}</TableHead>
            <TableHead>{t("admin.common.category")}</TableHead>
            {locations.map((l) => (
              <TableHead key={l.locationId} className="text-right">
                <div className="leading-tight">
                  {l.locationName}
                  <p className="text-muted-foreground text-[10px] font-normal">
                    {l.lastSubmittedAt
                      ? t("admin.reports.growerStock.lastLocation", {
                          date: formatDate(l.lastSubmittedAt, "MMM d HH:mm", locale),
                        })
                      : t("admin.reports.growerStock.neverSubmitted")}
                  </p>
                </div>
              </TableHead>
            ))}
            <TableHead className="text-right">{t("admin.reports.onHand")}</TableHead>
            <TableHead className="text-right">{t("admin.reports.onOrder")}</TableHead>
            <TableHead>{t("admin.reports.threshold")}</TableHead>
            <TableHead>{t("admin.common.status")}</TableHead>
            <TableHead>{t("admin.reports.lastCounted")}</TableHead>
            <TableHead>{t("admin.common.notes")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.itemId}>
              <TableCell>
                <span className="font-medium">{r.itemName}</span>
                <p className="text-muted-foreground font-mono text-xs">{r.itemId}</p>
              </TableCell>
              <TableCell className="font-mono text-xs">{r.legacyId ?? dash}</TableCell>
              <TableCell className="text-xs">
                {r.categoryName ?? "—"}
                <p className="text-muted-foreground">{r.commodityName ?? ""}</p>
              </TableCell>
              {locations.map((l) => {
                const c = r.byLocation.get(l.locationId)
                return (
                  <TableCell key={l.locationId} className="text-right tabular-nums">
                    {c ? c.quantity : dash}
                  </TableCell>
                )
              })}
              <TableCell className="text-right font-medium tabular-nums">
                {r.onHand == null ? <span className="text-muted-foreground text-xs">{t("admin.reports.growerStock.neverCounted")}</span> : `${r.onHand} ${r.categoryName ?? ""}`}
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.onOrder > 0 ? r.onOrder : dash}</TableCell>
              <TableCell className="text-xs tabular-nums">
                {r.threshold == null ? (
                  dash
                ) : (
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    {r.threshold}
                    <Badge variant={r.thresholdScope === "Grower" ? "secondary" : "outline"}>
                      {r.thresholdScope === "Grower"
                        ? t("admin.reports.growerStock.override")
                        : t("admin.reports.growerStock.global")}
                    </Badge>
                  </span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={`whitespace-nowrap ${STOCK_STATUS_TONE[r.state]}`}>
                  {t(`admin.reports.stock.${r.state}`)}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                {r.asOf ? formatDate(r.asOf, "MMM d", locale) : "—"}
              </TableCell>
              <TableCell>
                <NotesCell notes={r.notes} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
