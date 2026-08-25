import { getT } from "@/lib/i18n/server"
import {
  Table,
  TableBody,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/** Rows shown before the rest go behind the disclosure. */
const VISIBLE_ROWS = 8

/**
 * The detail table inside one history card, with a long tail folded away.
 *
 * A vendor reporting forty items used to render forty rows per card, so ten
 * cards was a wall of table and the pager at the foot of the page was nowhere
 * near the fold. The overflow goes behind a native <details>, which keeps these
 * pages fully server-rendered — no client component, no hydration.
 *
 * Two tables rather than one, because <details> is flow content and cannot live
 * inside a <table>. `table-fixed` plus a shared <colgroup> keeps the columns of
 * the two lined up — the widths come from the colgroup, so hiding the second
 * table's header does not shift them. `min-w` keeps the columns readable on a
 * phone: the container the Table primitive provides scrolls sideways, the page
 * itself never does.
 */
export async function HistoryDetailTable({
  cols,
  head,
  rows,
}: {
  /** Shared <col> widths — both tables use these, so the columns align. */
  cols: React.ReactNode
  head: React.ReactNode
  rows: React.ReactNode[]
}) {
  const t = await getT()
  const firstRows = rows.slice(0, VISIBLE_ROWS)
  const restRows = rows.slice(VISIBLE_ROWS)

  return (
    <>
      <Table className="min-w-136 table-fixed">
        <colgroup>{cols}</colgroup>
        <TableHeader>
          <TableRow>{head}</TableRow>
        </TableHeader>
        <TableBody>{firstRows}</TableBody>
      </Table>

      {restRows.length > 0 && (
        <details className="group/more border-t">
          <summary className="text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer list-none px-3 py-2 text-xs font-medium">
            <span className="group-open/more:hidden">
              {t("common.showAllItems", { count: rows.length })}
            </span>
            <span className="hidden group-open/more:inline">
              {t("common.showFewer")}
            </span>
          </summary>
          <Table className="min-w-136 table-fixed">
            <colgroup>{cols}</colgroup>
            {/* Repeated for screen readers only — the visible header is above. */}
            <TableHeader className="sr-only">
              <TableRow>{head}</TableRow>
            </TableHeader>
            <TableBody>{restRows}</TableBody>
          </Table>
        </details>
      )}
    </>
  )
}
