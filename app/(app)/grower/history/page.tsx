import { format } from "date-fns"
import { Flag } from "lucide-react"
import { requireRole } from "@/lib/auth/session"
import { ROLES } from "@/lib/constants"
import { getGrowerHistory } from "@/lib/grower/data"
import { parseListParams } from "@/lib/query"
import { getT } from "@/lib/i18n/server"
import { PageHeader } from "@/components/page-header"
import { Pager } from "@/components/pager"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/status-badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default async function GrowerHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireRole([ROLES.GROWER_USER])
  if (!user.growerId) return <p className="text-sm">Your account is not mapped to a grower.</p>

  const t = await getT()
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams, { pageSize: 10 })
  const { submissions, total } = await getGrowerHistory(user.growerId, skip, take)

  return (
    <>
      <PageHeader title={t("grower.history.title")} description={t("grower.history.description")} />
      <div className="grid gap-4">
        {submissions.length === 0 && (
          <Card><CardContent className="text-muted-foreground p-6 text-sm">{t("grower.history.none")}</CardContent></Card>
        )}
        {submissions.map((s) => (
          <Card key={s.id} className="gap-0 py-0">
            <CardHeader className="flex-row items-center justify-between border-b py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {format(s.submissionDate, "EEE, MMM d, yyyy")}
                {/* A day is now one card per site, so the site has to be on it. */}
                <span className="text-muted-foreground text-sm font-normal">
                  {s.location.locationName}
                </span>
                <StatusBadge status={s.status} label={t(`status.${s.status}`)} />
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{t("grower.history.items", { count: s._count.details })}</Badge>
                <span className="text-muted-foreground text-xs">
                  {t("grower.history.by", { name: `${s.submitter.firstName} ${s.submitter.lastName}` })}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("grower.history.item")}</TableHead>
                    <TableHead>{t("grower.history.onHand")}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.details.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <span className="font-medium">{d.item.itemName}</span>
                        <span className="text-muted-foreground ml-2 font-mono text-xs">{d.itemId}</span>
                      </TableCell>
                      <TableCell className="tabular-nums">{Number(d.quantityOnHand)} {d.unitOfMeasure ?? ""}</TableCell>
                      <TableCell>
                        {d.isLowFlagged && (
                          <Badge variant="outline" className="border-transparent bg-red-500/15 text-red-700 dark:text-red-400">
                            <Flag className="mr-1 size-3" /> {t("grower.form.low")}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
