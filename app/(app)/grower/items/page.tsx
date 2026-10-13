import { format } from "date-fns"
import { Download } from "lucide-react"
import { requireRole } from "@/lib/auth/session"
import { ROLES } from "@/lib/constants"
import { getLocale, getT } from "@/lib/i18n/server"
import { parseListParams } from "@/lib/query"
import { getGrowerItems } from "@/lib/grower/items"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { NotesCell } from "@/components/data-table/notes-cell"
import { ItemImage } from "@/components/item-image"

/**
 * Every item this grower works with, what they hold of it at each location,
 * and what is on order — exportable to Excel with the same numbers.
 */
export default async function GrowerItemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireRole([ROLES.GROWER_USER])
  if (!user.growerId) return <p className="text-sm">Your account is not mapped to a grower.</p>

  const [t, locale] = await Promise.all([getT(), getLocale()])
  const { raw } = parseListParams(await searchParams)
  const { locations, rows } = await getGrowerItems(user.growerId, locale, raw.q)
  const dash = <span className="text-muted-foreground">—</span>
  const exportHref = `/grower/items/export${raw.q ? `?q=${encodeURIComponent(raw.q)}` : ""}`

  return (
    <>
      <PageHeader title={t("grower.items.title")} description={t("grower.items.description")}>
        <Button asChild size="sm" variant="outline">
          <a href={exportHref}>
            <Download className="size-4" /> {t("common.export")}
          </a>
        </Button>
      </PageHeader>
      <div className="space-y-4">
        <DataTableToolbar searchPlaceholder={t("submitList.search")} />
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-0" />
                <TableHead>{t("grower.items.item")}</TableHead>
                <TableHead>{t("grower.items.legacyId")}</TableHead>
                <TableHead>{t("grower.items.category")}</TableHead>
                {/* One column per site, so a total can be traced to where it is held. */}
                {locations.map((l) => (
                  <TableHead key={l.id} className="text-right">
                    {l.name}
                  </TableHead>
                ))}
                <TableHead className="text-right">{t("grower.items.onHand")}</TableHead>
                <TableHead className="text-right">{t("grower.items.onOrder")}</TableHead>
                <TableHead>{t("grower.items.lastCounted")}</TableHead>
                <TableHead>{t("grower.items.notes")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={locations.length + 8} className="text-muted-foreground h-24 text-center">
                    {raw.q ? t("submitList.noMatches") : t("grower.form.noItems")}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.itemId}>
                  <TableCell className="w-0">
                    <ItemImage itemId={r.itemId} hasImage={r.hasImage} alt={r.itemName} />
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{r.itemName}</span>
                    <p className="text-muted-foreground font-mono text-xs">{r.itemId}</p>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.legacyId ?? dash}</TableCell>
                  <TableCell className="text-xs">
                    {r.categoryName ?? "—"}
                    <p className="text-muted-foreground">{r.commodityName ?? ""}</p>
                  </TableCell>
                  {locations.map((l) => (
                    <TableCell key={l.id} className="text-right tabular-nums">
                      {r.byLocation.get(l.id)?.quantity ?? dash}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-medium tabular-nums">
                    {r.onHand == null ? (
                      <span className="text-muted-foreground text-xs">{t("grower.items.neverCounted")}</span>
                    ) : (
                      `${r.onHand} ${r.categoryName ?? ""}`
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.onOrder > 0 ? r.onOrder : dash}</TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {r.asOf ? format(r.asOf, "MMM d") : "—"}
                  </TableCell>
                  <TableCell>
                    <NotesCell notes={r.notes} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  )
}
