import Link from "next/link"
import { timeAgo } from "@/lib/dates"
import {
  Sprout,
  Store,
  Package,
  Inbox,
  TriangleAlert,
  Users,
} from "lucide-react"
import { prisma } from "@/lib/db"
import { ACTIVE_ITEM } from "@/lib/items/active"
import { requireRole } from "@/lib/auth/session"
import { INTERNAL_ROLES, ENTITY_STATUS, REQUEST_STATUS, SUBMISSION_STATUS } from "@/lib/constants"
import { can, CAPABILITIES } from "@/lib/rbac"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getLocale, getT } from "@/lib/i18n/server"

export default async function AdminDashboard() {
  const user = await requireRole(INTERNAL_ROLES)
  const t = await getT()
  // Reuses the audit-log labels; unknown values show as stored.
  const auditLabel = (group: "actions" | "entities", value: string) => {
    const key = `admin.settings.auditLogs.${group}.${value}`
    const text = t(key)
    return text === key ? value : text
  }
  const locale = await getLocale()

  const [
    growerCount,
    vendorCount,
    itemCount,
    userCount,
    openRequests,
    activeFlags,
    recentSubmissions,
    recentAudit,
  ] = await Promise.all([
    prisma.grower.count({ where: { status: ENTITY_STATUS.ACTIVE } }),
    prisma.vendor.count({ where: { status: ENTITY_STATUS.ACTIVE } }),
    prisma.item.count({ where: ACTIVE_ITEM }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.missingItemRequest.count({ where: { status: REQUEST_STATUS.OPEN } }),
    prisma.lowInventoryFlag.count({ where: { isActive: true } }),
    prisma.growerSubmission.findMany({
      where: { status: SUBMISSION_STATUS.APPROVED }, // drafts aren't submissions yet
      take: 6,
      orderBy: { submissionDate: "desc" },
      include: { grower: true, location: true, submitter: true, _count: { select: { details: true } } },
    }),
    prisma.auditLog.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: { user: true },
    }),
  ])

  return (
    <>
      <PageHeader
        title={t("admin.dashboard.welcome", { name: user.firstName })}
        description={t("admin.dashboard.description")}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title={t("admin.dashboard.activeGrowers")} value={growerCount} icon={Sprout} />
        <StatCard title={t("admin.dashboard.activeVendors")} value={vendorCount} icon={Store} />
        <StatCard title={t("admin.dashboard.activeItems")} value={itemCount} icon={Package} />
        <StatCard title={t("nav.users")} value={userCount} icon={Users} />
        <StatCard
          title={t("admin.dashboard.openItemRequests")}
          value={openRequests}
          icon={Inbox}
          hint={t("admin.dashboard.openItemRequestsHint")}
        />
        <StatCard
          title={t("admin.dashboard.lowFlags")}
          value={activeFlags}
          icon={TriangleAlert}
          hint={t("admin.dashboard.lowFlagsHint")}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.dashboard.recentSubmissions")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentSubmissions.length === 0 && (
              <p className="text-muted-foreground text-sm">{t("admin.dashboard.noSubmissions")}</p>
            )}
            {recentSubmissions.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {s.grower.growerName}
                    {/* One grower can appear several times a day, once per
                        site, so the site has to disambiguate the rows. */}
                    <span className="text-muted-foreground font-normal">
                      {" · "}
                      {s.location.locationName}
                    </span>
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {s.submitter.firstName} {s.submitter.lastName} · {t("admin.dashboard.itemsCount", { count: s._count.details })}
                  </p>
                </div>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {timeAgo(s.submissionDate, locale)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {can(user.roleName, CAPABILITIES.ACCESS_SETTINGS) ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("admin.dashboard.recentAudit")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentAudit.length === 0 && (
                <p className="text-muted-foreground text-sm">{t("admin.dashboard.noActivity")}</p>
              )}
              {recentAudit.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      <Badge variant="outline" className="mr-2 text-[10px]">
                        {auditLabel("actions", a.action)}
                      </Badge>
                      {auditLabel("entities", a.entityType)}
                      {a.entityId ? ` · ${a.entityId}` : ""}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {a.user.firstName} {a.user.lastName}
                    </p>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {timeAgo(a.createdAt, locale)}
                  </span>
                </div>
              ))}
              <Link
                href="/admin/settings/audit-logs"
                className="text-primary inline-block text-xs hover:underline"
              >
                {t("admin.dashboard.viewAuditLogs")}
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("admin.dashboard.quickLinks")}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-2 text-sm">
              <Link href="/admin/items" className="text-primary block hover:underline">
                {t("admin.dashboard.manageItems")}
              </Link>
              <Link href="/admin/conversions" className="text-primary block hover:underline">
                {t("nav.conversions")} →
              </Link>
              <Link href="/admin/reports" className="text-primary block hover:underline">
                {t("nav.reports")} →
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
