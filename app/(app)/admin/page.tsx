import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import {
  Sprout,
  Store,
  Package,
  Inbox,
  TriangleAlert,
  Users,
} from "lucide-react"
import { prisma } from "@/lib/db"
import { requireRole } from "@/lib/auth/session"
import { INTERNAL_ROLES, ENTITY_STATUS, REQUEST_STATUS, SUBMISSION_STATUS } from "@/lib/constants"
import { can, CAPABILITIES } from "@/lib/rbac"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default async function AdminDashboard() {
  const user = await requireRole(INTERNAL_ROLES)

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
    prisma.item.count({ where: { status: ENTITY_STATUS.ACTIVE } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.missingItemRequest.count({ where: { status: REQUEST_STATUS.OPEN } }),
    prisma.lowInventoryFlag.count({ where: { isActive: true } }),
    prisma.growerSubmission.findMany({
      where: { status: SUBMISSION_STATUS.APPROVED }, // drafts aren't submissions yet
      take: 6,
      orderBy: { submissionDate: "desc" },
      include: { grower: true, submitter: true, _count: { select: { details: true } } },
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
        title={`Welcome, ${user.firstName}`}
        description="Operations overview across growers, vendors and master data."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Active growers" value={growerCount} icon={Sprout} />
        <StatCard title="Active vendors" value={vendorCount} icon={Store} />
        <StatCard title="Active items" value={itemCount} icon={Package} />
        <StatCard title="Users" value={userCount} icon={Users} />
        <StatCard
          title="Open item requests"
          value={openRequests}
          icon={Inbox}
          hint="Missing-item requests awaiting review"
        />
        <StatCard
          title="Low-inventory flags"
          value={activeFlags}
          icon={TriangleAlert}
          hint="Active grower flags"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent submissions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentSubmissions.length === 0 && (
              <p className="text-muted-foreground text-sm">No submissions yet.</p>
            )}
            {recentSubmissions.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{s.grower.growerName}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {s.submitter.firstName} {s.submitter.lastName} · {s._count.details} items
                  </p>
                </div>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {formatDistanceToNow(s.submissionDate, { addSuffix: true })}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {can(user.roleName, CAPABILITIES.ACCESS_SETTINGS) ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent audit activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentAudit.length === 0 && (
                <p className="text-muted-foreground text-sm">No activity yet.</p>
              )}
              {recentAudit.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      <Badge variant="outline" className="mr-2 text-[10px]">
                        {a.action}
                      </Badge>
                      {a.entityType}
                      {a.entityId ? ` · ${a.entityId}` : ""}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {a.user.firstName} {a.user.lastName}
                    </p>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {formatDistanceToNow(a.createdAt, { addSuffix: true })}
                  </span>
                </div>
              ))}
              <Link
                href="/admin/settings/audit-logs"
                className="text-primary inline-block text-xs hover:underline"
              >
                View all audit logs →
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick links</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-2 text-sm">
              <Link href="/admin/items" className="text-primary block hover:underline">
                Manage items →
              </Link>
              <Link href="/admin/conversions" className="text-primary block hover:underline">
                Unit conversions →
              </Link>
              <Link href="/admin/reports" className="text-primary block hover:underline">
                Reports →
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
