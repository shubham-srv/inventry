"use client"

import * as React from "react"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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
}: {
  trigger: React.ReactNode
  title: string
  description?: string
  confirmLabel?: string
  action: () => Promise<ActionState>
  variant?: Variant
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()

  function onConfirm() {
    start(async () => {
      const res = await action()
      if (res.ok) {
        toast.success(res.message ?? "Done")
        setOpen(false)
        router.refresh()
      } else {
        toast.error(res.message ?? "Action failed")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant={variant} onClick={onConfirm} disabled={pending}>
            {pending ? t("common.working") : (confirmLabel ?? t("common.confirm"))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
