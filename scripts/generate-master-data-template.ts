/**
 * Generates the blank master-data workbook to send the client.
 *
 *   npx tsx scripts/generate-master-data-template.ts [outfile.xlsx]
 *
 * The column spec lives in docs/master-data-upload.md; this file is the
 * executable half of it. Allowed values are imported from lib/constants.ts
 * rather than retyped, so a workbook can never offer a status or type the app
 * would reject — if the constants change, regenerate and resend.
 *
 * Excel specifics worth knowing before editing:
 *  - Dropdowns are applied to a RANGE, not "the whole column". Excel has no
 *    open-ended validation, so we cover rows 2..1000 and note the limit below.
 *  - `promptTitle`/`prompt` shows the rule when the cell is selected. That is
 *    the only in-file documentation most people will actually read.
 *  - Formula lists have a ~255-character limit. Longer lists (countries, items)
 *    are therefore free text validated at import, not dropdowns.
 */
import ExcelJS from "exceljs"
import { SHEETS, DATA_ROWS } from "./master-data-spec"

const OUT = process.argv[2] ?? "master-data-template.xlsx"

/**
 * exceljs's typings lag its runtime in two ways this script needs.
 *
 *  1. RANGE-level validation. `worksheet.dataValidations.add(range, rule)`
 *     works but is undeclared — index.d.ts types only the per-CELL
 *     `cell.dataValidation`. Going cell-by-cell would instantiate ~60,000 cell
 *     objects to cover rows 4–1000 across every sheet, bloating the file for no
 *     gain, so the range API is used through the narrow declaration below.
 *  2. `type: "any"`, which attaches an input prompt WITHOUT constraining the
 *     value, is missing from the DataValidation union.
 *
 * Both are declared here rather than cast away with `any`, so a future exceljs
 * upgrade that changes either shape fails the typecheck instead of at runtime.
 */
type ValidationRule = Omit<ExcelJS.DataValidation, "type" | "formulae"> & {
  type: ExcelJS.DataValidation["type"] | "any"
  formulae?: string[]
}
function validationsOf(ws: ExcelJS.Worksheet): { add(range: string, rule: ValidationRule): void } {
  return (ws as unknown as { dataValidations: { add(r: string, v: ValidationRule): void } })
    .dataValidations
}

// ---------------------------------------------------------------------------

const wb = new ExcelJS.Workbook()
wb.creator = "Inventory Management"
wb.created = new Date()

// ---- README ---------------------------------------------------------------
const readme = wb.addWorksheet("README", {
  properties: { tabColor: { argb: "FF1F6FEB" } },
})
readme.columns = [{ width: 4 }, { width: 110 }]

const readmeLines: [string, string][] = [
  ["h1", "Master data upload"],
  ["p", "One sheet per entity. Fill them in the numbered order — each depends on the ones before it."],
  ["", ""],
  ["h2", "Rules"],
  ["li", "Row 1 describes the sheet. Row 2 is the header — do not rename, reorder or delete columns."],
  ["li", "Required columns are marked with * in the header and shaded."],
  ["li", "Leave optional cells BLANK. Do not write 'N/A' or '-' unless it is a listed option."],
  ["li", "Row 3 of every sheet is a greyed-out EXAMPLE. Delete it before sending the file back — if you forget, the import skips it and says so."],
  ["li", "Your data starts on row 4."],
  ["li", "Sheets refer to each other by name (grower name, location name, category code) — spelled identically, including case. Items are the exception: they are referenced by ItemID."],
  ["li", `Dropdowns and formatting cover rows 4–${DATA_ROWS}. If you need more rows, copy a formatted row down rather than typing into unformatted cells.`],
  ["", ""],
  ["h2", "Item IDs"],
  ["p", "Item IDs are yours to choose and are used exactly as written. They can never be changed afterwards — every count, order and history record points at them."],
  ["li", "Format: CC-MM-NNNNN, e.g. AP-BX-00001"],
  ["li", "CC must match the row's CommodityCode; MM must match its MaterialCategoryCode"],
  ["li", "NNNNN is a 5-digit number, 00001 to 99999. Gaps are fine; duplicates are not."],
  ["li", "Items added in the app later continue from your highest number, so nothing is ever reused."],
  ["", ""],
  ["h2", "Two things that are easy to get wrong"],
  ["li", "MaterialCategoryCode is what an item's quantities are counted in — an item in \"Boxes\" is counted in boxes. There is no separate unit column. Renaming a category later relabels every quantity ever recorded for its items; it does not convert them."],
  ["li", "A grower with no row in 11-GrowerLocations cannot submit inventory at all. Every active grower needs at least one site."],
  ["", ""],
  ["h2", "Item photos"],
  ["p", "Photos are optional, one per item. Send them as a plain folder (or zip) next to this workbook — do not paste pictures into the cells; a workbook with images embedded quickly becomes too large to open or email."],
  ["li", "Put the file name in the ImageFile column of 7-Items, e.g. AP-BX-00001.jpg"],
  ["li", "Names must match the files exactly, including capitalisation and extension."],
  ["li", "JPG, PNG or WebP, up to 10 MB each. They are resized on import, so there is no need to shrink them first."],
  ["li", "An item with no photo is fine — leave the cell blank. A name with no matching file is reported as a warning and the item loads without a photo."],
  ["", ""],
  ["h2", "Sheets 17–20 are optional"],
  ["p", "Packaging, thresholds and reminder schedules can all be set up in the application after go-live. Fill these in only if you already know the values — leaving any of them empty is fine and holds nothing up."],
  ["li", "Two cells take a comma-separated list, innermost container first: Levels on 17-PackagingChains (\"Boxes, Cases\") and Ratios on 18-VendorPackaging (\"10, 5\"). They must line up — one ratio per level in that row's chain."],
  ["li", "Packaging is DESCRIPTIVE. It works out how many boxes, cases or pallets an ordered quantity occupies in transit; those containers are discarded on arrival and are never stock. What a grower orders is what a grower receives."],
  ["li", "On 19-ItemThresholds and 20-ReminderSchedules, a blank GrowerName means the default that applies to everyone. Name a grower to override it for them."],
  ["", ""],
  ["h2", "Not needed here"],
  ["p", "Item messages are configured in the application after go-live. So is anything transactional — counts, orders, history."],
]

