"use client"

import { Megaphone } from "lucide-react"
import { type ItemMessageView } from "@/lib/grower/data"
import { useT } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"

const MESSAGE_STYLES: Record<string, string> = {
  info: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  critical: "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300",
}

// A single admin notice shown under an item (grower and vendor submit cards).
// The type label is localized; the note is shown in the viewer's language.
export function ItemMessageBanner({ message }: { message: ItemMessageView }) {
  const t = useT()
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        MESSAGE_STYLES[message.severity] ?? MESSAGE_STYLES.info
      )}
    >
      <Megaphone className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <span className="font-medium">{t(`itemMessage.type.${message.type}`)}</span>
        {message.body ? <span> — {message.body}</span> : null}
      </div>
    </div>
  )
}
