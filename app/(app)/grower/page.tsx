import Link from "next/link"
import { format } from "date-fns"
import {
  Package,
  TriangleAlert,
  Inbox,
  CalendarCheck,
  ArrowUp,
  ArrowDown,
  Minus,
  CheckCircle2,
} from "lucide-react"
import { requireRole } from "@/lib/auth/session"
import { ROLES } from "@/lib/constants"
import { getGrowerDashboard, getGrowerSubmitData } from "@/lib/grower/data"
import { getT } from "@/lib/i18n/server"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

export default async function GrowerDashboard() {
  const user = await requireRole([ROLES.GROWER_USER])
  if (!user.growerId) return <p className="text-sm">Your account is not mapped to a grower.</p>

  const t = await getT()
  const [d, submit] = await Promise.all([
    getGrowerDashboard(user.growerId),
    getGrowerSubmitData(user.growerId),
  ])
  const pct = submit.progress.total
    ? Math.round((submit.progress.recorded / submit.progress.total) * 100)
    : 0
  const movers = d.deltas
    .filter((x) => x.delta != null && x.delta !== 0)
    .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!))
    .slice(0, 6)

  return (
    <>
      <PageHeader
        title={t("grower.dash.hi", { name: user.firstName })}
        description={
          user.growerName ? t("grower.dash.daily", { grower: user.growerName }) : undefined
        }
      >
        <Button asChild size="sm">
          <Link href="/grower/submit">{t("grower.dash.submitToday")}</Link>
        </Button>
      </PageHeader>

      {/* Analytics badges */}
      <div className="mb-4 flex flex-wrap gap-2">
        {d.submittedThisWeek ? (
          <Badge variant="outline" className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="mr-1 size-3" />{" "}
            {t("grower.dash.submittedWeek", { count: d.weekSubmissionCount })}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400">
            <TriangleAlert className="mr-1 size-3" /> {t("grower.dash.noSubmissionWeek")}
          </Badge>
        )}
        <Badge variant="secondary">
          <Minus className="mr-1 size-3" /> {t("grower.dash.unchanged", { count: d.noChange })}
        </Badge>
        {d.lastSubmissionDate && (
          <Badge variant="secondary">
            {t("grower.dash.lastSubmitted", { date: format(d.lastSubmissionDate, "MMM d") })}
          </Badge>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={t("grower.dash.authorizedItems")} value={d.authCount} icon={Package} />
        <StatCard title={t("grower.dash.lowFlags")} value={d.lowFlags} icon={TriangleAlert} />
        <StatCard title={t("grower.dash.openRequests")} value={d.openRequests} icon={Inbox} />
        <StatCard title={t("grower.dash.weekSubmissions")} value={d.weekSubmissionCount} icon={CalendarCheck} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("grower.dash.todaysProgress")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("grower.dash.itemsSubmittedToday")}</span>
              <span className="tabular-nums">
                {submit.progress.recorded} / {submit.progress.total}
              </span>
            </div>
            <Progress value={pct} />
            <Button asChild variant="outline" size="sm">
              <Link href="/grower/submit">{t("grower.dash.continueSubmission")}</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("grower.dash.biggestChanges")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {movers.length === 0 && (
              <p className="text-muted-foreground text-sm">{t("grower.dash.notEnoughHistory")}</p>
            )}
            {movers.map((m) => {
              const up = (m.delta ?? 0) > 0
              return (
                <div key={m.itemId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{m.name}</span>
                  <span className={up ? "text-emerald-600" : "text-red-600"}>
                    {up ? <ArrowUp className="inline size-3" /> : <ArrowDown className="inline size-3" />}{" "}
                    {Math.abs(m.delta!)} <span className="text-muted-foreground">({m.previous} → {m.current})</span>
                  </span>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
