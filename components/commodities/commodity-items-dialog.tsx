"use client"

import { useState } from "react"
import Link from "next/link"
import { List, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatusBadge } from "@/components/status-badge"
import { useT } from "@/lib/i18n/client"

export type CommodityItemRow = {
  id: string
  legacyId: string | null
  name: string
  category: string | null
  subCategory: string | null
  status: string
}

/** Item count plus a button that lists the commodity's items. Loads on open. */
export function CommodityItemsDialog({
  code,
  name,
  count,
  isActive,
}: {
  code: string
  name: string
  count: number
  isActive: boolean
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<CommodityItemRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [q, setQ] = useState("")

  async function load() {
    setFailed(false)
    try {
      const res = await fetch(`/admin/commodities/${encodeURIComponent(code)}/items`, { cache: "no-store" })
      if (!res.ok) throw new Error(String(res.status))
      setRows(await res.json())
    } catch {
      setFailed(true)
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setQ("")
      setRows(null)
      void load()
    }
  }

  const needle = q.trim().toLowerCase()
  const shown = (rows ?? []).filter(
    (r) =>
      !needle ||
      r.id.toLowerCase().includes(needle) ||
      r.name.toLowerCase().includes(needle) ||
      (r.legacyId ?? "").toLowerCase().includes(needle)
  )

  return (
    <div className="flex items-center gap-1.5">
      <span className="min-w-6 tabular-nums">{count}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("admin.commodities.itemsDialog.viewItemsIn", { code })}
        title={count ? t("admin.commodities.itemsDialog.viewItems") : t("admin.commodities.itemsDialog.noItems")}
        disabled={count === 0}
        onClick={() => onOpenChange(true)}
      >
        <List />
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        {open && (
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                {t("admin.commodities.itemsDialog.title", { code, name })}
              </DialogTitle>
              <DialogDescription>
                {t(
                  isActive
                    ? "admin.commodities.itemsDialog.descriptionActive"
                    : "admin.commodities.itemsDialog.descriptionDisabled",
                  { count }
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("admin.commodities.itemsDialog.searchPlaceholder")}
                className="h-8 max-w-xs"
              />
              <Button asChild variant="link" size="sm" className="h-auto p-0">
                <Link href={`/admin/items?commodity=${encodeURIComponent(code)}`}>{t("admin.commodities.itemsDialog.openInItems")}</Link>
              </Button>
            </div>

            <div className="max-h-[60vh] overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.items.itemId")}</TableHead>
                    <TableHead>{t("admin.items.legacyId")}</TableHead>
                    <TableHead>{t("admin.common.name")}</TableHead>
                    <TableHead>{t("admin.common.category")}</TableHead>
                    <TableHead>{t("admin.common.subCategory")}</TableHead>
                    <TableHead>{t("admin.common.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows == null && !failed && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground h-20 text-center">
                        <Loader2 className="mr-2 inline size-4 animate-spin" /> {t("admin.commodities.itemsDialog.loading")}
                      </TableCell>
                    </TableRow>
                  )}
                  {failed && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-20 text-center">
                        <span className="text-destructive">{t("admin.commodities.itemsDialog.loadFailed")}</span>{" "}
                        <Button variant="link" size="sm" className="h-auto p-0" onClick={() => void load()}>
                          {t("admin.commodities.itemsDialog.tryAgain")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )}
                  {rows != null && shown.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground h-20 text-center">
                        {rows.length ? t("admin.commodities.itemsDialog.noMatch") : t("admin.commodities.itemsDialog.noItemsList")}
                      </TableCell>
                    </TableRow>
                  )}
                  {shown.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.id}</TableCell>
                      <TableCell className="font-mono text-xs">{r.legacyId ?? "—"}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-xs">{r.category ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.subCategory ?? "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
