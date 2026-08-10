import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Pager } from "@/components/pager"
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

      <Pager page={page} pageCount={pageCount} total={total} searchParams={searchParams} />
    </div>
  )
}
