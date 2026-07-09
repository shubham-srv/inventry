import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { buildQueryString } from "@/lib/query"
import { getT } from "@/lib/i18n/server"
import { cn } from "@/lib/utils"

export type Column<T> = {
  key: string
  header: string
  cell?: (row: T) => React.ReactNode
  className?: string
  headClassName?: string
}

type Props<T> = {
  columns: Column<T>[]
  rows: T[]
  getRowKey: (row: T) => string | number
  page: number
  pageCount: number
  total: number
  searchParams: Record<string, string>
  emptyMessage?: string
}

export async function DataTable<T>({
  columns,
  rows,
  getRowKey,
  page,
  pageCount,
  total,
  searchParams,
  emptyMessage,
}: Props<T>) {
  const t = await getT()
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
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
                <TableCell
                  colSpan={columns.length}
                  className="text-muted-foreground h-24 text-center"
                >
                  {emptyMessage ?? t("common.noRecords")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={getRowKey(row)}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={cn(c.className)}>
                    {c.cell ? c.cell(row) : String((row as Record<string, unknown>)[c.key] ?? "")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          {t("common.records", { count: total })} ·{" "}
          {t("common.pageOf", { page, pages: Math.max(1, pageCount) })}
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
            disabled={page >= pageCount}
            aria-disabled={page >= pageCount}
            className={page >= pageCount ? "pointer-events-none opacity-50" : ""}
          >
            <Link href={buildQueryString(searchParams, { page: page + 1 })}>
              {t("common.next")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
