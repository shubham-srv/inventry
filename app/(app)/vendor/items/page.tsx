import { format } from "date-fns"
import { ChevronRight, Download, Package } from "lucide-react"
import { requireRole } from "@/lib/auth/session"
import { ROLES } from "@/lib/constants"
import { getLocale, getT } from "@/lib/i18n/server"
import { parseListParams } from "@/lib/query"
import { getVendorItems, type VendorItemRow } from "@/lib/vendor/items"
import { setMyConversions } from "@/lib/actions/vendor"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { NotesCell } from "@/components/data-table/notes-cell"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { ItemImage } from "@/components/item-image"

/**
 * Every item this vendor supplies: what they last reported, and how they ship
 * it (their conversion chain and ratios, which they maintain here). Exportable
 * to Excel with the same numbers.
 */
export default async function VendorItemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireRole([ROLES.VENDOR_USER])
  if (!user.vendorId) return <p className="text-sm">Your account is not mapped to a vendor.</p>

  const [t, locale] = await Promise.all([getT(), getLocale()])
  const { raw } = parseListParams(await searchParams)
  const rows = await getVendorItems(user.vendorId, locale, raw.q)
  const dash = <span className="text-muted-foreground">—</span>
  const exportHref = `/vendor/items/export${raw.q ? `?q=${encodeURIComponent(raw.q)}` : ""}`

  const conversionFields = (r: VendorItemRow): Field[] => [
    {
      name: "packagingChainId",
      label: t("vendor.items.chain"),
      type: "select",
      colSpan: 2,
      options: [
        { label: t("vendor.items.noChain"), value: "none" },
        ...r.eligibleChains.map((c) => ({
          label: `${c.name} (${[r.categoryName ?? "", ...c.levels.map((l) => l.unitName)].join(" → ")})`,
          value: String(c.id),
        })),
      ],
      description:
        r.eligibleChains.length === 0
          ? t("vendor.items.noChainsDefined", { category: r.categoryName ?? "—" })
          : t("vendor.items.chainHint"),
    },
    {
      name: "ratios",
      label: t("vendor.items.ratios"),
      type: "text",
      placeholder: "10, 5",
      colSpan: 2,
      description: t("vendor.items.ratiosHint", { base: r.categoryName ?? "" }),
    },
  ]

  return (
    <>
      <PageHeader title={t("vendor.items.title")} description={t("vendor.items.description")}>
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
                <TableHead>{t("vendor.items.item")}</TableHead>
                <TableHead>{t("vendor.items.legacyId")}</TableHead>
                <TableHead>{t("vendor.items.category")}</TableHead>
                <TableHead className="text-right">{t("vendor.items.reported")}</TableHead>
                <TableHead className="text-right">{t("vendor.items.allocated")}</TableHead>
                <TableHead>{t("vendor.items.lastReported")}</TableHead>
                <TableHead>{t("vendor.items.conversions")}</TableHead>
                <TableHead>{t("vendor.items.notes")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-muted-foreground h-24 text-center">
                    {raw.q ? t("submitList.noMatches") : t("vendor.form.noItems")}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => {
                const per = new Map(r.ratios.map((x) => [x.level, x.perParent]))
                return (
                  <TableRow key={r.mappingId}>
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
                    <TableCell className="text-right font-medium tabular-nums">
                      {r.reported == null ? (
                        <span className="text-muted-foreground text-xs">{t("vendor.items.neverReported")}</span>
                      ) : (
                        `${r.reported} ${r.categoryName ?? ""}`
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.allocated ?? dash}</TableCell>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                      {r.asOf ? format(r.asOf, "MMM d") : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {r.chain ? (
                          <span className="flex flex-wrap items-center gap-1 text-xs">
                            <Badge variant="secondary" className="text-[10px]">
                              {r.categoryName ?? "—"}
                            </Badge>
                            {r.chain.levels.map((l) => (
                              <span key={l.level} className="flex items-center gap-1">
                                <span className="text-muted-foreground tabular-nums">×{per.get(l.level) ?? "?"}</span>
                                <ChevronRight className="text-muted-foreground size-3" />
                                <Badge variant="outline">{l.unitName}</Badge>
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">{t("vendor.items.plainUnits")}</span>
                        )}
                        <EntityFormDialog
                          title={t("vendor.items.editTitle")}
                          description={`${r.itemName} · ${r.itemId}`}
                          fields={conversionFields(r)}
                          action={setMyConversions}
                          values={{
                            id: r.mappingId,
                            packagingChainId: r.chain ? String(r.chain.id) : "none",
                            ratios: r.ratios.map((x) => x.perParent).join(", "),
                          }}
                          submitLabel={t("common.save")}
                          trigger={
                            <Button variant="ghost" size="icon-sm" aria-label={t("vendor.items.editTitle")}>
                              <Package />
                            </Button>
                          }
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <NotesCell notes={r.notes} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  )
}
