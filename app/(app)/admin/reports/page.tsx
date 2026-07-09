import { format, subDays, startOfDay } from "date-fns"
import { BarChart3, ExternalLink } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { InventoryTrendChart } from "@/components/reports/inventory-trend-chart"

export default async function ReportsPage() {
  await requireCapability(CAPABILITIES.VIEW_REPORTS)

  const since = subDays(startOfDay(new Date()), 14)
  const [reports, ledger] = await Promise.all([
    prisma.powerBiReport.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.inventoryLedger.findMany({ where: { date: { gte: since } }, orderBy: { date: "asc" } }),
  ])

  const byDate = new Map<string, number>()
  for (const l of ledger) {
    const k = format(l.date, "MMM d")
    byDate.set(k, (byDate.get(k) ?? 0) + Number(l.finalQuantity))
  }
  const chartData = [...byDate.entries()].map(([date, total]) => ({ date, total }))

  return (
    <>
      <PageHeader title="Reports" description="Embedded Power BI analytics." />

      <Alert className="mb-4">
        <BarChart3 className="size-4" />
        <AlertTitle>Power BI embedding is wired for production</AlertTitle>
        <AlertDescription>
          In production these panels render live Power BI reports via embed tokens. In this local
          demo they show placeholders. The chart below is a live preview built from your inventory
          ledger.
        </AlertDescription>
      </Alert>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Inventory quantity trend (last 14 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <InventoryTrendChart data={chartData} />
          ) : (
            <p className="text-muted-foreground text-sm">No ledger data yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {reports.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                {r.name}
                <a href={r.embedUrl} className="text-primary text-xs hover:underline" target="_blank" rel="noreferrer">
                  open <ExternalLink className="inline size-3" />
                </a>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-muted/40 flex aspect-video items-center justify-center rounded-lg border border-dashed text-center">
                <div className="text-muted-foreground p-4 text-sm">
                  <BarChart3 className="mx-auto mb-2 size-8 opacity-50" />
                  Power BI embed placeholder
                  <div className="mt-1 font-mono text-[10px] break-all">{r.embedUrl}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}
