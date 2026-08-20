"use client"

import { useMemo } from "react"
import { Search, X } from "lucide-react"
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
import { cn } from "@/lib/utils"

/**
 * Search + sort for the grower and vendor submit lists.
 *
 * Both pages hold every row in client state already, so this filters and sorts
 * in the browser rather than round-tripping to the server: the list is one
 * page's worth of authorized items, and a server trip would blow away whatever
 * the user has typed but not yet saved.
 *
 * The controls are presentational — the *state* lives in the parent form,
 * because the parent must keep submitting from the full row list (see
 * useSubmitListView below).
 */

export type SubmitSort = "id" | "name" | "qtyDesc" | "qtyAsc"

export const DEFAULT_SUBMIT_SORT: SubmitSort = "id"

/**
 * The fields the view needs from a row. Both SubmitRow (grower) and
 * VendorSubmitRow (vendor) satisfy this; neither is imported here, so this file
 * stays usable from either side.
 */
export type SubmitListRow = {
  itemId: string
  itemName: string
  commodityName: string | null
  categoryName: string | null
  todayQty: number | null
  previousQty: number | null
}

/**
 * What a quantity sort orders on: today's saved count, else the last one.
 *
 * Deliberately NOT the value currently in the input. Sorting on live keystrokes
 * would shuffle rows out from under the person typing them. Null means "no
 * count on record" — those sort last in BOTH directions, because an item that
 * has never been counted is not the same as one counted at zero.
 */
function sortQuantity(row: SubmitListRow): number | null {
  return row.todayQty ?? row.previousQty
}

function matches(row: SubmitListRow, needle: string): boolean {
  return [row.itemId, row.itemName, row.commodityName, row.categoryName].some(
    (field) => !!field && field.toLowerCase().includes(needle)
  )
}

/**
 * The rows to RENDER, filtered and sorted.
 *
 * Callers must keep using the original `rows` for the submit payload and the
 * progress counters — searching is a view over the list, never a filter on what
 * gets submitted. Hiding a row must not silently drop a quantity someone typed.
 */
export function useSubmitListView<T extends SubmitListRow>(
  rows: T[],
  query: string,
  sort: SubmitSort
): T[] {
  return useMemo(() => {
    const needle = query.trim().toLowerCase()
    const view = needle ? rows.filter((r) => matches(r, needle)) : [...rows]

    // Every comparator falls back to itemId so the order is total — two items
    // with the same name or the same quantity keep a stable, repeatable spot.
    const byId = (a: T, b: T) => a.itemId.localeCompare(b.itemId)
    if (sort === "name") {
      view.sort((a, b) => a.itemName.localeCompare(b.itemName) || byId(a, b))
    } else if (sort === "qtyDesc" || sort === "qtyAsc") {
      const dir = sort === "qtyDesc" ? -1 : 1
      view.sort((a, b) => {
        const qa = sortQuantity(a)
        const qb = sortQuantity(b)
        if (qa == null && qb == null) return byId(a, b)
        if (qa == null) return 1 // uncounted items sink, either direction
        if (qb == null) return -1
        return (qa - qb) * dir || byId(a, b)
      })
    } else {
      view.sort(byId)
    }
    return view
  }, [rows, query, sort])
}

export function SubmitListControls({
  query,
  onQueryChange,
  sort,
  onSortChange,
  shown,
  total,
  disabled,
}: {
  query: string
  onQueryChange: (value: string) => void
  sort: SubmitSort
  onSortChange: (value: SubmitSort) => void
  /** Rows currently visible vs. the full list, for the "showing x of y" note. */
  shown: number
  total: number
  disabled?: boolean
}) {
  const t = useT()
  const filtering = query.trim() !== ""
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-64">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            // type="search" would add a second, unstyled browser clear button
            // next to the one below.
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t("submitList.search")}
            aria-label={t("submitList.search")}
            // Room on the right for the clear button, only once it is there.
            className={cn("pl-8", filtering && "pr-8")}
          />
          {filtering && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t("submitList.clearSearch")}
              onClick={() => onQueryChange("")}
              className="absolute top-1/2 right-1 -translate-y-1/2"
            >
              <X />
            </Button>
          )}
        </div>

        <Select
          value={sort}
          onValueChange={(v) => onSortChange(v as SubmitSort)}
          disabled={disabled}
        >
          <SelectTrigger className="w-auto min-w-44" aria-label={t("submitList.sort")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="id">{t("submitList.sortById")}</SelectItem>
            <SelectItem value="name">{t("submitList.sortByName")}</SelectItem>
            <SelectItem value="qtyDesc">{t("submitList.sortByQtyDesc")}</SelectItem>
            <SelectItem value="qtyAsc">{t("submitList.sortByQtyAsc")}</SelectItem>
          </SelectContent>
        </Select>

        {filtering && (
          <span className="text-muted-foreground text-xs tabular-nums">
            {t("submitList.showing", { shown, total })}
          </span>
        )}
      </div>

      {/* Only worth saying while a quantity sort is active — it explains why the
          list does not re-order as numbers are entered. */}
      {(sort === "qtyDesc" || sort === "qtyAsc") && (
        <p className="text-muted-foreground text-xs">{t("submitList.sortHint")}</p>
      )}
    </div>
  )
}
