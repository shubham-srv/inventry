import Link from "next/link"
import { format } from "date-fns"
import { Package, Users, Boxes, CalendarCheck, CheckCircle2, TriangleAlert } from "lucide-react"
import { requireRole } from "@/lib/auth/session"
import { ROLES } from "@/lib/constants"
import { getVendorDashboard } from "@/lib/vendor/data"
import { getT } from "@/lib/i18n/server"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export default async function VendorDashboard() {
  const user = await requireRole([ROLES.VENDOR_USER])
  if (!user.vendorId) return <p className="text-sm">Your account is not mapped to a vendor.</p>

  const t = await getT()
  const d = await getVendorDashboard(user.vendorId)

  return (
    <>
      <PageHeader
        title={t("vendor.dash.hi", { name: user.firstName })}
        description={
          user.vendorName ? t("vendor.dash.supply", { vendor: user.vendorName }) : undefined
        }
      >
        <Button asChild size="sm">
          <Link href="/vendor/submit">{t("vendor.dash.submitToday")}</Link>
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2">
        {d.submittedThisWeek ? (
          <Badge variant="outline" className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="mr-1 size-3" />{" "}
            {t("vendor.dash.reportedWeek", { count: d.weekSubmissionCount })}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400">
            <TriangleAlert className="mr-1 size-3" /> {t("vendor.dash.noReportWeek")}
          </Badge>
        )}
        {d.lastSubmissionDate && (
          <Badge variant="secondary">
            {t("vendor.dash.lastReported", { date: format(d.lastSubmissionDate, "MMM d") })}
          </Badge>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={t("vendor.dash.itemsSupplied")} value={d.itemCount} icon={Package} />
        <StatCard title={t("vendor.dash.growersServed")} value={d.growersServed} icon={Users} />
        <StatCard title={t("vendor.dash.latestTotal")} value={d.totalLatestQty} icon={Boxes} />
        <StatCard title={t("vendor.dash.weekReports")} value={d.weekSubmissionCount} icon={CalendarCheck} />
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("vendor.dash.topItems")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {d.topItems.length === 0 && (
              <p className="text-muted-foreground text-sm">{t("vendor.dash.noReports")}</p>
            )}
            {d.topItems.map((it) => (
              <div key={it.itemId} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{it.name}</span>
                <span className="tabular-nums font-medium">{it.qty}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
