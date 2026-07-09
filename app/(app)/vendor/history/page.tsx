import { format } from "date-fns"
import { requireRole } from "@/lib/auth/session"
import { ROLES } from "@/lib/constants"
import { getVendorHistory } from "@/lib/vendor/data"
import { getT } from "@/lib/i18n/server"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default async function VendorHistoryPage() {
  const user = await requireRole([ROLES.VENDOR_USER])
  if (!user.vendorId) return <p className="text-sm">Your account is not mapped to a vendor.</p>

  const t = await getT()
  const submissions = await getVendorHistory(user.vendorId)

  return (
    <>
      <PageHeader title={t("vendor.history.title")} description={t("vendor.history.description")} />
      <div className="grid gap-4">
        {submissions.length === 0 && (
          <Card><CardContent className="text-muted-foreground p-6 text-sm">{t("vendor.history.none")}</CardContent></Card>
        )}
        {submissions.map((s) => (
          <Card key={s.id} className="gap-0 py-0">
            <CardHeader className="flex-row items-center justify-between border-b py-3">
              <CardTitle className="text-base">{format(s.submissionDate, "EEE, MMM d, yyyy")}</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{t("vendor.history.items", { count: s._count.details })}</Badge>
                <span className="text-muted-foreground text-xs">
                  {t("vendor.history.by", { name: `${s.submitter.firstName} ${s.submitter.lastName}` })}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("vendor.history.item")}</TableHead>
                    <TableHead>{t("vendor.history.quantity")}</TableHead>
                    <TableHead>{t("vendor.history.allocations")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.details.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <span className="font-medium">{d.item.itemName}</span>
                        <span className="text-muted-foreground ml-2 font-mono text-xs">{d.itemId}</span>
                      </TableCell>
                      <TableCell className="tabular-nums">{Number(d.quantity)} {d.unitOfMeasure ?? ""}</TableCell>
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
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}
