"use client"

import { useEffect, useRef, useState } from "react"
import { ReportFrame } from "@/components/reports/report-frame"

/**
 * One Power BI report, embedded with the powerbi-client library and a token this
 * app obtained for the signed-in admin ("embed for your organization").
 *
 * WHY NOT AN IFRAME. A secure-embed URL in a frame authenticates itself using
 * Microsoft cookies in a cross-site context. Safari blocks those outright,
 * Firefox partitions them, and Chrome and Edge restrict them — so the panel goes
 * blank or shows a sign-in prompt to someone who signed into this app with
 * Microsoft a minute ago. Supplying the token removes the frame's need to
 * authenticate anybody, which is what makes this work everywhere.
 *
 * The library is imported inside the effect rather than at module scope: it
 * touches `window` on load, and a client component is still rendered on the
 * server, where that would throw during the build.
 */
export function PowerBiReport({
  embedUrl,
  reportId,
  accessToken,
  name,
}: {
  embedUrl: string
  reportId: string
  accessToken: string
  name: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return

    // Guards the async import against a unmount (or a token refresh) that
    // happens before it resolves, which would otherwise embed into a dead node.
    let cancelled = false

    void (async () => {
      try {
        const pbi = await import("powerbi-client")
        if (cancelled || !host.current) return

        const service = new pbi.service.Service(
          pbi.factories.hpmFactory,
          pbi.factories.wpmpFactory,
          pbi.factories.routerFactory
        )

        const report = service.embed(el, {
          type: "report",
          id: reportId,
          embedUrl,
          accessToken,
          tokenType: pbi.models.TokenType.Aad,
          settings: {
            // The surrounding page is already navigation; a second set of panes
            // inside a half-width card just eats the report.
            panes: {
              filters: { visible: false },
              pageNavigation: { visible: true },
            },
            background: pbi.models.BackgroundType.Transparent,
          },
        })

        // Power BI reports its own failures here — most often a token that is
        // valid but lacks access to this particular report, which no amount of
        // retrying fixes and which the viewer needs told.
        report.on("error", (event: { detail?: { message?: string } }) => {
          if (cancelled) return
          const message = event?.detail?.message ?? "Power BI could not load this report."
          console.error("[powerbi] embed error", event?.detail)
          setError(message)
        })
      } catch (e) {
        if (cancelled) return
        console.error("[powerbi] embed failed", e)
        setError("This report could not be loaded.")
      }
    })()

    return () => {
      cancelled = true
      try {
        el.replaceChildren()
      } catch {
        // Nothing useful to do if teardown fails; the node is going away.
      }
    }
  }, [embedUrl, reportId, accessToken])

  return (
    <ReportFrame label={name}>
      <div ref={host} title={name} className="size-full" />
      {error && (
        <div className="bg-background/90 absolute inset-0 flex items-center justify-center p-4 text-center">
          <p className="text-muted-foreground text-sm">{error}</p>
        </div>
      )}
    </ReportFrame>
  )
}
