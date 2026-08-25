import { format } from "date-fns"
import { requireRole } from "@/lib/auth/session"
import { ROLES } from "@/lib/constants"
import { getVendorHistory } from "@/lib/vendor/data"
import { parseListParams } from "@/lib/query"
import { getT } from "@/lib/i18n/server"
import { PageHeader } from "@/components/page-header"
import { Pager } from "@/components/pager"
import { HistoryDetailTable } from "@/components/history/detail-table"
import { submissionCardClass } from "@/components/submit/card-tone"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

export default async function VendorHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireRole([ROLES.VENDOR_USER])
  if (!user.vendorId) return <p className="text-sm">Your account is not mapped to a vendor.</p>

  const t = await getT()
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams, { pageSize: 10 })
  const { submissions, total } = await getVendorHistory(user.vendorId, skip, take)

  return (
    <>
      <PageHeader title={t("vendor.history.title")} description={t("vendor.history.description")} />
      <div className="grid gap-5">
        {submissions.length > 0 && (
          <Pager
            page={page}
            pageCount={Math.ceil(total / pageSize)}
            total={total}
            searchParams={raw}
            position="top"
          />
        )}
        {submissions.length === 0 && (
          <Card><CardContent className="text-muted-foreground p-6 text-sm">{t("vendor.history.none")}</CardContent></Card>
        )}
        {submissions.map((s) => (
          <Card key={s.id} className={cn("gap-0 py-0", submissionCardClass())}>
            <CardHeader className="bg-muted/40 flex-row items-center justify-between border-b py-3">
              <CardTitle className="text-base">{format(s.submissionDate, "EEE, MMM d, yyyy")}</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{t("vendor.history.items", { count: s._count.details })}</Badge>
                <span className="text-muted-foreground text-xs">
                  {t("vendor.history.by", { name: `${s.submitter.firstName} ${s.submitter.lastName}` })}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <HistoryDetailTable
                cols={
                  <>
                    <col className="w-[45%]" />
                    <col className="w-[20%]" />
                    <col className="w-[35%]" />
                  </>
                }
                head={
                  <>
                    <TableHead>{t("vendor.history.item")}</TableHead>
                    <TableHead>{t("vendor.history.quantity")}</TableHead>
                    <TableHead>{t("vendor.history.allocations")}</TableHead>
                  </>
                }
                rows={s.details.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <span className="font-medium">{d.item.itemName}</span>
                      <span className="text-muted-foreground ml-2 font-mono text-xs">{d.itemId}</span>
                    </TableCell>
                    <TableCell className="tabular-nums">{Number(d.quantity)} {d.item.materialCategory?.name ?? ""}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {d.allocations.length === 0 && <span className="text-muted-foreground text-xs">—</span>}
                        {d.allocations.map((a) => (
                          <Badge key={a.id} variant="outline">
                            {a.grower.growerName}: {Number(a.quantity)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              />
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
