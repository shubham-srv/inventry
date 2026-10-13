"use client"

import { useState } from "react"
import { useT } from "@/lib/i18n/client"

const PREVIEW_CHARS = 80

/**
 * Free-text notes in a table cell: short notes in full, long ones clipped with
 * a tap-to-expand toggle (a hover title alone does nothing on a phone).
 */
export function NotesCell({ notes }: { notes: string | null | undefined }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const text = notes?.trim()
  if (!text) return <span className="text-muted-foreground text-xs">—</span>
  const long = text.length > PREVIEW_CHARS
  return (
    <div className="max-w-xs min-w-40 text-xs whitespace-pre-line">
      {long && !open ? `${text.slice(0, PREVIEW_CHARS).trimEnd()}…` : text}
      {long && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-primary ml-1 whitespace-nowrap hover:underline"
        >
          {open ? t("common.less") : t("common.more")}
        </button>
      )}
    </div>
  )
}
