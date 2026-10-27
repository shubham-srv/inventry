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
        aria-label={`View items in ${code}`}
        title={count ? "View items" : "No items"}
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
                Items in {code} — {name}
              </DialogTitle>
              <DialogDescription>
                {isActive
                  ? `${count} item(s). Status is each item's own setting.`
                  : `${count} item(s). This commodity is disabled, so all of them are hidden from growers and vendors until it is enabled again. Status is each item's own setting.`}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search ID, legacy ID or name…"
                className="h-8 max-w-xs"
              />
              <Button asChild variant="link" size="sm" className="h-auto p-0">
                <Link href={`/admin/items?commodity=${encodeURIComponent(code)}`}>Open in Items</Link>
              </Button>
            </div>

            <div className="max-h-[60vh] overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item ID</TableHead>
                    <TableHead>Legacy ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Sub-category</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows == null && !failed && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground h-20 text-center">
                        <Loader2 className="mr-2 inline size-4 animate-spin" /> Loading…
                      </TableCell>
                    </TableRow>
                  )}
                  {failed && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-20 text-center">
                        <span className="text-destructive">Could not load the items.</span>{" "}
                        <Button variant="link" size="sm" className="h-auto p-0" onClick={() => void load()}>
                          Try again
                        </Button>
                      </TableCell>
                    </TableRow>
                  )}
                  {rows != null && shown.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground h-20 text-center">
                        {rows.length ? "No items match your search." : "No items."}
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