for (const [kind, text] of readmeLines) {
  const row = readme.addRow(["", text])
  const cell = row.getCell(2)
  cell.alignment = { wrapText: true, vertical: "top" }
  if (kind === "h1") {
    cell.font = { bold: true, size: 16 }
    row.height = 26
  } else if (kind === "h2") {
    cell.font = { bold: true, size: 12 }
    row.height = 22
  } else if (kind === "li") {
    row.getCell(1).value = "•"
    row.getCell(1).alignment = { horizontal: "right" }
    row.height = 30
  } else if (kind === "p") {
    row.height = 30
  }
}

// ---- Data sheets ----------------------------------------------------------
for (const sheet of SHEETS) {
  const ws = wb.addWorksheet(sheet.name)
  ws.columns = sheet.cols.map((c) => ({ width: c.width }))

  // Row 1: what this sheet is for.
  const purpose = ws.addRow([sheet.purpose])
  ws.mergeCells(1, 1, 1, sheet.cols.length)
  purpose.getCell(1).font = { italic: true, size: 10, color: { argb: "FF444444" } }
  purpose.getCell(1).alignment = { wrapText: true, vertical: "middle" }
  purpose.height = sheet.purpose.length > 90 ? 34 : 20

  // Row 2: headers. Required ones are shaded and starred.
  const header = ws.addRow(sheet.cols.map((c) => (c.required ? `${c.key} *` : c.key)))
  header.font = { bold: true, color: { argb: "FFFFFFFF" } }
  header.height = 20
  header.eachCell((cell, i) => {
    const col = sheet.cols[i - 1]
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: col.required ? "FF1F6FEB" : "FF6B7280" },
    }
    cell.alignment = { vertical: "middle" }
    if (col.help) {
      // The only in-file documentation most people will read.
      cell.note = { texts: [{ text: col.help }] }
    }
  })
  ws.views = [{ state: "frozen", ySplit: 2 }]
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: sheet.cols.length } }

  // Row 3: a greyed example, to be deleted.
  const example = ws.addRow(sheet.example)
  example.font = { italic: true, color: { argb: "FF9CA3AF" } }

  // Validation from row 4 (first blank row) down.
  const FIRST = 4
  sheet.cols.forEach((col, i) => {
    const letter = ws.getColumn(i + 1).letter
    const range = `${letter}${FIRST}:${letter}${DATA_ROWS}`
    if (col.list) {
      const joined = col.list.join(",")
      if (joined.length > 250) {
        throw new Error(`${sheet.name}.${col.key}: dropdown list too long for Excel (${joined.length} chars)`)
      }
      validationsOf(ws).add(range, {
        type: "list",
        allowBlank: !col.required,
        formulae: [`"${joined}"`],
        showErrorMessage: true,
        errorStyle: "error",
        errorTitle: "Not an allowed value",
        error: `${col.key} must be one of: ${col.list.join(", ")}`,
        showInputMessage: !!col.help,
        promptTitle: col.key,
        prompt: col.help,
      })
    } else if (col.help) {
      // No dropdown, but still surface the rule when the cell is selected.
      validationsOf(ws).add(range, {
        type: "any",
        showInputMessage: true,
        promptTitle: col.required ? `${col.key} (required)` : col.key,
        prompt: col.help,
      })
    }
  })
}

await wb.xlsx.writeFile(OUT)

const required = SHEETS.reduce((n, s) => n + s.cols.filter((c) => c.required).length, 0)
console.log(`Wrote ${OUT}`)
console.log(`  ${SHEETS.length} data sheets + README`)
console.log(`  ${SHEETS.reduce((n, s) => n + s.cols.length, 0)} columns, ${required} required`)
console.log(`  dropdowns and prompts cover rows 4–${DATA_ROWS}`)
