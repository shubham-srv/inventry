import { Skeleton } from "@/components/ui/skeleton"

/**
 * Catch-all route skeleton for every page under (app).
 *
 * Next renders this while a navigation's server work is in flight. It replaces
 * the whole segment rather than just the table, because every page here awaits
 * its capability check and queries at the top level — so the page is one async
 * unit and there is no shell to keep. Pair it with the spinner on the clicked
 * sidebar link (components/app-sidebar.tsx), which is what tells the user WHICH
 * page is coming.
 *
 * If per-page polish is ever wanted, the move is to render the header/toolbar
 * synchronously in each page and wrap only the data-fetching part in <Suspense>.
 */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      {/* Page header */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="ml-auto h-9 w-32" />
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <div className="bg-muted/40 flex items-center gap-4 border-b px-4 py-3">
          {[40, 20, 20, 20].map((w, i) => (
            <Skeleton key={i} className="h-4" style={{ width: `${w}%` }} />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
            {[40, 20, 20, 20].map((w, i) => (
              <Skeleton key={i} className="h-4" style={{ width: `${w}%` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
