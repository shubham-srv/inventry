"use client"

import * as React from "react"
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { type ActionState } from "@/lib/actions/types"

type Props = {
  action: () => Promise<ActionState>
  children: React.ReactNode
  variant?: "ghost" | "default" | "secondary" | "outline" | "destructive"
  size?: "default" | "sm" | "xs" | "icon" | "icon-sm"
  className?: string
}

/** Fires a no-arg server action on click, with toast + refresh. */
export function ActionButton({ action, children, variant = "ghost", size = "sm", className }: Props) {
  const [pending, start] = useTransition()
  const router = useRouter()

  function onClick() {
    start(async () => {
      const res = await action()
      if (res.ok) {
        toast.success(res.message ?? "Done")
        router.refresh()
      } else {
        toast.error(res.message ?? "Action failed")
      }
    })
  }

  return (
    <Button variant={variant} size={size} className={className} disabled={pending} onClick={onClick}>
      {children}
    </Button>
  )
}
