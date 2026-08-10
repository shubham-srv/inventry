import Link from "next/link"
import { buildQueryString } from "@/lib/query"
import { getT } from "@/lib/i18n/server"
import { Button } from "@/components/ui/button"

/**
 * URL-driven pager, extracted from DataTable so card-based lists (Outbox,
 * grower history, on-order…) get the same control without being forced into a
 * table. DataTable renders this too, so there is one implementation.
 */
export async function Pager({
  page,
  pageCount,
  total,
  searchParams,
}: {
  page: number
  pageCount: number
  total: number
  searchParams: Record<string, string>
}) {
  const t = await getT()
  const pages = Math.max(1, pageCount)
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-muted-foreground text-xs">
        {t("common.records", { count: total })} · {t("common.pageOf", { page, pages })}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          asChild
          disabled={page <= 1}
          aria-disabled={page <= 1}
          className={page <= 1 ? "pointer-events-none opacity-50" : ""}
        >
          <Link href={buildQueryString(searchParams, { page: page - 1 })}>
            {t("common.previous")}
          </Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          asChild
          disabled={page >= pages}
          aria-disabled={page >= pages}
          className={page >= pages ? "pointer-events-none opacity-50" : ""}
        >
          <Link href={buildQueryString(searchParams, { page: page + 1 })}>
            {t("common.next")}
          </Link>
        </Button>
      </div>
    </div>
  )
}
