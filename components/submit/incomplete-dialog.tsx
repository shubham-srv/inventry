"use client"

import { useT } from "@/lib/i18n/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/** "Not every item has a quantity" — confirm before submitting, naming the blanks. */
export function IncompleteSubmitDialog({
  open,
  onOpenChange,
  missing,
  total,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  missing: { itemId: string; itemName: string }[]
  total: number
  onConfirm: () => void
}) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("submitList.incompleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("submitList.incompleteBody", { done: total - missing.length, total })}
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0">
          <p className="mb-1.5 text-sm font-medium">
            {t("submitList.unfilledHeading", { count: missing.length })}
          </p>
          <ul className="max-h-60 overflow-y-auto rounded-md border text-sm">
            {missing.map((m) => (
              <li key={m.itemId} className="border-b px-3 py-1.5 break-words last:border-b-0">
                {m.itemName}
                <span className="text-muted-foreground ml-1.5 font-mono text-xs">{m.itemId}</span>
              </li>
            ))}
          </ul>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("submitList.goBack")}
          </Button>
          <Button onClick={onConfirm}>{t("submitList.submitAnyway")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
