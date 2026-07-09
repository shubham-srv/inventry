"use client"

import { useRef, useTransition } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Search, Download, FileSpreadsheet, X } from "lucide-react"
import { useT } from "@/lib/i18n/client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type FilterConfig = {
  key: string
  label: string
  options: { label: string; value: string }[]
}

const ALL = "__all__"

export function DataTableToolbar({
  searchPlaceholder,
  filters = [],
  exportEntity,
  children,
}: {
  searchPlaceholder?: string
  filters?: FilterConfig[]
  exportEntity?: string
  children?: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const t = useT()

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value == null || value === "" || value === ALL) params.delete(key)
    else params.set(key, value)
    params.delete("page") // reset pagination on filter change
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`)
    })
  }

  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  function onSearch(value: string) {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setParam("q", value), 350)
  }

  const hasActiveFilters =
    !!searchParams.get("q") || filters.some((f) => searchParams.get(f.key))

  const exportHref = exportEntity
    ? `/admin/export?${new URLSearchParams({
        entity: exportEntity,
        ...Object.fromEntries(searchParams.entries()),
      }).toString()}`
    : null

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            defaultValue={searchParams.get("q") ?? ""}
            placeholder={searchPlaceholder ?? t("common.search")}
            onChange={(e) => onSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        {filters.map((f) => (
          <Select
            key={f.key}
            value={searchParams.get(f.key) ?? ALL}
            onValueChange={(v) => setParam(f.key, v)}
          >
            <SelectTrigger className="w-auto min-w-36">
              <SelectValue placeholder={f.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("common.all")} — {f.label.toLowerCase()}</SelectItem>
              {f.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              startTransition(() => router.replace(pathname))
            }
          >
            <X className="size-4" /> {t("common.reset")}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {exportHref && (
          <>
            <Button variant="outline" size="sm" asChild>
              <a href={exportHref}>
                <Download className="size-4" /> {t("common.export")}
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/admin/export?entity=full">
                <FileSpreadsheet className="size-4" /> {t("common.fullExport")}
              </a>
            </Button>
          </>
        )}
        {children}
      </div>
    </div>
  )
}
