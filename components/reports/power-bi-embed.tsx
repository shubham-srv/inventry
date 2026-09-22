import { BarChart3 } from "lucide-react"
import { ReportFrame } from "@/components/reports/report-frame"

/**
 * Renders one Power BI report in an iframe, or a placeholder when its URL has
 * not been set to a real one yet.
 *
 * WHICH POWER BI EMBED THIS SUPPORTS. Anything that is just a URL in a frame:
 *
 *   • "Publish to web"  https://app.powerbi.com/view?r=<token>
 *       No sign-in, no licence — and PUBLIC to anyone with the link. Convenient,
 *       and the reason to think before using it for inventory data.
 *   • "Secure embed"    https://app.powerbi.com/reportEmbed?reportId=…
 *       Private, but the viewer is prompted to sign in to Power BI and needs a
 *       licence with access to the report.
 *
 * It does NOT support "embed for your customers" (app-owns-data), which is the
 * only option that is both private AND promptless. That one cannot be an iframe
 * src: it needs a server-generated embed token handed to the powerbi-client
 * JavaScript library, plus a capacity SKU and a service principal.
 *
 * WHY THE APP SESSION DOES NOT HELP HERE. Signing into this app with Microsoft
 * grants `user.read` and nothing else, and the resulting token is discarded —
 * the session cookie holds a user id, not a Microsoft credential. The iframe is
 * also a separate origin and cannot read our cookie regardless. So "they are
 * already signed in with Microsoft" never carries across on its own.
 */

/**
 * Only Power BI may be framed.
 *
 * This URL comes out of the database, and the frame renders inside an
 * authenticated admin page — so an arbitrary URL here would be a convincing
 * place to put a credential prompt. Restricting the host keeps a bad or
 * mistyped row from becoming a phishing surface.
 */
const ALLOWED_HOSTS = new Set([
  "app.powerbi.com",
  "app.powerbigov.us",
  "msit.powerbi.com",
])

/**
 * The embeddable URL, or null when this report is not configured yet.
 *
 * Null covers: an unparseable or non-HTTPS URL, a host that is not Power BI,
 * and the seeded DEMO_ placeholders — all of which should show the placeholder
 * card rather than a frame that silently fails to load.
 */
export function embedSrc(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== "https:") return null
  if (!ALLOWED_HOSTS.has(url.hostname)) return null
  if (url.href.includes("DEMO_")) return null
  return url.href
}

/**
 * Which kind of Power BI URL this is — they are embedded in different ways.
 *
 *   "secure" — /reportEmbed?reportId=…  private, and rendered with the
 *              powerbi-client library plus a token this app obtains, so the
 *              viewer is never asked to sign in inside the frame.
 *   "public" — /view?r=…                "publish to web": no sign-in, no licence,
 *              readable by anyone with the link. A plain iframe is all it needs.
 */
export type EmbedKind = "secure" | "public"

export function classifyEmbedUrl(raw: string): EmbedKind | null {
  const src = embedSrc(raw)
  if (!src) return null
  const path = new URL(src).pathname.toLowerCase()
  if (path.includes("/reportembed")) return "secure"
  if (path.includes("/view")) return "public"
  return null
}

export function PowerBiEmbed({ name, url }: { name: string; url: string }) {
  const src = embedSrc(url)

  if (!src) {
    return (
      <div className="bg-muted/40 flex aspect-video items-center justify-center rounded-lg border border-dashed text-center">
        <div className="text-muted-foreground p-4 text-sm">
          <BarChart3 className="mx-auto mb-2 size-8 opacity-50" aria-hidden />
          Not connected yet
          <div className="mt-1 text-xs">
            Paste this report&rsquo;s Power BI URL to replace this placeholder.
          </div>
          <div className="mt-2 font-mono text-[10px] break-all opacity-70">{url}</div>
        </div>
      </div>
    )
  }

  return (
    <ReportFrame label={name}>
      <iframe
        // No `sandbox`: Power BI needs scripts and its own origin, and the pair of
        // attributes that would allow both is equivalent to omitting it. The host
        // allowlist above is the control that actually does the work here.
        src={src}
        title={name}
        loading="lazy"
        allowFullScreen
        className="size-full"
      />
    </ReportFrame>
  )
}
