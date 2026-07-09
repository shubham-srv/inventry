"use client"

import { useTransition } from "react"
import { ChevronDown, LogOut } from "lucide-react"
import { logout } from "@/lib/auth/dummy"
import { useT } from "@/lib/i18n/client"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function UserMenu({
  firstName,
  lastName,
  email,
  roleLabel,
  contextLabel,
}: {
  firstName: string
  lastName: string
  email: string
  roleLabel: string
  contextLabel: string
}) {
  const [, start] = useTransition()
  const t = useT()
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-1.5">
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-medium">
              {firstName} {lastName}
            </span>
            <span className="text-muted-foreground block text-xs">{roleLabel}</span>
          </span>
          <ChevronDown className="size-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="font-medium">
            {firstName} {lastName}
          </div>
          <div className="text-muted-foreground text-xs">{email}</div>
          <div className="text-muted-foreground mt-1 text-xs">{contextLabel}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={(e) => {
            e.preventDefault()
            start(() => {
              void logout()
            })
          }}
        >
          <LogOut className="size-4" /> {t("common.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
