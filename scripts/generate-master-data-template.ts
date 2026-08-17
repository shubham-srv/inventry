/**
 * Generates the blank master-data workbook to send the client.
 *
 *   npx tsx scripts/generate-master-data-template.ts [outfile.xlsx]
 *
 * The column spec lives in docs/master-data-upload.md; this file is the
 * executable half of it. Allowed values are imported from lib/constants.ts
 * rather than retyped, so a workbook can never offer a status or unit the app
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
import {
  ROLES,
  ENTITY_STATUS,
  UNITS_OF_MEASURE,
  APPLICATION_METHODS,
  LOCATION_TYPES,
} from "../lib/constants"

const OUT = process.argv[2] ?? "master-data-template.xlsx"
const DATA_ROWS = 1000 // how far down dropdowns and formatting reach

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

type Col = {
  key: string
  width: number
  required?: boolean
  /** Shown when the cell is selected — the rule, in one line. */
  help: string
  /** Turns the column into a dropdown. Keep the joined list under ~255 chars. */
  list?: readonly string[]
}

const YES_NO = ["Yes", "No"] as const
const LOCALES = ["en", "es"] as const
const VENDOR_TYPES = ["Manufacturer", "Pallet Pooling", "3PL", "Distributor"] as const
const ITEM_STATUSES = [ENTITY_STATUS.ACTIVE, ENTITY_STATUS.INACTIVE, ENTITY_STATUS.REVIEW] as const
const GROWER_STATUSES = [ENTITY_STATUS.ACTIVE, ENTITY_STATUS.INACTIVE, ENTITY_STATUS.PENDING] as const
const VENDOR_STATUSES = [ENTITY_STATUS.ACTIVE, ENTITY_STATUS.INACTIVE] as const

