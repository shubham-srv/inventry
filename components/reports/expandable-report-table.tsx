import { Fragment } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Pager } from "@/components/pager"
import { buildQueryString } from "@/lib/query"
import { cn } from "@/lib/utils"

export type ReportColumn<T> = {
  key: string
  header: React.ReactNode
  cell: (row: T) => React.ReactNode
  className?: string
  headClassName?: string
}

/** Rows currently expanded, from `?open=3,7`. */
export function openKeysFrom(sp: Record<string, string>): Set<string> {
  return new Set((sp.open ?? "").split(",").filter(Boolean))
}

function toggleHref(sp: Record<string, string>, key: string): string {
  const open = openKeysFrom(sp)
  if (open.has(key)) open.delete(key)
  else open.add(key)
  return buildQueryString({ ...sp, open: [...open].join(",") }) || "?"
}

/**
 * A paged table whose rows open in place to show a detail panel underneath —
 * a grower's items under the grower, a vendor's items under the vendor.
 *
 * Which rows are open lives in the URL (`?open=…`), not client state: the
 * detail renders on the server under the same filters as the table, and an
 * expanded view can be bookmarked or shared.
 */
export function ExpandableReportTable<T>({
  columns,
  rows,
  getRowKey,
  renderDetail,
  searchParams,
  page,
  pageCount,
  total,
  emptyMessage,
}: {
  columns: ReportColumn<T>[]
  rows: T[]
  getRowKey: (row: T) => string | number
  renderDetail: (row: T) => React.ReactNode
  searchParams: Record<string, string>
  page: number
  pageCount: number
  total: number
  emptyMessage: string
}) {
  const open = openKeysFrom(searchParams)
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-0" />
              {columns.map((c) => (
                <TableHead key={c.key} className={c.headClassName}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className="text-muted-foreground h-24 text-center">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => {
              const key = String(getRowKey(row))
              const isOpen = open.has(key)
              return (
                <Fragment key={key}>
                  <TableRow className={cn(isOpen && "bg-muted/40")}>
                    <TableCell className="w-0 pr-0">
                      <Link
                        href={toggleHref(searchParams, key)}
                        scroll={false}
                        aria-expanded={isOpen}
                        aria-label={isOpen ? "Collapse" : "Expand"}
                        className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-7 items-center justify-center rounded-md"
                      >
                        {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </Link>
                    </TableCell>
                    {columns.map((c) => (
                      <TableCell key={c.key} className={c.className}>
                        {c.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                  {isOpen && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={columns.length + 1} className="bg-muted/20 p-3 whitespace-normal">
                        {renderDetail(row)}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <Pager page={page} pageCount={pageCount} total={total} searchParams={searchParams} />
    </div>
  )
}

/**
 * A column header that sorts the table. Clicking toggles between `primary` and
 * `secondary` (e.g. oldest-first / newest-first); the arrow shows which is on.
 */
export function SortHeader({
  label,
  searchParams,
  current,
  primary,
  secondary,
  defaultSort,
}: {
  label: string
  searchParams: Record<string, string>
  current: string
  primary: string
  secondary?: string
  /** The sort in force when the URL names none — written as no parameter. */
  defaultSort: string
}) {
  const active = current === primary || current === secondary
  const next = current === primary && secondary ? secondary : primary
  const href =
    buildQueryString({ ...searchParams, sort: next === defaultSort ? undefined : next, page: undefined }) || "?"
  return (
    <Link href={href} scroll={false} className="hover:text-foreground inline-flex items-center gap-1 whitespace-nowrap">
      {label}
      {active &&
        (current === secondary ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />)}
    </Link>
  )
}
