import "server-only"
import ExcelJS from "exceljs"

export type ExcelColumn = { header: string; key: string; width?: number }
export type ExcelSheet = {
  name: string
  columns: ExcelColumn[]
  rows: Record<string, unknown>[]
}

/** Builds an .xlsx workbook (one worksheet per sheet) and returns the bytes. */
export async function buildWorkbook(sheets: ExcelSheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Inventory Management"
  wb.created = new Date()

  for (const sheet of sheets) {
    // Worksheet names can't exceed 31 chars or contain certain characters.
    const safeName = sheet.name.replace(/[\\/*?:[\]]/g, " ").slice(0, 31)
    const ws = wb.addWorksheet(safeName)
    ws.columns = sheet.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width ?? 22,
    }))
    ws.addRows(sheet.rows)
    ws.getRow(1).font = { bold: true }
    ws.getRow(1).alignment = { vertical: "middle" }
    ws.views = [{ state: "frozen", ySplit: 1 }]
  }

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
