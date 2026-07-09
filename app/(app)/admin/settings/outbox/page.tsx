import { format } from "date-fns"
import { Mail } from "lucide-react"
import { type Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { parseListParams } from "@/lib/query"
import { NOTIFICATION_TYPES } from "@/lib/constants"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"

export default async function OutboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.ACCESS_SETTINGS)
  const { raw } = parseListParams(await searchParams)

  const and: Prisma.NotificationLogWhereInput[] = []
  if (raw.q) and.push({ OR: [{ subject: { contains: raw.q } }, { toEmail: { contains: raw.q } }] })
  if (raw.type) and.push({ type: raw.type })
  if (raw.status) and.push({ status: raw.status })
  const where: Prisma.NotificationLogWhereInput = and.length ? { AND: and } : {}

  const messages = await prisma.notificationLog.findMany({
    where,
    include: { grower: true, vendor: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  return (
    <>
      <PageHeader
        title="Outbox"
        description="Email triggers. Locally these are mocked; with ACS configured they're actually sent."
      />
      <div className="space-y-4">
        <DataTableToolbar
          searchPlaceholder="Search subject / recipient…"
          filters={[
            { key: "type", label: "Type", options: Object.values(NOTIFICATION_TYPES).map((t) => ({ label: t, value: t })) },
            { key: "status", label: "Status", options: ["Mocked", "Queued", "Sent", "Failed"].map((s) => ({ label: s, value: s })) },
          ]}
        />

        <div className="grid gap-3">
          {messages.length === 0 && (
            <Card><CardContent className="text-muted-foreground p-6 text-sm">No messages yet. Submit as a grower/vendor or run the reminder check.</CardContent></Card>
          )}
          {messages.map((m) => (
            <Card key={m.id} className="py-0">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-muted mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg">
                    <Mail className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{m.subject}</span>
                      <StatusBadge status={m.status} />
                      <Badge variant="outline" className="text-[10px]">{m.type}</Badge>
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      To: {m.toEmail}
                      {m.grower && ` · ${m.grower.growerName}`}
                      {m.vendor && ` · ${m.vendor.vendorName}`}
                    </p>
                    <p className="mt-1 text-sm">{m.body}</p>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {format(m.createdAt, "MMM d, HH:mm")}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </>
  )
}
