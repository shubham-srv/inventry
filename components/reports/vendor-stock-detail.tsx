import { format } from "date-fns"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { NotesCell } from "@/components/data-table/notes-cell"
import { getVendorStock, type VendorStockFilters } from "@/lib/admin/vendor-stock"

/** One vendor's items, opened under its row in the vendor-stock report. */
export async function VendorStockDetail({
  vendorId,
  filters,
}: {
  vendorId: number
  filters: VendorStockFilters
}) {
  const { rows } = await getVendorStock({ ...filters, vendorId })
  if (rows.length === 0)
    return <p className="text-muted-foreground px-1 text-sm">No items match these filters.</p>

  const dash = <span className="text-muted-foreground">—</span>

  return (
    <div className="bg-background overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Legacy ID</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Reported</TableHead>
            <TableHead className="text-right">Allocated</TableHead>
            <TableHead className="text-right">Unallocated</TableHead>
            <TableHead className="text-right">Growers</TableHead>
            <TableHead>Last reported</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            // Reported, but not on the vendor's latest report — the number is older.
            const older =
              r.asOf && r.lastSubmittedAt && r.asOf.getTime() < r.lastSubmittedAt.getTime()
            return (
              <TableRow key={r.itemId}>
                <TableCell>
                  <span className="font-medium">{r.itemName}</span>
                  <p className="text-muted-foreground font-mono text-xs">{r.itemId}</p>
                </TableCell>
                <TableCell className="font-mono text-xs">{r.legacyId ?? dash}</TableCell>
                <TableCell className="text-xs">
                  {r.categoryName ?? "—"}
                  <p className="text-muted-foreground">{r.commodityName ?? ""}</p>
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {r.reported == null ? (
                    <span className="text-muted-foreground text-xs">Never reported</span>
                  ) : (
                    `${r.reported} ${r.categoryName ?? ""}`
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.allocated ?? dash}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.unallocated == null ? (
                    dash
                  ) : r.unallocated > 0 ? (
                    <span className="text-amber-700 dark:text-amber-400">{r.unallocated}</span>
                  ) : (
                    r.unallocated
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.growersServed ?? dash}</TableCell>
                <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                  {r.asOf ? format(r.asOf, "MMM d") : "—"}
                  {older && <p>not in latest report</p>}
                </TableCell>
                <TableCell>
                  <NotesCell notes={r.notes} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
