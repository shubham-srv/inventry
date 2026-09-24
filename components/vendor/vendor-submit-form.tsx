"use client"

import { useActionState, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ChevronDown, ChevronRight, CheckCircle2, History, Users } from "lucide-react"
import { submitVendorReport } from "@/lib/actions/vendor"
import { initialActionState } from "@/lib/actions/types"
import { ItemImage } from "@/components/item-image"
import { type VendorSubmitRow } from "@/lib/vendor/data"
import { useT } from "@/lib/i18n/client"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  SubmitListControls,
  useSubmitListView,
  DEFAULT_SUBMIT_SORT,
  type SubmitSort,
} from "@/components/submit/submit-list-controls"
import { itemCardClass } from "@/components/submit/card-tone"
import { cn } from "@/lib/utils"

type RowState = {
  qty: string
  allocations: Record<number, string>
  open: boolean
}

export function VendorSubmitForm({ rows }: { rows: VendorSubmitRow[] }) {
  const t = useT()
  const router = useRouter()
  const [state, formAction, pending] = useActionState(submitVendorReport, initialActionState)
  const handled = useRef(false)

  const [values, setValues] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.itemId,
        {
          qty: r.todayQty != null ? String(r.todayQty) : "",
          allocations: Object.fromEntries(
            r.growers.map((g) => [g.growerId, r.todayAllocations[g.growerId] != null ? String(r.todayAllocations[g.growerId]) : ""])
          ),
          open: Object.keys(r.todayAllocations).length > 0,
        },
      ])
    )
  )

  useEffect(() => {
    if (state.ok && !handled.current) {
      handled.current = true
      toast.success(state.message ?? "Submitted")
      router.refresh()
    } else if (!state.ok && state.message) {
      toast.error(state.message)
    }
    handled.current = state.ok
  }, [state, router])

  // A view over the list, nothing more: the payload and the counters below stay
  // on `rows`, so a search can never drop a quantity that was typed.
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SubmitSort>(DEFAULT_SUBMIT_SORT)
  const view = useSubmitListView(rows, query, sort)

  const entered = useMemo(() => rows.filter((r) => values[r.itemId]?.qty.trim() !== "").length, [rows, values])
  const pct = rows.length ? Math.round((entered / rows.length) * 100) : 0
  // Entered rows the search is hiding — still submitted, still counted.
  const hiddenEntered = useMemo(() => {
    if (query.trim() === "") return 0
    const visible = new Set(view.map((r) => r.itemId))
    return rows.filter((r) => !visible.has(r.itemId) && values[r.itemId]?.qty.trim() !== "").length
  }, [rows, view, values, query])

  // The server rejects the WHOLE report if any item allocates more than it
  // reported (lib/actions/vendor.ts), so a single bad row used to lose every
  // number on the page with only a small red badge as warning. Block submit
  // instead, and say how many rows are at fault.
  const overRows = useMemo(
    () =>
      rows.filter((r) => {
        const v = values[r.itemId]
        if (!v) return false
        const allocated = r.growers.reduce((s, g) => s + Number(v.allocations[g.growerId] || 0), 0)
        return allocated > Number(v.qty || 0) + 1e-6
      }).length,
    [rows, values]
  )

  const payload = useMemo(
    () =>
      JSON.stringify(
        rows
          .filter((r) => values[r.itemId]?.qty.trim() !== "")
          .map((r) => ({
            itemId: r.itemId,
            quantity: Number(values[r.itemId].qty),
            allocations: r.growers
              .filter((g) => (values[r.itemId].allocations[g.growerId] ?? "").trim() !== "")
              .map((g) => ({ growerId: g.growerId, quantity: Number(values[r.itemId].allocations[g.growerId]) })),
          }))
      ),
    [rows, values]
  )

  function set(itemId: string, patch: Partial<RowState>) {
    setValues((v) => ({ ...v, [itemId]: { ...v[itemId], ...patch } }))
  }

  // Prefill every quantity — and its per-grower split — with the vendor's last
  // report, so they only edit what moved. Mirrors the grower form: explicit,
  // never automatic, so nobody submits last week's numbers without looking.
  //
  // The allocations used to be skipped here on the theory that a split belongs
  // to *this* report. In practice that meant an item with grower boxes filled
  // its quantity and nothing else, and submitting then wiped the split outright
  // (lib/actions/vendor.ts replaces allocations per detail), dropping the item
  // out of the admin grower-filtered vendor-stock view. Quantity and split come
  // from the same past report, so the sum can't exceed the quantity.
  const hasPrev = useMemo(
    () =>
      rows.some(
        (r) => r.previousQty != null || Object.keys(r.previousAllocations).length > 0
      ),
    [rows]
  )
  function loadPrevious() {
    setValues((v) => {
      const next = { ...v }
      for (const r of rows) {
        const prevAlloc = Object.entries(r.previousAllocations)
        if (r.previousQty == null && prevAlloc.length === 0) continue
        const row = { ...next[r.itemId] }
        if (r.previousQty != null) row.qty = String(r.previousQty)
        if (prevAlloc.length > 0) {
          row.allocations = { ...row.allocations }
          for (const [growerId, qty] of prevAlloc) row.allocations[Number(growerId)] = String(qty)
          // Open the panel so the vendor sees what was filled in rather than
          // discovering it after submitting.
          row.open = true
        }
        next[r.itemId] = row
      }
      return next
    })
  }
  function setAlloc(itemId: string, growerId: number, value: string) {
    setValues((v) => ({
      ...v,
      [itemId]: { ...v[itemId], allocations: { ...v[itemId].allocations, [growerId]: value } },
    }))
  }

  return (
    <>
      {/* The form holds only the payload; the submit button reaches it by `form`
          attribute. That keeps the quantity, allocation and search inputs OUT of
          it, so Enter in any of them can't fire off a half-finished report.
          Same arrangement as the grower submit form. */}
      <form id="vendor-submit-form" action={formAction}>
        <input type="hidden" name="payload" value={payload} />
      </form>

      <div className="bg-background/95 sticky top-14 z-10 -mx-4 mb-4 border-b px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium">{t("vendor.form.progressLabel")}</span>
              <span className="text-muted-foreground tabular-nums">
                {t("vendor.form.itemsOf", { done: entered, total: rows.length })}
              </span>
            </div>
            <Progress value={pct} />
          </div>
          <Button
            type="submit"
            form="vendor-submit-form"
            disabled={pending || entered === 0 || overRows > 0}
          >
            {pending ? t("common.saving") : t("vendor.form.submit")}
          </Button>
        </div>
        {overRows > 0 && (
          <p className="text-destructive mt-2 text-xs">
            {t("vendor.form.overBlocked", { count: overRows })}
          </p>
        )}
        {rows.length > 0 && (
          <div className="mt-2">
            <SubmitListControls
              query={query}
              onQueryChange={setQuery}
              sort={sort}
              onSortChange={setSort}
              shown={view.length}
              total={rows.length}
              disabled={pending}
            />
          </div>
        )}
      </div>

      {hasPrev && (
        <div className="bg-muted/40 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
          <p className="text-muted-foreground text-sm">
            {t("vendor.form.loadPreviousHint")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadPrevious}
            disabled={pending}
          >
            <History className="size-4" /> {t("vendor.form.loadPrevious")}
          </Button>
        </div>
      )}

      {hiddenEntered > 0 && (
        <p className="text-muted-foreground mb-3 text-xs">
          {t("submitList.hiddenEntries", { count: hiddenEntered })}
        </p>
      )}

      <div className="grid gap-4">
        {view.map((r) => {
          const v = values[r.itemId]
          const done = v.qty.trim() !== ""
          const allocated = r.growers.reduce((s, g) => s + Number(v.allocations[g.growerId] || 0), 0)
          const qtyNum = Number(v.qty || 0)
          const over = allocated > qtyNum + 1e-6
          return (
            <Card
              key={r.itemId}
              className={cn(
                "py-0",
                itemCardClass(over ? "error" : done ? "done" : "neutral")
              )}
            >
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  {/* Photo first, as on the grower form: a vendor reporting
                      stock recognises the item faster from a picture. */}
                  <div className="flex min-w-0 items-start gap-3">
                    <ItemImage
                      itemId={r.itemId}
                      hasImage={r.hasImage}
                      alt={r.itemName}
                      size={48}
                      className="mt-0.5"
                    />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.itemName}</span>
                      {done && <CheckCircle2 className="size-4 text-emerald-600" />}
                    </div>
                    <p className="text-muted-foreground mt-0.5 font-mono text-xs">{r.itemId}</p>
                    <p className="text-muted-foreground text-xs">
                      {r.commodityName ?? "—"} · {r.categoryName ?? "—"}
                      {r.previousQty != null && <> · {t("vendor.form.prev")}: {r.previousQty}</>}
                    </p>
                    </div>
                  </div>

                  {/* The quantity is counted in the item's material category,
                      which the label names — it used to sit in a read-only box
                      beside it, repeating what the meta line above already says. */}
                  <div className="flex items-end gap-3">
                    <div className="w-32">
                      <Label htmlFor={`q-${r.itemId}`} className="text-xs">
                        {t("vendor.form.quantity")}
                        {r.categoryName ? ` (${r.categoryName})` : ""}
                      </Label>
                      <Input id={`q-${r.itemId}`} type="number" min={0} inputMode="decimal" value={v.qty} onChange={(e) => set(r.itemId, { qty: e.target.value })} placeholder="0" />
                    </div>
                  </div>
                </div>

                {r.growers.length > 0 && (
                  <div className="mt-3 border-t pt-3">
                    <button
                      type="button"
                      onClick={() => set(r.itemId, { open: !v.open })}
                      className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium"
                    >
                      {v.open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                      <Users className="size-3.5" /> {t("vendor.form.allocate", { count: r.growers.length })}
                      <Badge variant={over ? "destructive" : "secondary"} className="ml-2">
                        {t("vendor.form.allocated", { allocated, total: qtyNum })}
                      </Badge>
                    </button>

                    {v.open && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {r.growers.map((g) => (
                          <div key={g.growerId} className="bg-muted/40 flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5">
                            <div className="min-w-0">
                              <span className="block truncate text-sm">{g.growerName}</span>
                              {r.previousAllocations[g.growerId] != null && (
                                <span className="text-muted-foreground text-xs">
                                  {t("vendor.form.prevAlloc", {
                                    qty: r.previousAllocations[g.growerId],
                                  })}
                                </span>
                              )}
                            </div>
                            <Input
                              type="number"
                              min={0}
                              inputMode="decimal"
                              className="h-8 w-24 shrink-0"
                              value={v.allocations[g.growerId] ?? ""}
                              onChange={(e) => setAlloc(r.itemId, g.growerId, e.target.value)}
                              placeholder="0"
                            />
                          </div>
                        ))}
                        {over && (
                          <p className="text-destructive sm:col-span-2 text-xs">
                            {t("vendor.form.over")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {rows.length === 0 && (
        <p className="text-muted-foreground text-sm">{t("vendor.form.noItems")}</p>
      )}

      {rows.length > 0 && view.length === 0 && (
        <p className="text-muted-foreground text-sm">{t("submitList.noMatches")}</p>
      )}
    </>
  )
}
