import Link from "next/link"
import { buildQueryString } from "@/lib/query"
import { getT } from "@/lib/i18n/server"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Page numbers to show: first, last and the current page's neighbours, with
 * `null` marking a gap. A gap never hides just one page — that page is shown.
 */
function pageItems(page: number, pages: number): (number | null)[] {
  const keep = new Set([1, pages, page - 1, page, page + 1])
  if (page <= 4) for (let p = 2; p <= 5; p++) keep.add(p)
  if (page >= pages - 3) for (let p = pages - 4; p < pages; p++) keep.add(p)
  const sorted = [...keep].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b)

  const out: (number | null)[] = []
  let prev = 0
  for (const p of sorted) {
    if (p - prev === 2) out.push(prev + 1)
    else if (p - prev > 2) out.push(null)
    out.push(p)
    prev = p
  }
  return out
}

/**
 * URL-driven pager, extracted from DataTable so card-based lists (Outbox,
 * grower history, on-order…) get the same control without being forced into a
 * table. DataTable renders this too, so there is one implementation.
 *
 * `position="top"` renders the same control above the list. History pages need
 * it: each card carries a whole table, so ten of them put the bottom pager well
 * past the fold and the list reads as unpaginated.
 */
export async function Pager({
  page,
  pageCount,
  total,
  searchParams,
  position = "bottom",
}: {
  page: number
  pageCount: number
  total: number
  searchParams: Record<string, string>
  position?: "top" | "bottom"
}) {
  const t = await getT()
  const pages = Math.max(1, pageCount)
  const href = (p: number) => buildQueryString(searchParams, { page: p })
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2",
        position === "top" && "border-b pb-3"
      )}
    >
      <p className="text-muted-foreground text-xs">
        {t("common.records", { count: total })} · {t("common.pageOf", { page, pages })}
      </p>
      <nav aria-label={t("common.pagination")} className="flex flex-wrap items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          asChild
          disabled={page <= 1}
          aria-disabled={page <= 1}
          className={page <= 1 ? "pointer-events-none opacity-50" : ""}
        >
          <Link href={href(page - 1)}>{t("common.previous")}</Link>
        </Button>
        {pageItems(page, pages).map((p, i) =>
          p == null ? (
            <span key={`gap-${i}`} className="text-muted-foreground px-1 text-xs" aria-hidden>
              …
            </span>
          ) : (
            <Button
              key={p}
              variant={p === page ? "default" : "outline"}
              size="sm"
              asChild
              className="min-w-8 px-2 tabular-nums"
            >
              <Link
                href={href(p)}
                aria-current={p === page ? "page" : undefined}
                aria-label={t("common.goToPage", { page: p })}
              >
                {p}
              </Link>
            </Button>
          )
        )}
        <Button
          variant="outline"
          size="sm"
          asChild
          disabled={page >= pages}
          aria-disabled={page >= pages}
          className={page >= pages ? "pointer-events-none opacity-50" : ""}
        >
          <Link href={href(page + 1)}>{t("common.next")}</Link>
        </Button>
      </nav>
    </div>
  )
}
