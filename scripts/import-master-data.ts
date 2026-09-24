/**
 * Loads a filled-in master-data workbook into the database.
 *
 *   npx tsx scripts/import-master-data.ts <workbook.xlsx> [--dry-run] [--quiet]
 *
 * The workbook's shape comes from ./master-data-spec, the same definition
 * generate-master-data-template.ts writes from — so the file this reads and the
 * file we sent the client cannot drift apart.
 *
 * TWO PASSES, AND THE DATABASE IS NOT TOUCHED UNTIL THE FIRST ONE IS CLEAN.
 * Pass 1 reads every sheet, resolves every cross-sheet reference and reports
 * every problem at once, with sheet and row numbers. Only if it finds nothing
 * does pass 2 write. A client filling in twenty sheets by hand will have more
 * than one mistake on the first attempt, and half-imported master data is
 * miserable to unpick — a list of all forty problems is worth far more than
 * stopping at the first.
 *
 * IT IS RE-RUNNABLE. Every write is an upsert keyed on the same natural key the
 * workbook uses (item id, grower name, vendor+item, ...), so fixing a row and
 * re-running the whole file converges rather than duplicating. That is also why
 * pass 2 does not sit in one big transaction: validation has already ruled out
 * the realistic failures, a single transaction over twenty sheets is a long one
 * to hold against a Basic-tier database, and the recovery for the unrealistic
 * failure is simply to run the file again.
 *
 * WHAT IT DOES NOT DO. Item photos. The ImageFile column is validated and
 * counted, but the files themselves are not uploaded — that needs the storage
 * account and belongs with lib/storage. Named files are reported so nothing is
 * silently dropped.
 */
import path from "node:path"
import ExcelJS from "exceljs"
import { PrismaClient, Prisma } from "@prisma/client"
import { SHEETS, type SheetSpec } from "./master-data-spec"
import { LOCATION_TYPE_SEED } from "../lib/constants"

const prisma = new PrismaClient()

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const FILE = args.find((a) => !a.startsWith("--"))
const DRY_RUN = args.includes("--dry-run")
const QUIET = args.includes("--quiet")

if (!FILE) {
  console.error("Usage: npx tsx scripts/import-master-data.ts <workbook.xlsx> [--dry-run]")
  process.exit(2)
}

// ---------------------------------------------------------------------------
// Reading the workbook
// ---------------------------------------------------------------------------

/** One sheet's rows, as maps of column key -> trimmed cell text, plus the row number. */
type Row = { row: number; get(key: string): string; has(key: string): boolean }

type Problem = { sheet: string; row: number | null; message: string }
const errors: Problem[] = []
const warnings: Problem[] = []

const err = (sheet: string, row: number | null, message: string) =>
  errors.push({ sheet, row, message })
const warn = (sheet: string, row: number | null, message: string) =>
  warnings.push({ sheet, row, message })

/**
 * A cell as text.
 *
 * Excel hands back numbers, dates, formula results and rich text, and a client
 * who typed a code into a "general" cell may well produce a number where we
 * expect a string. Everything is normalised to trimmed text here and converted
 * deliberately later, so the rest of the script never has to ask what a cell's
 * runtime type is.
 */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "object") {
    const v = value as { result?: unknown; richText?: { text: string }[]; text?: string }
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("").trim()
    if (v.text !== undefined) return String(v.text).trim()
    if (v.result !== undefined) return String(v.result).trim()
  }
  return String(value).trim()
}

/**
 * Finds the header row rather than assuming row 2.
 *
 * The generated file puts the purpose on row 1 and headers on row 2, but a
 * client who has been living in this workbook for a fortnight may well have
 * inserted a row. Matching on the header text instead makes that harmless,
 * and a sheet whose headers cannot be found at all is a real error worth
 * reporting clearly.
 */
function readSheet(wb: ExcelJS.Workbook, spec: SheetSpec): Row[] | null {
  const ws = wb.getWorksheet(spec.name)
  if (!ws) {
    err(spec.name, null, "sheet is missing from the workbook")
    return null
  }

  const wanted = spec.cols.map((c) => c.key.toLowerCase())
  let headerRow = 0
  const colOf = new Map<string, number>()

  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const found = new Map<string, number>()
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, c) => {
      // "VendorName *" -> "vendorname"
      const key = cellText(cell.value).replace(/\*/g, "").trim().toLowerCase()
      if (key && wanted.includes(key) && !found.has(key)) found.set(key, c)
    })
    if (found.size >= Math.ceil(wanted.length / 2)) {
      headerRow = r
      for (const [k, c] of found) colOf.set(k, c)
      break
    }
  }

  if (!headerRow) {
    err(spec.name, null, `could not find the header row — expected columns: ${spec.cols.map((c) => c.key).join(", ")}`)
    return null
  }

  const missing = spec.cols.filter((c) => !colOf.has(c.key.toLowerCase()))
  for (const c of missing) {
    // Only required columns are fatal: an optional column a client deleted can
    // be treated as blank, and refusing the whole file over it helps nobody.
    if (c.required) err(spec.name, headerRow, `required column "${c.key}" is missing`)
    else warn(spec.name, headerRow, `optional column "${c.key}" is missing — treated as blank`)
  }

  const rows: Row[] = []
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const raw = ws.getRow(r)
    const values = new Map<string, string>()
    let any = false
    for (const col of spec.cols) {
      const c = colOf.get(col.key.toLowerCase())
      const text = c ? cellText(raw.getCell(c).value) : ""
      if (text) any = true
      values.set(col.key, text)
    }
    if (!any) continue // blank row — Excel is full of them

    // The greyed example row the README asks them to delete.
    //
    // Matched on the generator's italic styling AS WELL AS the values, and both
    // are needed. On values alone we would drop a client's real first row
    // whenever it happened to equal the example — "1-Regions: West" is the
    // obvious case, and the failure is vicious: the row vanishes, and every
    // later sheet that references it fails with "region not found". Styling
    // alone is no good either, because a client who typed over the example row
    // inherits its formatting. Together they are specific enough.
    const matchesExample = spec.cols.every((col, i) => {
      const expected = spec.example[i]
      const got = values.get(col.key) ?? ""
      return String(expected ?? "").trim() === got
    })
    if (matchesExample && raw.getCell(1).font?.italic) {
      warn(spec.name, r, "example row was left in the sheet — skipped, not imported")
      continue
    }

    rows.push({
      row: r,
      get: (k) => values.get(k) ?? "",
      has: (k) => !!values.get(k),
    })
  }
  return rows
}

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

