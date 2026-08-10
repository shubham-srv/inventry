"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Collapsed-by-default preview of a rendered email.
 *
 * The iframe is only mounted once expanded. Rendering one per row eagerly meant
 * a full HTML document parsed and laid out for every message on the page — by
 * far the heaviest thing in the app. Collapsed rows show the stored plaintext
 * part instead, which is already enough to tell messages apart.
 */
export function EmailPreview({
  subject,
  html,
  text,
  openLabel,
  closeLabel,
}: {
  subject: string
  html: string
  text: string
  openLabel: string
  closeLabel: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        {open ? closeLabel : openLabel}
      </Button>
      {open ? (
        // sandbox="" (no allow-scripts) keeps the preview inert; the HTML is our
        // own template output, but it is still treated as untrusted.
        <iframe
          title={subject}
          srcDoc={html}
          sandbox=""
          className="mt-2 h-72 w-full rounded-md border bg-white"
        />
      ) : (
        <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{text}</p>
      )}
    </div>
  )
}