/** Sheets in LOAD ORDER — each depends only on the ones before it. */
const SHEETS: { name: string; purpose: string; cols: Col[]; example: unknown[] }[] = [
  {
    name: "1-Regions",
    purpose: "Geographic groupings. Used by locations only.",
    cols: [{ key: "RegionName", width: 24, required: true, help: "Unique. e.g. West" }],
    example: ["West"],
  },
  {
    name: "2-Countries",
    purpose:
      "Shared lookup: item origin, location country, vendor headquarters, vendor supply-to lists.",
    cols: [
      { key: "CountryName", width: 24, required: true, help: "Unique. e.g. USA" },
      {
        key: "SelectableAsRealCountry",
        width: 24,
        list: YES_NO,
        help: "Default Yes. No = placeholder (e.g. N/A): valid as an item's origin, hidden from location/vendor/supply-to pickers.",
      },
    ],
    example: ["USA", "Yes"],
  },
  {
    name: "3-Commodities",
    purpose:
      "Crop / product family. The code becomes the FIRST segment of every item ID and is permanent.",
    cols: [
      { key: "CommodityCode", width: 18, required: true, help: "Exactly 2 uppercase letters, unique. e.g. AP" },
      { key: "CommodityName", width: 30, required: true, help: "e.g. Asparagus" },
    ],
    example: ["AP", "Asparagus"],
  },
  {
    name: "4-MaterialCategories",
    purpose:
      "Packaging material family. The code becomes the SECOND segment of every item ID and is permanent.",
    cols: [
      { key: "MaterialCategoryCode", width: 24, required: true, help: "Exactly 2 uppercase letters, unique. e.g. BX" },
      { key: "MaterialCategoryName", width: 30, required: true, help: "e.g. Boxes" },
    ],
    example: ["BX", "Boxes"],
  },
  {
    name: "5-SubCategories",
    purpose: "Finer split within a material category.",
    cols: [
      { key: "MaterialCategoryCode", width: 24, required: true, help: "Must exist in 4-MaterialCategories" },
      { key: "SubCategoryName", width: 30, required: true, help: "Unique within its category. e.g. Cardboard Boxes" },
    ],
    example: ["BX", "Cardboard Boxes"],
  },
  {
    name: "6-Locations",
    purpose:
      "Physical sites. A grower with no location CANNOT submit inventory, so every active grower needs at least one.",
    cols: [
      { key: "LocationName", width: 30, required: true, help: "Unique" },
      {
        key: "LocationType",
        width: 24,
        required: true,
        list: LOCATION_TYPES.map((t) => t.name),
        help: "Gates who may use the site. Grower-only: Grower Field, Packing House, Cold Storage. Vendor-only: Manufacturing Plant, Distribution Center, 3PL Facility. Either: Warehouse, Cross-dock.",
      },
      { key: "RegionName", width: 18, help: "Must exist in 1-Regions" },
      { key: "CountryName", width: 20, help: "Must exist in 2-Countries and be Selectable" },
      { key: "CommodityFocus", width: 24, help: "Free text. e.g. Asparagus" },
      { key: "KeyPersonnel", width: 24, help: "Free text" },
      { key: "Notes", width: 40, help: "" },
    ],
    example: ["Salinas Packing House", "Packing House", "West", "USA", "Asparagus", "A. Reyes", ""],
  },
  {
    name: "7-Items",
    purpose:
      "IDs are used VERBATIM and can never change. Format CC-MM-NNNNN, where CC and MM must match this row's own codes.",
    cols: [
      {
        key: "ItemID",
        width: 18,
        required: true,
        help: "CC-MM-NNNNN, e.g. AP-BX-00001. CC must equal CommodityCode and MM must equal MaterialCategoryCode on this row. Unique. Permanent.",
      },
      { key: "ItemName", width: 36, required: true, help: "e.g. Corrugated Box 40x30" },
      { key: "CommodityCode", width: 18, required: true, help: "Must exist in 3-Commodities" },
      { key: "MaterialCategoryCode", width: 24, required: true, help: "Must exist in 4-MaterialCategories" },
      { key: "SubCategoryName", width: 26, required: true, help: "Must exist in 5-SubCategories under this row's MaterialCategoryCode" },
      { key: "CountryOfOrigin", width: 20, required: true, help: "Must exist in 2-Countries" },
      {
        key: "UnitOfMeasure",
        width: 18,
        required: true,
        list: UNITS_OF_MEASURE,
        help: "PERMANENT in practice: every count, order and threshold for this item inherits it. Changing it later does not convert historical quantities.",
      },
      { key: "ApplicationMethod", width: 20, list: APPLICATION_METHODS, help: "Optional" },
      { key: "Status", width: 14, required: true, list: ITEM_STATUSES, help: "" },
      { key: "LegacyItemRef", width: 20, help: "Your existing identifier, carried through for reconciliation. Not used as a key." },
      { key: "Notes", width: 40, help: "" },
    ],
    example: [
      "AP-BX-00001", "Corrugated Box 40x30", "AP", "BX", "Cardboard Boxes",
      "USA", "Cases", "Machine", "Active", "FAM-10023", "",
    ],
  },
  {
    name: "8-Growers",
    purpose: "Grower organisations.",
    cols: [
      { key: "GrowerName", width: 30, required: true, help: "Unique. Used as the key in the mapping sheets." },
      { key: "PrimaryEmail", width: 32, help: "Where submission confirmations and reminders are sent" },
      { key: "Status", width: 14, required: true, list: GROWER_STATUSES, help: "" },
      { key: "PreferredLocale", width: 18, required: true, list: LOCALES, help: "Language for emails to PrimaryEmail" },
    ],
    example: ["Agribar", "ops@agribar.example", "Active", "en"],
  },
  {
    name: "9-Vendors",
    purpose: "Suppliers.",
    cols: [
      { key: "VendorName", width: 30, required: true, help: "Unique. Used as the key in the mapping sheets." },
      { key: "VendorType", width: 20, list: VENDOR_TYPES, help: "" },
      { key: "HeadquartersCountry", width: 24, help: "Must exist in 2-Countries. Where the vendor is BASED — may differ from the country of the site it ships from." },
      { key: "LocationName", width: 30, help: "Must exist in 6-Locations and be a vendor-usable type. The vendor's region is read from here." },
      { key: "PrimaryContact", width: 24, help: "" },
      { key: "ContactEmail", width: 30, help: "" },
      { key: "ContactPhone", width: 20, help: "" },
      { key: "LeadTimeDays", width: 16, help: "Whole days from order to delivery, 0 or more" },
      { key: "PaymentTermsDays", width: 20, help: "'Net N days' — the number only, 0 or more" },
      { key: "PTAccountNumber", width: 20, help: "" },
      { key: "Status", width: 14, required: true, list: VENDOR_STATUSES, help: "" },
      { key: "PreferredLocale", width: 18, required: true, list: LOCALES, help: "" },
      { key: "Notes", width: 40, help: "" },
    ],
    example: [
      "PackRight Manufacturing", "Manufacturer", "USA", "PackRight Plant", "Sam Carter",
      "sam@packright.example", "+1-555-0101", 5, 30, "", "Active", "en", "",
    ],
  },
  {
    name: "10-Users",
    purpose:
      "People who sign in. No passwords: internal staff use Microsoft sign-in, growers and vendors get an emailed link — so the email IS the identity.",
    cols: [
      { key: "FirstName", width: 20, required: true, help: "" },
      { key: "LastName", width: 20, required: true, help: "" },
      {
        key: "Email",
        width: 32,
        required: true,
        help: "Unique across this sheet. For internal staff this MUST be their Microsoft sign-in address (UPN).",
      },
      { key: "Role", width: 18, required: true, list: Object.values(ROLES), help: "Editor = master data only. GrowerUser / VendorUser see only their own organisation." },
      { key: "GrowerName", width: 26, help: "Required when Role is GrowerUser. Must be blank otherwise." },
      { key: "VendorName", width: 26, help: "Required when Role is VendorUser. Must be blank otherwise." },
      { key: "IsActive", width: 12, required: true, list: YES_NO, help: "" },
      { key: "PreferredLocale", width: 18, required: true, list: LOCALES, help: "This person's UI and email language" },
    ],
    example: ["James", "Ortiz", "james@agribar.example", "GrowerUser", "Agribar", "", "Yes", "en"],
  },
  {
    name: "11-GrowerLocations",
    purpose:
      "Which sites each grower counts at. One row per pair. A grower missing from this sheet cannot submit at all.",
    cols: [
      { key: "GrowerName", width: 30, required: true, help: "Must exist in 8-Growers" },
      { key: "LocationName", width: 30, required: true, help: "Must exist in 6-Locations and be a grower-usable type" },
    ],
    example: ["Agribar", "Salinas Packing House"],
  },
  {
    name: "12-GrowerItems",
    purpose:
      "Which items each grower may count. One row per pair. A grower only ever sees items listed here.",
    cols: [
      { key: "GrowerName", width: 30, required: true, help: "Must exist in 8-Growers" },
      { key: "ItemID", width: 18, required: true, help: "Must exist in 7-Items" },
    ],
    example: ["Agribar", "AP-BX-00001"],
  },
  {
    name: "13-VendorItems",
    purpose: "Which items each vendor supplies. One row per pair.",
    cols: [
      { key: "VendorName", width: 30, required: true, help: "Must exist in 9-Vendors" },
      { key: "ItemID", width: 18, required: true, help: "Must exist in 7-Items" },
    ],
    example: ["PackRight Manufacturing", "AP-BX-00001"],
  },
  {
    name: "14-VendorCategories",
    purpose:
      "Which material categories each vendor supplies. Should be consistent with 13-VendorItems.",
    cols: [
      { key: "VendorName", width: 30, required: true, help: "Must exist in 9-Vendors" },
      { key: "MaterialCategoryCode", width: 24, required: true, help: "Must exist in 4-MaterialCategories" },
    ],
    example: ["PackRight Manufacturing", "BX"],
  },
  {
    name: "15-VendorSupplyCountries",
    purpose:
      "Which countries each vendor can ship TO. Different from HeadquartersCountry, which is where they are based.",
    cols: [
      { key: "VendorName", width: 30, required: true, help: "Must exist in 9-Vendors" },
      { key: "CountryName", width: 24, required: true, help: "Must exist in 2-Countries and be Selectable" },
    ],
    example: ["PackRight Manufacturing", "Canada"],
  },
]

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
  ["li", "Row 1 is the header. Do not rename, reorder or delete columns."],
  ["li", "Required columns are marked with * in the header and shaded."],
  ["li", "Leave optional cells BLANK. Do not write 'N/A' or '-' unless it is a listed option."],
  ["li", "Row 2 of every sheet is a greyed-out EXAMPLE. Delete it before sending the file back."],
  ["li", "Sheets refer to each other by name (grower name, location name, category code) — spelled identically, including case. Items are the exception: they are referenced by ItemID."],
  ["li", `Dropdowns and formatting cover rows 2–${DATA_ROWS}. If you need more rows, copy a formatted row down rather than typing into unformatted cells.`],
  ["", ""],
  ["h2", "Item IDs"],
  ["p", "Item IDs are yours to choose and are used exactly as written. They can never be changed afterwards — every count, order and history record points at them."],
  ["li", "Format: CC-MM-NNNNN, e.g. AP-BX-00001"],
  ["li", "CC must match the row's CommodityCode; MM must match its MaterialCategoryCode"],
  ["li", "NNNNN is a 5-digit number, 00001 to 99999. Gaps are fine; duplicates are not."],
  ["li", "Items added in the app later continue from your highest number, so nothing is ever reused."],
  ["", ""],
  ["h2", "Two things that are easy to get wrong"],
  ["li", "UnitOfMeasure is effectively permanent. Every quantity ever recorded for an item is in this unit; changing it later reinterprets history rather than converting it."],
  ["li", "A grower with no row in 11-GrowerLocations cannot submit inventory at all. Every active grower needs at least one site."],
  ["", ""],
  ["h2", "Not needed here"],
  ["p", "Thresholds, reminder schedules, packaging setup and item messages are configured in the application after go-live. So is anything transactional — counts, orders, history."],
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