const yes = (s: string, dflt = true): boolean => (s ? /^(y|yes|true|1)$/i.test(s) : dflt)

function asInt(sheet: string, row: number, key: string, s: string, min: number): number | null {
  if (!/^-?\d+$/.test(s)) {
    err(sheet, row, `${key}: "${s}" is not a whole number`)
    return null
  }
  const n = Number(s)
  if (n < min) {
    err(sheet, row, `${key}: must be ${min} or more`)
    return null
  }
  return n
}

function asDecimal(sheet: string, row: number, key: string, s: string, min: number): number | null {
  const n = Number(s)
  if (!s || Number.isNaN(n)) {
    err(sheet, row, `${key}: "${s}" is not a number`)
    return null
  }
  if (n < min) {
    err(sheet, row, `${key}: must be ${min} or more`)
    return null
  }
  return n
}

/** Comma-separated list, e.g. "Boxes, Cases" or "10, 5". */
const asList = (s: string): string[] => s.split(",").map((p) => p.trim()).filter(Boolean)

const ITEM_ID = /^([A-Z]{2})-([A-Z]{2})-(\d{6})$/

/**
 * Case-insensitive lookup that still reports the caller's spelling.
 *
 * Every sheet refers to the others by a human-typed name, and "packright
 * manufacturing" is the same vendor as "PackRight Manufacturing" to everyone
 * except a database index. Matching loosely and suggesting the near-miss turns
 * the commonest failure of a hand-filled workbook from a rejection into a
 * one-line correction.
 */
class Index<T> {
  private map = new Map<string, T>()
  private display = new Map<string, string>()

  set(name: string, value: T) {
    this.map.set(name.toLowerCase(), value)
    this.display.set(name.toLowerCase(), name)
  }
  get(name: string): T | undefined {
    return this.map.get(name.trim().toLowerCase())
  }
  has(name: string): boolean {
    return this.map.has(name.trim().toLowerCase())
  }
  /** The closest known name, for "did you mean". Cheap prefix/substring match. */
  suggest(name: string): string | null {
    const n = name.trim().toLowerCase()
    if (!n) return null
    for (const [k, d] of this.display) {
      if (k.startsWith(n.slice(0, 4)) || k.includes(n) || n.includes(k)) return d
    }
    return null
  }
  get size() {
    return this.map.size
  }
}

function resolve<T>(
  index: Index<T>,
  sheet: string,
  row: number,
  key: string,
  name: string,
  what: string
): T | undefined {
  const hit = index.get(name)
  if (hit !== undefined) return hit
  const near = index.suggest(name)
  err(sheet, row, `${key}: ${what} "${name}" not found${near ? ` — did you mean "${near}"?` : ""}`)
  return undefined
}

// ---------------------------------------------------------------------------

