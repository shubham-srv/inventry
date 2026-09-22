"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Maximize2, Minimize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * The sized box a report is rendered into, with a maximize control.
 *
 * WHY THE FULLSCREEN API RATHER THAN A DIALOG. Maximizing must not reload the
 * report: a viewer three filters deep into a page loses all of it if the frame
 * restarts, and a secure embed re-runs its whole handshake. Moving an <iframe>
 * in the DOM — which is what portalling it into a dialog does — reloads it.
 * requestFullscreen() promotes the node where it already stands, so nothing
 * unmounts and the report simply gets bigger.
 *
 * 16:9 inline because that is the shape Power BI authors reports in, and
 * letterboxing inside our own card looks like a bug. In fullscreen we hand it
 * the whole screen and let Power BI do its own fitting.
 */
export function ReportFrame({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Driven by the event, never by the click: Escape, F11 and the browser's own
  // exit affordance all leave fullscreen without going through our button, and
  // a state flag we set ourselves would be wrong after any of them.
  useEffect(() => {
    const sync = () => setIsFullscreen(fullscreenElement() === ref.current)
    document.addEventListener("fullscreenchange", sync)
    document.addEventListener("webkitfullscreenchange", sync)
    return () => {
      document.removeEventListener("fullscreenchange", sync)
      document.removeEventListener("webkitfullscreenchange", sync)
    }
  }, [])

  const toggle = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (fullscreenElement()) {
      void exitFullscreen()
    } else {
      // Rejects when the gesture isn't trusted or an iframe policy forbids it.
      // Nothing to recover — the report stays embedded at card size.
      void requestFullscreen(el)?.catch((e: unknown) =>
        console.warn("[powerbi] fullscreen refused", e)
      )
    }
  }, [])

  return (
    <div
      ref={ref}
      className={cn(
        // bg-background: a fullscreen element gets a black backdrop by default,
        // which flashes against a light-theme report.
        "bg-background relative w-full [&_iframe]:size-full [&_iframe]:border-0",
        isFullscreen ? "h-full" : "aspect-video overflow-hidden rounded-lg border",
        className
      )}
    >
      {children}
      <Button
        type="button"
        variant="secondary"
        size="icon"
        onClick={toggle}
        // The report owns this rectangle, so the control sits over it. Softened
        // until hover so it does not compete with the report's own toolbar.
        className="absolute top-2 right-2 z-10 opacity-60 shadow-sm transition-opacity hover:opacity-100 focus-visible:opacity-100"
        aria-label={
          isFullscreen ? `Exit fullscreen: ${label}` : `View ${label} fullscreen`
        }
        title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
      >
        {isFullscreen ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
      </Button>
    </div>
  )
}

/**
 * Safari still ships only the prefixed Fullscreen API, and these three helpers
 * are the whole of the difference. The prefixed members are declared in the DOM
 * lib but are absent at runtime in every other browser, hence the guards.
 */
type PrefixedDocument = {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => void
}
type PrefixedElement = {
  webkitRequestFullscreen?: () => Promise<void> | void
}

// `as unknown as` rather than an intersection: the DOM lib declares some of
// these prefixed members with incompatible shapes, and intersecting collapses
// them to `never`.
const prefixed = <T,>(o: object): T => o as unknown as T

function fullscreenElement(): Element | null {
  return (
    document.fullscreenElement ??
    prefixed<PrefixedDocument>(document).webkitFullscreenElement ??
    null
  )
}

function exitFullscreen(): void {
  if (document.exitFullscreen) void document.exitFullscreen()
  else prefixed<PrefixedDocument>(document).webkitExitFullscreen?.()
}

function requestFullscreen(el: HTMLElement): Promise<void> | undefined {
  if (el.requestFullscreen) return el.requestFullscreen()
  const r = prefixed<PrefixedElement>(el).webkitRequestFullscreen?.()
  return r instanceof Promise ? r : undefined
}
