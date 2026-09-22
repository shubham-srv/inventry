import { BarChart3, ExternalLink, LogIn, ShieldAlert } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { getPowerBiToken, reportIdFromEmbedUrl, type PowerBiTokenError } from "@/lib/powerbi/token"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { PowerBiEmbed, classifyEmbedUrl, embedSrc } from "@/components/reports/power-bi-embed"
import { PowerBiReport } from "@/components/reports/power-bi-report"

/**
 * Power BI reports.
 *
 * This page shows Power BI reports and NOTHING ELSE. It previously also carried
 * a locally-drawn inventory trend chart, which existed only because the Power BI
 * panels were placeholders and the page would otherwise have been empty. Now
 * that the panels render real reports, a chart the app draws itself is actively
 * confusing here: it does not respond to Power BI's controls and does not exist
 * in Power BI when someone goes looking for it. Locally-drawn charts belong on
 * the other report tabs or the dashboard.
 *
 * Two kinds of URL are supported, and each panel picks by looking at its own:
 *
 *   /reportEmbed?reportId=…  private. Rendered with the powerbi-client library
 *                            and a token acquired for the signed-in admin, so
 *                            nobody is asked to sign in inside the frame — see
 *                            lib/powerbi/token.ts for why that matters.
 *   /view?r=…                "publish to web". A plain iframe is enough, because
 *                            the report is readable by anyone with the link.
 *
 * Connecting a report is therefore a URL change in PowerBiReport.embedUrl, with
 * no deployment. The Azure-side setup is documented in
 * docs/azure-staging-setup.md §10d.
 */
export default async function PowerBiReportsPage() {
  const user = await requireCapability(CAPABILITIES.VIEW_REPORTS)

  const reports = await prisma.powerBiReport.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  })

  // Only fetch a token if something on this page actually needs one. A page of
  // publish-to-web panels should not touch Entra at all.
  const needsToken = reports.some((r) => classifyEmbedUrl(r.embedUrl) === "secure")
  const token = needsToken ? await getPowerBiToken(user.id) : null

  const unconfigured = reports.filter((r) => !classifyEmbedUrl(r.embedUrl)).length

  return (
    <>
      {token?.ok === false && <TokenProblem reason={token.reason} />}

      {unconfigured > 0 && (
        <Alert className="mb-4">
          <BarChart3 className="size-4" />
          <AlertTitle>
            {unconfigured} of {reports.length} reports are not connected yet
          </AlertTitle>
          <AlertDescription>
            Each panel renders whatever Power BI URL is stored against it, so connecting one
            is a URL change rather than a code change.
          </AlertDescription>
        </Alert>
      )}

      {/* One per row, full width. A Power BI report is authored for a full
          browser window, so halving it shrinks every label and axis past
          reading size — the two-column grid that used to be here made sense
          only while these panels were placeholders. */}
      <div className="grid gap-4">
        {reports.map((r) => {
          const kind = classifyEmbedUrl(r.embedUrl)
          const src = embedSrc(r.embedUrl)
          const reportId = reportIdFromEmbedUrl(r.embedUrl)

          return (
            <Card key={r.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="min-w-0 truncate">{r.name}</span>
                  {src && (
                    <a
                      href={src}
                      className="text-primary shrink-0 text-xs hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      open <ExternalLink className="inline size-3" aria-hidden />
                    </a>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {kind === "secure" && src && reportId && token?.ok ? (
                  <PowerBiReport
                    name={r.name}
                    embedUrl={src}
                    reportId={reportId}
                    accessToken={token.token}
                  />
                ) : kind === "secure" && src && !reportId ? (
                  <Unavailable>
                    This URL has no <code className="font-mono">reportId</code>. Copy it from
                    Power BI&rsquo;s <strong>Embed report → Website or portal</strong> menu
                    rather than the browser address bar.
                  </Unavailable>
                ) : kind === "secure" ? (
                  <Unavailable>Sign in with Microsoft to view this report.</Unavailable>
                ) : (
                  // Publish-to-web, or not configured — both handled by the iframe
                  // component, which falls back to a placeholder card.
                  <PowerBiEmbed name={r.name} url={r.embedUrl} />
                )}
              </CardContent>
            </Card>
          )
        })}

        {reports.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No reports are configured. Add rows to PowerBiReport to have them appear here.
          </p>
        )}
      </div>
    </>
  )
}

function Unavailable({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted/40 flex aspect-video items-center justify-center rounded-lg border border-dashed p-4 text-center">
      <p className="text-muted-foreground text-sm">{children}</p>
    </div>
  )
}

/**
 * Each failure has a different fix and a different person who can apply it, so
 * they are worth telling apart rather than collapsing into "something failed".
 */
function TokenProblem({ reason }: { reason: PowerBiTokenError }) {
  const copy: Record<PowerBiTokenError, { title: string; body: React.ReactNode; signIn?: boolean }> =
    {
      "entra-not-configured": {
        title: "Microsoft sign-in is not configured on this environment",
        body: "Reports that need a Power BI token cannot load here. Publish-to-web panels still work.",
      },
      "cache-not-configured": {
        title: "Power BI embedding is not configured",
        body: "TOKEN_CACHE_SECRET is not set, so no Microsoft token can be stored for your session. See the deployment guide, section 10d.",
      },
      "no-session": {
        title: "Sign in with Microsoft to view these reports",
        body: "Your current session was not created through Microsoft sign-in, so there is no Power BI access to draw on.",
        signIn: true,
      },
      "consent-required": {
        title: "Power BI access has not been approved yet",
        body: "An administrator needs to grant admin consent for this app's Power BI permission. Until then, signing in again will not help. See the deployment guide, section 10d.",
      },
      failed: {
        title: "Could not reach Power BI",
        body: "The reports below could not be loaded. If this persists, the details are in the server logs.",
      },
    }

  const { title, body, signIn } = copy[reason]

  return (
    <Alert variant="destructive" className="mb-4">
      <ShieldAlert className="size-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>{body}</span>
        {signIn && (
          <Button asChild size="sm" variant="outline">
            <a href="/api/auth/login?returnTo=/admin/reports/power-bi">
              <LogIn /> Sign in with Microsoft
            </a>
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