async function main() {
  const file = path.resolve(FILE!)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)

  console.log(`Reading ${file}`)

  // ---- read every sheet --------------------------------------------------
  const sheets = new Map<string, Row[]>()
  for (const spec of SHEETS) {
    const rows = readSheet(wb, spec)
    if (rows) sheets.set(spec.name, rows)
  }
  const rowsOf = (name: string): Row[] => sheets.get(name) ?? []

  if (errors.length) return report() // a missing sheet makes the rest meaningless

  // ---- indexes of what already exists in the database --------------------
  // Seeded from the database FIRST so a re-run, or a workbook that references
  // data an earlier import loaded, resolves against reality rather than only
  // against this file.
  const regions = new Index<number>()
  const countries = new Index<{ id: number; selectable: boolean }>()
  const commodities = new Index<string>()
  const categories = new Index<string>()
  const subCategories = new Index<number>() // keyed "CODE|name"
  const locationTypeIds = new Index<number>()
  const locations = new Index<{ id: number; type: string | null }>()
  const items = new Index<{ id: string; categoryCode: string | null }>()
  const growers = new Index<number>()
  const vendors = new Index<number>()
  const roles = new Index<number>()
  const chains = new Index<{ id: number; categoryCode: string; levels: number }>()

  for (const r of await prisma.region.findMany()) regions.set(r.name, r.id)
  for (const c of await prisma.country.findMany())
    countries.set(c.name, { id: c.id, selectable: c.isSelectable })
  for (const c of await prisma.commodity.findMany()) commodities.set(c.code, c.code)
  for (const c of await prisma.materialCategory.findMany()) categories.set(c.code, c.code)
  for (const s of await prisma.subCategory.findMany())
    subCategories.set(`${s.materialCategoryCode}|${s.name}`, s.id)
  for (const t of await prisma.locationType.findMany()) locationTypeIds.set(t.name, t.id)
  for (const l of await prisma.location.findMany({ include: { locationType: true } }))
    locations.set(l.locationName, { id: l.id, type: l.locationType?.name ?? null })
  for (const i of await prisma.item.findMany({ select: { id: true, materialCategoryCode: true } }))
    items.set(i.id, { id: i.id, categoryCode: i.materialCategoryCode })
  for (const g of await prisma.grower.findMany()) growers.set(g.growerName, g.id)
  for (const v of await prisma.vendor.findMany()) vendors.set(v.vendorName, v.id)
  for (const r of await prisma.role.findMany()) roles.set(r.roleName, r.id)
  for (const c of await prisma.packagingChain.findMany({ include: { levels: true } }))
    chains.set(c.name, { id: c.id, categoryCode: c.materialCategoryCode, levels: c.levels.length })

  // =========================================================================
  // PASS 1 — validate everything, write nothing.
  //
  // Walks the sheets in load order, adding each sheet's own keys to the indexes
  // as it goes. That ordering is what lets a later sheet reference a row this
  // same workbook introduces, without either sheet having been written yet.
  // =========================================================================

  const seen = (sheet: string) => {
    const s = new Set<string>()
    return (row: number, key: string, what = "row") => {
      if (s.has(key)) {
        err(sheet, row, `duplicate ${what}: "${key}" already appears earlier in this sheet`)
        return false
      }
      s.add(key)
      return true
    }
  }

  // 1-Regions
  {
    const dup = seen("1-Regions")
    for (const r of rowsOf("1-Regions")) {
      const name = r.get("RegionName")
      if (!name) { err("1-Regions", r.row, "RegionName is required"); continue }
      if (!dup(r.row, name.toLowerCase())) continue
      regions.set(name, -1)
    }
  }

  // 2-Countries
  {
    const dup = seen("2-Countries")
    for (const r of rowsOf("2-Countries")) {
      const name = r.get("CountryName")
      if (!name) { err("2-Countries", r.row, "CountryName is required"); continue }
      if (!dup(r.row, name.toLowerCase())) continue
      countries.set(name, { id: -1, selectable: yes(r.get("SelectableAsRealCountry")) })
    }
  }

  // 3-Commodities
  {
    const dup = seen("3-Commodities")
    for (const r of rowsOf("3-Commodities")) {
      const code = r.get("CommodityCode")
      if (!/^[A-Z]{2}$/.test(code)) {
        err("3-Commodities", r.row, `CommodityCode: "${code}" must be exactly two uppercase letters`)
        continue
      }
      if (!r.get("CommodityName")) err("3-Commodities", r.row, "CommodityName is required")
      if (!dup(r.row, code.toLowerCase())) continue
      commodities.set(code, code)
    }
  }

  // 4-MaterialCategories
  {
    const dup = seen("4-MaterialCategories")
    for (const r of rowsOf("4-MaterialCategories")) {
      const code = r.get("MaterialCategoryCode")
      if (!/^[A-Z]{2}$/.test(code)) {
        err("4-MaterialCategories", r.row, `MaterialCategoryCode: "${code}" must be exactly two uppercase letters`)
        continue
      }
      if (!r.get("MaterialCategoryName")) err("4-MaterialCategories", r.row, "MaterialCategoryName is required")
      if (!dup(r.row, code.toLowerCase())) continue
      categories.set(code, code)
    }
  }

  // 5-SubCategories
  {
    const dup = seen("5-SubCategories")
    for (const r of rowsOf("5-SubCategories")) {
      const code = r.get("MaterialCategoryCode")
      const name = r.get("SubCategoryName")
      if (!code || !name) { err("5-SubCategories", r.row, "MaterialCategoryCode and SubCategoryName are required"); continue }
      if (!resolve(categories, "5-SubCategories", r.row, "MaterialCategoryCode", code, "material category")) continue
      if (!dup(r.row, `${code}|${name}`.toLowerCase(), "sub-category")) continue
      subCategories.set(`${code}|${name}`, -1)
    }
  }

  // 6-Locations
  {
    const dup = seen("6-Locations")
    const typeNames = new Set<string>(LOCATION_TYPE_SEED.map((t) => t.name))
    for (const r of rowsOf("6-Locations")) {
      const name = r.get("LocationName")
      const type = r.get("LocationType")
      if (!name) { err("6-Locations", r.row, "LocationName is required"); continue }
      if (!type || !typeNames.has(type)) {
        err("6-Locations", r.row, `LocationType: "${type}" is not one of ${[...typeNames].join(", ")}`)
      }
      if (r.has("RegionName")) resolve(regions, "6-Locations", r.row, "RegionName", r.get("RegionName"), "region")
      if (r.has("CountryName")) {
        const c = resolve(countries, "6-Locations", r.row, "CountryName", r.get("CountryName"), "country")
        if (c && !c.selectable) err("6-Locations", r.row, `CountryName: "${r.get("CountryName")}" is not selectable — it is a placeholder, valid only as an item's origin`)
      }
      if (!dup(r.row, name.toLowerCase(), "location")) continue
      locations.set(name, { id: -1, type })
    }
  }

  // 7-Items
  {
    const dup = seen("7-Items")
    let photos = 0
    for (const r of rowsOf("7-Items")) {
      const id = r.get("ItemID")
      const m = ITEM_ID.exec(id)
      if (!m) {
        err("7-Items", r.row, `ItemID: "${id}" must look like AP-BX-000001 (CC-MM-NNNNNN)`)
        continue
      }
      const [, cc, mm] = m
      if (!r.get("ItemName")) err("7-Items", r.row, "ItemName is required")

      const commodity = r.get("CommodityCode")
      const category = r.get("MaterialCategoryCode")
      if (commodity && cc !== commodity)
        err("7-Items", r.row, `ItemID starts with "${cc}" but CommodityCode is "${commodity}" — they must match`)
      if (category && mm !== category)
        err("7-Items", r.row, `ItemID's middle segment is "${mm}" but MaterialCategoryCode is "${category}" — they must match`)

      resolve(commodities, "7-Items", r.row, "CommodityCode", commodity, "commodity")
      resolve(categories, "7-Items", r.row, "MaterialCategoryCode", category, "material category")

      const sub = r.get("SubCategoryName")
      if (sub && category && !subCategories.has(`${category}|${sub}`))
        err("7-Items", r.row, `SubCategoryName: "${sub}" is not a sub-category of ${category} (see 5-SubCategories)`)

      resolve(countries, "7-Items", r.row, "CountryOfOrigin", r.get("CountryOfOrigin"), "country")

      if (r.has("ImageFile")) photos++

      if (!dup(r.row, id.toLowerCase(), "ItemID")) continue
      items.set(id, { id, categoryCode: category || null })
    }
    if (photos)
      warn("7-Items", null, `${photos} row(s) name a photo in ImageFile — this script does not upload photos, so those items will import without one`)
  }

  // 8-Growers
  {
    const dup = seen("8-Growers")
    for (const r of rowsOf("8-Growers")) {
      const name = r.get("GrowerName")
      if (!name) { err("8-Growers", r.row, "GrowerName is required"); continue }
      if (!dup(r.row, name.toLowerCase(), "grower")) continue
      growers.set(name, -1)
    }
  }

  // 9-Vendors
  {
    const dup = seen("9-Vendors")
    for (const r of rowsOf("9-Vendors")) {
      const name = r.get("VendorName")
      if (!name) { err("9-Vendors", r.row, "VendorName is required"); continue }
      if (r.has("HeadquartersCountry"))
        resolve(countries, "9-Vendors", r.row, "HeadquartersCountry", r.get("HeadquartersCountry"), "country")
      if (r.has("LeadTimeDays")) asInt("9-Vendors", r.row, "LeadTimeDays", r.get("LeadTimeDays"), 0)
      if (r.has("PaymentTermsDays")) asInt("9-Vendors", r.row, "PaymentTermsDays", r.get("PaymentTermsDays"), 0)
      if (!dup(r.row, name.toLowerCase(), "vendor")) continue
      vendors.set(name, -1)
    }
  }

  // 10-Users
  {
    const dup = seen("10-Users")
    for (const r of rowsOf("10-Users")) {
      const email = r.get("Email").toLowerCase()
      const role = r.get("Role")
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
        err("10-Users", r.row, `Email: "${r.get("Email")}" is not a valid address`)
      if (!r.get("FirstName") || !r.get("LastName"))
        err("10-Users", r.row, "FirstName and LastName are required")
      if (!resolve(roles, "10-Users", r.row, "Role", role, "role")) continue

      // The two scoping rules the app relies on: a grower user without a grower
      // sees nothing, and an admin WITH one would be silently scoped down.
      const g = r.get("GrowerName")
      const v = r.get("VendorName")
      if (role === "GrowerUser" && !g) err("10-Users", r.row, "GrowerName is required when Role is GrowerUser")
      if (role === "VendorUser" && !v) err("10-Users", r.row, "VendorName is required when Role is VendorUser")
      if (role !== "GrowerUser" && g) err("10-Users", r.row, `GrowerName must be blank when Role is ${role}`)
      if (role !== "VendorUser" && v) err("10-Users", r.row, `VendorName must be blank when Role is ${role}`)
      if (g) resolve(growers, "10-Users", r.row, "GrowerName", g, "grower")
      if (v) resolve(vendors, "10-Users", r.row, "VendorName", v, "vendor")

      dup(r.row, email, "email")
    }
  }

  // 11-GrowerLocations / 16-VendorLocations — same shape, opposite side.
  for (const [sheet, side, nameKey, index] of [
    ["11-GrowerLocations", "Grower", "GrowerName", growers],
    ["16-VendorLocations", "Vendor", "VendorName", vendors],
  ] as const) {
    const dup = seen(sheet)
    const allowed = new Set<string>(
      LOCATION_TYPE_SEED.filter((t) => t.appliesTo === side || t.appliesTo === "Both").map((t) => t.name)
    )
    for (const r of rowsOf(sheet)) {
      const owner = r.get(nameKey)
      const loc = r.get("LocationName")
      if (!owner || !loc) { err(sheet, r.row, `${nameKey} and LocationName are required`); continue }
      resolve(index, sheet, r.row, nameKey, owner, side.toLowerCase())
      const l = resolve(locations, sheet, r.row, "LocationName", loc, "location")
      if (l && l.type && !allowed.has(l.type))
        err(sheet, r.row, `LocationName: "${loc}" is a ${l.type}, which cannot be attached to a ${side.toLowerCase()}`)
      dup(r.row, `${owner}|${loc}`.toLowerCase(), "pair")
    }
  }

  // 12-GrowerItems / 13-VendorItems
  for (const [sheet, nameKey, index, what] of [
    ["12-GrowerItems", "GrowerName", growers, "grower"],
    ["13-VendorItems", "VendorName", vendors, "vendor"],
  ] as const) {
    const dup = seen(sheet)
    for (const r of rowsOf(sheet)) {
      const owner = r.get(nameKey)
      const item = r.get("ItemID")
      if (!owner || !item) { err(sheet, r.row, `${nameKey} and ItemID are required`); continue }
      resolve(index, sheet, r.row, nameKey, owner, what)
      resolve(items, sheet, r.row, "ItemID", item, "item")
      dup(r.row, `${owner}|${item}`.toLowerCase(), "pair")
    }
  }

  // 14-VendorCategories
  {
    const dup = seen("14-VendorCategories")
    for (const r of rowsOf("14-VendorCategories")) {
      const v = r.get("VendorName")
      const c = r.get("MaterialCategoryCode")
      if (!v || !c) { err("14-VendorCategories", r.row, "VendorName and MaterialCategoryCode are required"); continue }
      resolve(vendors, "14-VendorCategories", r.row, "VendorName", v, "vendor")
      resolve(categories, "14-VendorCategories", r.row, "MaterialCategoryCode", c, "material category")
      dup(r.row, `${v}|${c}`.toLowerCase(), "pair")
    }
  }

  // 15-VendorSupplyCountries
  {
    const dup = seen("15-VendorSupplyCountries")
    for (const r of rowsOf("15-VendorSupplyCountries")) {
      const v = r.get("VendorName")
      const c = r.get("CountryName")
      if (!v || !c) { err("15-VendorSupplyCountries", r.row, "VendorName and CountryName are required"); continue }
      resolve(vendors, "15-VendorSupplyCountries", r.row, "VendorName", v, "vendor")
      const country = resolve(countries, "15-VendorSupplyCountries", r.row, "CountryName", c, "country")
      if (country && !country.selectable)
        err("15-VendorSupplyCountries", r.row, `CountryName: "${c}" is not selectable and cannot be a supply-to country`)
      dup(r.row, `${v}|${c}`.toLowerCase(), "pair")
    }
  }

  // 17-PackagingChains
  {
    const dup = seen("17-PackagingChains")
    for (const r of rowsOf("17-PackagingChains")) {
      const name = r.get("ChainName")
      const code = r.get("MaterialCategoryCode")
      const levels = asList(r.get("Levels"))
      if (!name) { err("17-PackagingChains", r.row, "ChainName is required"); continue }
      if (!resolve(categories, "17-PackagingChains", r.row, "MaterialCategoryCode", code, "material category")) continue
      if (!levels.length) {
        err("17-PackagingChains", r.row, "Levels is required — list the containers above the item, e.g. \"Boxes, Cases\"")
        continue
      }
      if (!dup(r.row, name.toLowerCase(), "chain name")) continue
      chains.set(name, { id: -1, categoryCode: code, levels: levels.length })
    }
  }

  // 18-VendorPackaging
  {
    const dup = seen("18-VendorPackaging")
    // Vendor/item pairs this workbook maps, so we can insist packaging hangs
    // off an actual mapping rather than creating one as a side effect.
    const pairs = new Set<string>()
    for (const r of rowsOf("13-VendorItems"))
      pairs.add(`${r.get("VendorName")}|${r.get("ItemID")}`.toLowerCase())
    for (const iv of await prisma.itemVendor.findMany({ include: { vendor: true } }))
      pairs.add(`${iv.vendor.vendorName}|${iv.itemId}`.toLowerCase())

    for (const r of rowsOf("18-VendorPackaging")) {
      const v = r.get("VendorName")
      const item = r.get("ItemID")
      const chainName = r.get("ChainName")
      const ratios = asList(r.get("Ratios"))
      if (!v || !item || !chainName) { err("18-VendorPackaging", r.row, "VendorName, ItemID and ChainName are required"); continue }

      resolve(vendors, "18-VendorPackaging", r.row, "VendorName", v, "vendor")
      const it = resolve(items, "18-VendorPackaging", r.row, "ItemID", item, "item")
      const chain = resolve(chains, "18-VendorPackaging", r.row, "ChainName", chainName, "packaging chain")

      if (!pairs.has(`${v}|${item}`.toLowerCase()))
        err("18-VendorPackaging", r.row, `"${v}" does not supply ${item} — add the pair to 13-VendorItems first`)

      if (chain && it && it.categoryCode && chain.categoryCode !== it.categoryCode)
        err("18-VendorPackaging", r.row, `chain "${chainName}" is for category ${chain.categoryCode} but ${item} is ${it.categoryCode}`)

      if (chain && ratios.length !== chain.levels)
        err("18-VendorPackaging", r.row, `Ratios has ${ratios.length} value(s) but chain "${chainName}" has ${chain.levels} level(s) — one ratio per level`)

      ratios.forEach((x, i) => asInt("18-VendorPackaging", r.row, `Ratios[${i + 1}]`, x, 1))

      dup(r.row, `${v}|${item}`.toLowerCase(), "vendor/item pair")
    }
  }

  // 19-ItemThresholds
  {
    const dup = seen("19-ItemThresholds")
    for (const r of rowsOf("19-ItemThresholds")) {
      const item = r.get("ItemID")
      const g = r.get("GrowerName")
      if (!item) { err("19-ItemThresholds", r.row, "ItemID is required"); continue }
      resolve(items, "19-ItemThresholds", r.row, "ItemID", item, "item")
      if (g) resolve(growers, "19-ItemThresholds", r.row, "GrowerName", g, "grower")
      asDecimal("19-ItemThresholds", r.row, "ThresholdQuantity", r.get("ThresholdQuantity"), 0)
      dup(r.row, `${item}|${g}`.toLowerCase(), "item/grower pair")
    }
  }

  // 20-ReminderSchedules
  {
    const dup = seen("20-ReminderSchedules")
    let globals = 0
    for (const r of rowsOf("20-ReminderSchedules")) {
      const g = r.get("GrowerName")
      const cadence = r.get("CadenceType")
      if (!g) globals++
      else resolve(growers, "20-ReminderSchedules", r.row, "GrowerName", g, "grower")

      if (cadence === "AfterNDays") {
        if (!r.has("ThresholdDays")) err("20-ReminderSchedules", r.row, "ThresholdDays is required when CadenceType is AfterNDays")
        else asInt("20-ReminderSchedules", r.row, "ThresholdDays", r.get("ThresholdDays"), 1)
      } else if (r.has("ThresholdDays")) {
        warn("20-ReminderSchedules", r.row, `ThresholdDays is only read for AfterNDays — ignored for ${cadence}`)
      }
      dup(r.row, (g || "<global>").toLowerCase(), "scope")
    }
    if (globals > 1) err("20-ReminderSchedules", null, `${globals} rows have a blank GrowerName — there can be only one global setting`)
  }

  if (errors.length || DRY_RUN) return report()

  // =========================================================================
  // PASS 2 — write. Everything below is an upsert on the workbook's own key.
  // =========================================================================

  const counts: Record<string, number> = {}
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1)
  const step = (name: string) => { if (!QUIET) process.stdout.write(`  ${name}\n`) }

  step("1-Regions")
  for (const r of rowsOf("1-Regions")) {
    const name = r.get("RegionName")
    const rec = await prisma.region.upsert({ where: { name }, update: {}, create: { name } })
    regions.set(name, rec.id)
    bump("regions")
  }

  step("2-Countries")
  for (const r of rowsOf("2-Countries")) {
    const name = r.get("CountryName")
    const isSelectable = yes(r.get("SelectableAsRealCountry"))
    const rec = await prisma.country.upsert({
      where: { name },
      update: { isSelectable },
      create: { name, isSelectable },
    })
    countries.set(name, { id: rec.id, selectable: rec.isSelectable })
    bump("countries")
  }

  step("3-Commodities")
  for (const r of rowsOf("3-Commodities")) {
    const code = r.get("CommodityCode")
    const name = r.get("CommodityName")
    await prisma.commodity.upsert({ where: { code }, update: { name }, create: { code, name } })
    bump("commodities")
  }

  step("4-MaterialCategories")
  for (const r of rowsOf("4-MaterialCategories")) {
    const code = r.get("MaterialCategoryCode")
    const name = r.get("MaterialCategoryName")
    await prisma.materialCategory.upsert({ where: { code }, update: { name }, create: { code, name } })
    bump("categories")
  }

  // No unique constraint on (categoryCode, name), so find-then-write rather
  // than upsert. Same pattern for every named entity below.
  step("5-SubCategories")
  for (const r of rowsOf("5-SubCategories")) {
    const code = r.get("MaterialCategoryCode")
    const name = r.get("SubCategoryName")
    const found = await prisma.subCategory.findFirst({ where: { materialCategoryCode: code, name } })
    const rec = found ?? (await prisma.subCategory.create({ data: { materialCategoryCode: code, name } }))
    subCategories.set(`${code}|${name}`, rec.id)
    bump("subCategories")
  }

  step("6-Locations")
  for (const r of rowsOf("6-Locations")) {
    const locationName = r.get("LocationName")
    // The workbook names a type; the column is a foreign key. An unrecognised
    // name is left unset rather than invented — validation already reported it.
    const typeName = r.get("LocationType")
    const data = {
      locationTypeId: typeName ? (locationTypeIds.get(typeName) ?? null) : null,
      regionId: r.has("RegionName") ? regions.get(r.get("RegionName"))! : null,
      countryId: r.has("CountryName") ? countries.get(r.get("CountryName"))!.id : null,
      commodityFocus: r.get("CommodityFocus") || null,
      keyPersonnel: r.get("KeyPersonnel") || null,
      notes: r.get("Notes") || null,
    }
    const found = await prisma.location.findFirst({ where: { locationName } })
    const rec = found
      ? await prisma.location.update({ where: { id: found.id }, data })
      : await prisma.location.create({ data: { locationName, ...data } })
    locations.set(locationName, { id: rec.id, type: typeName || null })
    bump("locations")
  }

  step("7-Items")
  for (const r of rowsOf("7-Items")) {
    const id = r.get("ItemID")
    const category = r.get("MaterialCategoryCode")
    const sub = r.get("SubCategoryName")
    const data = {
      itemName: r.get("ItemName"),
      commodityCode: r.get("CommodityCode") || null,
      materialCategoryCode: category || null,
      subCategoryId: sub ? (subCategories.get(`${category}|${sub}`) ?? null) : null,
      countryOfOriginId: r.has("CountryOfOrigin") ? countries.get(r.get("CountryOfOrigin"))!.id : null,
      applicationMethod: r.get("ApplicationMethod") || null,
      status: r.get("Status") || "Active",
      legacyFamousId: r.get("LegacyItemRef") || null,
      notes: r.get("Notes") || null,
      // imageKey is deliberately untouched: this script does not upload photos,
      // and writing null would wipe one set through the app.
    }
    await prisma.item.upsert({ where: { id }, update: data, create: { id, ...data } })
    items.set(id, { id, categoryCode: category || null })
    bump("items")
  }

  step("8-Growers")
  for (const r of rowsOf("8-Growers")) {
    const growerName = r.get("GrowerName")
    const data = {
      primaryEmail: r.get("PrimaryEmail") || null,
      status: r.get("Status") || "Active",
      preferredLocale: r.get("PreferredLocale") || "en",
    }
    const found = await prisma.grower.findFirst({ where: { growerName } })
    const rec = found
      ? await prisma.grower.update({ where: { id: found.id }, data })
      : await prisma.grower.create({ data: { growerName, ...data } })
    growers.set(growerName, rec.id)
    bump("growers")
  }

  step("9-Vendors")
  for (const r of rowsOf("9-Vendors")) {
    const vendorName = r.get("VendorName")
    const data = {
      vendorType: r.get("VendorType") || null,
      countryId: r.has("HeadquartersCountry") ? countries.get(r.get("HeadquartersCountry"))!.id : null,
      primaryContact: r.get("PrimaryContact") || null,
      contactEmail: r.get("ContactEmail") || null,
      contactPhone: r.get("ContactPhone") || null,
      leadTimeDays: r.has("LeadTimeDays") ? Number(r.get("LeadTimeDays")) : null,
      paymentTermsDays: r.has("PaymentTermsDays") ? Number(r.get("PaymentTermsDays")) : null,
      ptAccountNumber: r.get("PTAccountNumber") || null,
      notes: r.get("Notes") || null,
      status: r.get("Status") || "Active",
      preferredLocale: r.get("PreferredLocale") || "en",
    }
    const found = await prisma.vendor.findFirst({ where: { vendorName } })
    const rec = found
      ? await prisma.vendor.update({ where: { id: found.id }, data })
      : await prisma.vendor.create({ data: { vendorName, ...data } })
    vendors.set(vendorName, rec.id)
    bump("vendors")
  }

  step("10-Users")
  for (const r of rowsOf("10-Users")) {
    const email = r.get("Email").toLowerCase()
    const data = {
      firstName: r.get("FirstName"),
      lastName: r.get("LastName"),
      roleId: roles.get(r.get("Role"))!,
      growerId: r.has("GrowerName") ? growers.get(r.get("GrowerName"))! : null,
      vendorId: r.has("VendorName") ? vendors.get(r.get("VendorName"))! : null,
      isActive: yes(r.get("IsActive")),
      preferredLocale: r.get("PreferredLocale") || "en",
    }
    // entraObjectId is left alone — it is backfilled on first Microsoft sign-in
    // and clearing it here would re-orphan anyone who has already signed in.
    await prisma.user.upsert({ where: { email }, update: data, create: { email, ...data } })
    bump("users")
  }

  step("11-GrowerLocations")
  for (const r of rowsOf("11-GrowerLocations")) {
    const growerId = growers.get(r.get("GrowerName"))!
    const locationId = locations.get(r.get("LocationName"))!.id
    await prisma.growerLocation.upsert({
      where: { growerId_locationId: { growerId, locationId } },
      update: { isActive: true },
      create: { growerId, locationId },
    })
    bump("growerLocations")
  }

  step("12-GrowerItems")
  for (const r of rowsOf("12-GrowerItems")) {
    const growerId = growers.get(r.get("GrowerName"))!
    const itemId = items.get(r.get("ItemID"))!.id
    await prisma.growerItemAuthorization.upsert({
      where: { growerId_itemId: { growerId, itemId } },
      update: { isActive: true },
      create: { growerId, itemId },
    })
    bump("growerItems")
  }

  step("13-VendorItems")
  for (const r of rowsOf("13-VendorItems")) {
    const vendorId = vendors.get(r.get("VendorName"))!
    const itemId = items.get(r.get("ItemID"))!.id
    await prisma.itemVendor.upsert({
      where: { vendorId_itemId: { vendorId, itemId } },
      update: { isActive: true },
      create: { vendorId, itemId },
    })
    bump("vendorItems")
  }

  step("14-VendorCategories")
  for (const r of rowsOf("14-VendorCategories")) {
    const vendorId = vendors.get(r.get("VendorName"))!
    const materialCategoryCode = r.get("MaterialCategoryCode")
    await prisma.vendorMaterialCategory.upsert({
      where: { vendorId_materialCategoryCode: { vendorId, materialCategoryCode } },
      update: { isActive: true },
      create: { vendorId, materialCategoryCode },
    })
    bump("vendorCategories")
  }

  step("15-VendorSupplyCountries")
  for (const r of rowsOf("15-VendorSupplyCountries")) {
    const vendorId = vendors.get(r.get("VendorName"))!
    const countryId = countries.get(r.get("CountryName"))!.id
    await prisma.vendorCountry.upsert({
      where: { vendorId_countryId: { vendorId, countryId } },
      update: { isActive: true },
      create: { vendorId, countryId },
    })
    bump("vendorSupplyCountries")
  }

  step("16-VendorLocations")
  for (const r of rowsOf("16-VendorLocations")) {
    const vendorId = vendors.get(r.get("VendorName"))!
    const locationId = locations.get(r.get("LocationName"))!.id
    await prisma.vendorLocation.upsert({
      where: { vendorId_locationId: { vendorId, locationId } },
      update: { isActive: true },
      create: { vendorId, locationId },
    })
    bump("vendorLocations")
  }

  step("17-PackagingChains")
  for (const r of rowsOf("17-PackagingChains")) {
    const name = r.get("ChainName")
    const materialCategoryCode = r.get("MaterialCategoryCode")
    const levels = asList(r.get("Levels"))
    const isActive = yes(r.get("IsActive"))

    const found = await prisma.packagingChain.findFirst({ where: { name } })
    const chain = found
      ? await prisma.packagingChain.update({
          where: { id: found.id },
          data: { materialCategoryCode, isActive },
        })
      : await prisma.packagingChain.create({ data: { name, materialCategoryCode, isActive } })

    // Replaced wholesale rather than merged: levels are ordered and a partial
    // update could leave a chain with a gap, which nothing downstream expects.
    await prisma.packagingChainLevel.deleteMany({ where: { chainId: chain.id } })
    await prisma.packagingChainLevel.createMany({
      data: levels.map((unitName, i) => ({ chainId: chain.id, level: i + 1, unitName })),
    })
    chains.set(name, { id: chain.id, categoryCode: materialCategoryCode, levels: levels.length })
    bump("packagingChains")
  }

  step("18-VendorPackaging")
  for (const r of rowsOf("18-VendorPackaging")) {
    const vendorId = vendors.get(r.get("VendorName"))!
    const itemId = items.get(r.get("ItemID"))!.id
    const chain = chains.get(r.get("ChainName"))!
    const ratios = asList(r.get("Ratios")).map(Number)

    // The mapping is guaranteed to exist — pass 1 refused the row otherwise.
    const iv = await prisma.itemVendor.update({
      where: { vendorId_itemId: { vendorId, itemId } },
      data: { packagingChainId: chain.id },
    })
    await prisma.vendorPackRatio.deleteMany({ where: { itemVendorId: iv.id } })
    await prisma.vendorPackRatio.createMany({
      data: ratios.map((perParent, i) => ({ itemVendorId: iv.id, level: i + 1, perParent })),
    })
    bump("vendorPackaging")
  }

  step("19-ItemThresholds")
  for (const r of rowsOf("19-ItemThresholds")) {
    const itemId = items.get(r.get("ItemID"))!.id
    const growerId = r.has("GrowerName") ? growers.get(r.get("GrowerName"))! : null
    const thresholdQuantity = new Prisma.Decimal(r.get("ThresholdQuantity"))
    // Not upsert: the unique key includes a NULLABLE growerId, which Prisma's
    // compound-unique `where` cannot express.
    const found = await prisma.itemThreshold.findFirst({ where: { itemId, growerId } })
    if (found) await prisma.itemThreshold.update({ where: { id: found.id }, data: { thresholdQuantity } })
    else await prisma.itemThreshold.create({ data: { itemId, growerId, thresholdQuantity } })
    bump("itemThresholds")
  }

  step("20-ReminderSchedules")
  for (const r of rowsOf("20-ReminderSchedules")) {
    const growerId = r.has("GrowerName") ? growers.get(r.get("GrowerName"))! : null
    const data = {
      scope: growerId ? "Grower" : "Global",
      cadenceType: r.get("CadenceType"),
      thresholdDays: r.has("ThresholdDays") ? Number(r.get("ThresholdDays")) : 3,
      isEnabled: yes(r.get("IsEnabled")),
    }
    const found = await prisma.schedulerSetting.findFirst({ where: { growerId } })
    if (found) await prisma.schedulerSetting.update({ where: { id: found.id }, data })
    else await prisma.schedulerSetting.create({ data: { growerId, ...data } })
    bump("reminderSchedules")
  }

  report(counts)
}

// ---------------------------------------------------------------------------

function report(counts?: Record<string, number>) {
  const group = (list: Problem[]) => {
    const by = new Map<string, Problem[]>()
    for (const p of list) by.set(p.sheet, [...(by.get(p.sheet) ?? []), p])
    for (const [sheet, ps] of by) {
      console.log(`\n  ${sheet}`)
      for (const p of ps) console.log(`    ${p.row ? `row ${p.row}: ` : ""}${p.message}`)
    }
  }

  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`)
    group(warnings)
  }

  if (errors.length) {
    console.log(`\n${errors.length} error(s) — NOTHING was imported:`)
    group(errors)
    console.log("\nFix these in the workbook and run again. The import is re-runnable.")
    process.exitCode = 1
    return
  }

  if (DRY_RUN) {
    console.log("\n✅ The workbook is valid. Nothing was written (--dry-run).")
    return
  }

  console.log("\n✅ Imported:")
  for (const [k, n] of Object.entries(counts ?? {})) console.log(`   ${String(n).padStart(6)}  ${k}`)
}

main()
  .catch((e) => {
    console.error("\nImport failed:", e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
