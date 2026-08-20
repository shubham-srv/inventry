"use client"

import { useActionState, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ChevronDown, ChevronRight, CheckCircle2, History, Users } from "lucide-react"
import { submitVendorReport } from "@/lib/actions/vendor"
import { initialActionState } from "@/lib/actions/types"
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
import { cn } from "@/lib/utils"

type RowState = {
  qty: string
  uom: string
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
          uom: r.uom ?? "",
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

  const payload = useMemo(
    () =>
      JSON.stringify(
        rows
          .filter((r) => values[r.itemId]?.qty.trim() !== "")
          .map((r) => ({
            itemId: r.itemId,
            quantity: Number(values[r.itemId].qty),
            uom: values[r.itemId].uom || null,
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

  // Prefill every quantity with the vendor's last reported value so they only
  // edit what moved. Mirrors the grower form: explicit, never automatic, so
  // nobody submits last week's numbers without looking. Allocations are left
  // alone — they are a breakdown of *this* report's quantity.
  const hasPrev = useMemo(() => rows.some((r) => r.previousQty != null), [rows])
  function loadPrevious() {
    setValues((v) => {
      const next = { ...v }
      for (const r of rows) {
        if (r.previousQty != null) {
          next[r.itemId] = { ...next[r.itemId], qty: String(r.previousQty) }
        }
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
            disabled={pending || entered === 0}
          >
            {pending ? t("common.saving") : t("vendor.form.submit")}
          </Button>
        </div>
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

      <div className="grid gap-3">
        {view.map((r) => {
          const v = values[r.itemId]
          const done = v.qty.trim() !== ""
          const allocated = r.growers.reduce((s, g) => s + Number(v.allocations[g.growerId] || 0), 0)
          const qtyNum = Number(v.qty || 0)
          const over = allocated > qtyNum + 1e-6
          return (
            <Card key={r.itemId} className={cn("py-0", done && "border-emerald-500/40")}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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

                  <div className="flex items-end gap-3">
                    <div className="w-28">
                      <Label htmlFor={`q-${r.itemId}`} className="text-xs">{t("vendor.form.quantity")}</Label>
                      <Input id={`q-${r.itemId}`} type="number" min={0} inputMode="decimal" value={v.qty} onChange={(e) => set(r.itemId, { qty: e.target.value })} placeholder="0" />
                    </div>
                    {/* The unit belongs to the item — shown, never edited. */}
                    <div className="w-24">
                      <Label htmlFor={`u-${r.itemId}`} className="text-xs">{t("vendor.form.unit")}</Label>
                      <Input
                        id={`u-${r.itemId}`}
                        value={v.uom || "—"}
                        readOnly
                        tabIndex={-1}
                        className="bg-muted text-muted-foreground cursor-not-allowed"
                      />
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
                          <div key={g.growerId} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5">
                            <span className="truncate text-sm">{g.growerName}</span>
                            <Input
                              type="number"
                              min={0}
                              inputMode="decimal"
                              className="h-8 w-24"
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
