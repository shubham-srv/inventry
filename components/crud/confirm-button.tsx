"use client"

import * as React from "react"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { type ActionState } from "@/lib/actions/types"
import { useT } from "@/lib/i18n/client"

type Variant = "destructive" | "default" | "secondary" | "outline"

export function ConfirmButton({
  trigger,
  title,
  description,
  confirmLabel,
  action,
  variant = "destructive",
  typeToConfirm = false,
}: {
  trigger: React.ReactNode
  title: string
  description?: string
  confirmLabel?: string
  action: () => Promise<ActionState>
  variant?: Variant
  /**
   * Require the word "delete" to be typed before the confirm button enables.
   * Used for every irreversible delete; plain confirms (cancel an order, revoke
   * an authorization) keep the single-click flow.
   */
  typeToConfirm?: boolean
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const [pending, start] = useTransition()
  const router = useRouter()

  // The word is localized, so a Spanish user types "eliminar", not "delete".
  const word = t("common.deleteWord")
  const armed = !typeToConfirm || typed.trim().toLowerCase() === word.toLowerCase()

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setTyped("")
  }

  function onConfirm() {
    start(async () => {
      const res = await action()
      if (res.ok) {
        toast.success(res.message ?? "Done")
        onOpenChange(false)
        router.refresh()
      } else {
        toast.error(res.message ?? "Action failed")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Same RSC hazard as EntityFormDialog: `trigger` is created in a Server
        Component and streamed across the boundary, so once this component's
        serialized props grow past a threshold React hands DialogTrigger a
        deferred reference instead of a plain element and `asChild`'s
        Children.only() throws ("Primitive.button failed to slot onto its
        children"). The client-created span (display:contents, layout-inert)
        gives the Slot one stable child. Do not inline `{trigger}` back in.
      */}
      <DialogTrigger asChild>
        <span className="contents">{trigger}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {typeToConfirm && (
          <div>
            <Label htmlFor="confirm-word" className="mb-1.5">
              {t("common.typeToConfirm", { word })}
            </Label>
            <Input
              id="confirm-word"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={word}
              autoComplete="off"
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant={variant} onClick={onConfirm} disabled={pending || !armed}>
            {pending ? t("common.working") : (confirmLabel ?? t("common.confirm"))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
