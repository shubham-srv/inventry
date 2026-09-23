/**
 * The master-data workbook's shape — the single definition of its sheets,
 * columns and rules.
 *
 * Shared deliberately: generate-master-data-template.ts writes a workbook from
 * this, and import-master-data.ts reads one back with it. If the two held their
 * own copies they would drift the first time a column moved, and the symptom
 * would be a client's filled-in workbook silently importing the wrong columns.
 *
 * Allowed values come from lib/constants.ts rather than being retyped here, so
 * a workbook can never offer a status or type the app would reject.
 */
import {
  ROLES,
  ENTITY_STATUS,
  APPLICATION_METHODS,
  LOCATION_TYPES,
  CADENCE_TYPES,
} from "../lib/constants"

export const DATA_ROWS = 1000 // how far down dropdowns and formatting reach

export type Col = {
  key: string
  width: number
  required?: boolean
  /** Shown when the cell is selected — the rule, in one line. */
  help: string
  /** Turns the column into a dropdown. Keep the joined list under ~255 chars. */
  list?: readonly string[]
}

export const YES_NO = ["Yes", "No"] as const
const LOCALES = ["en", "es"] as const
const VENDOR_TYPES = ["Manufacturer", "Pallet Pooling", "3PL", "Distributor"] as const
const ITEM_STATUSES = [ENTITY_STATUS.ACTIVE, ENTITY_STATUS.INACTIVE, ENTITY_STATUS.REVIEW] as const
const GROWER_STATUSES = [ENTITY_STATUS.ACTIVE, ENTITY_STATUS.INACTIVE, ENTITY_STATUS.PENDING] as const
const VENDOR_STATUSES = [ENTITY_STATUS.ACTIVE, ENTITY_STATUS.INACTIVE] as const

export type SheetSpec = { name: string; purpose: string; cols: Col[]; example: unknown[] }

/** Sheets in LOAD ORDER — each depends only on the ones before it. */
export const SHEETS: SheetSpec[] = [
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
      { key: "ApplicationMethod", width: 20, list: APPLICATION_METHODS, help: "Optional" },
      { key: "Status", width: 14, required: true, list: ITEM_STATUSES, help: "" },
      { key: "LegacyItemRef", width: 20, help: "Your existing identifier, carried through for reconciliation. Not used as a key." },
      { key: "Notes", width: 40, help: "" },
      // Appended after Notes rather than slotted beside it, for the same reason
      // 16-VendorLocations is appended: a client already filling this in should
      // never have to move columns. See the README's "Item photos" section.
      {
        key: "ImageFile",
        width: 28,
        help: "Optional. The file name of this item's photo in the images folder you send alongside this workbook — e.g. AP-BX-00001.jpg. JPG, PNG or WebP, up to 10 MB each. Leave blank if the item has no photo.",
      },
    ],
    example: [
      "AP-BX-00001", "Corrugated Box 40x30", "AP", "BX", "Cardboard Boxes",
      "USA", "Machine", "Active", "FAM-10023", "", "AP-BX-00001.jpg",
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
      "PackRight Manufacturing", "Manufacturer", "USA", "Sam Carter",
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
  {
    // Appended rather than slotted next to 11-GrowerLocations so the existing
    // sheet numbers stay put — a client mid-fill should not have to rename tabs.
    // It still loads in order: both sheets it depends on come earlier.
    name: "16-VendorLocations",
    purpose:
      "Which sites each vendor operates from. One row per pair — repeat the vendor name for each site. The vendor's region(s) are read from here.",
    cols: [
      { key: "VendorName", width: 30, required: true, help: "Must exist in 9-Vendors" },
      { key: "LocationName", width: 30, required: true, help: "Must exist in 6-Locations and be a vendor-usable type" },
    ],
    example: ["PackRight Manufacturing", "PackRight Plant"],
  },

  // ---- 17-20: optional setup -------------------------------------------
  // Everything below can also be entered in the app after go-live, and an empty
  // sheet blocks nothing. They are here so a client who already knows these
  // values can supply them once instead of re-keying them through the UI.
  //
  // Two columns take a comma-separated list rather than one row per level:
  // Levels on 17 and Ratios on 18. That is not a shortcut — it is the shape the
  // app itself uses (lib/actions/packaging.ts, lib/actions/mappings.ts), where
  // both are single text fields, and a chain is rarely more than three deep.
  // Keeping the workbook the same shape means what a client types here is what
  // they will later see on screen.
  {
    name: "17-PackagingChains",
    purpose:
      "How a category is packed for shipping — STRUCTURE ONLY, no quantities. Those are per vendor, on 18-VendorPackaging.",
    cols: [
      {
        key: "ChainName",
        width: 30,
        required: true,
        help: "Unique. How the chain reads, e.g. Bags → Boxes → Cases. 18-VendorPackaging refers to a chain by this name, so keep it distinct.",
      },
      {
        key: "MaterialCategoryCode",
        width: 24,
        required: true,
        help: "Must exist in 4-MaterialCategories. Where the chain STARTS: its innermost level is the category itself, and only items in this category can use the chain.",
      },
      {
        key: "Levels",
        width: 34,
        required: true,
        help: "The containers ABOVE the item itself, innermost first, comma-separated. e.g. Boxes, Cases. Do not repeat the category name — a BG chain starts from Bags already. Rarely more than three.",
      },
      { key: "IsActive", width: 12, list: YES_NO, help: "Default Yes." },
    ],
    example: ["Bags → Boxes → Cases", "BG", "Boxes, Cases", "Yes"],
  },
  {
    name: "18-VendorPackaging",
    purpose:
      "One vendor's packing quantities for one item. DESCRIPTIVE ONLY — it says how many containers an order occupies, and never changes the quantity ordered or received.",
    cols: [
      { key: "VendorName", width: 30, required: true, help: "Must exist in 9-Vendors" },
      {
        key: "ItemID",
        width: 18,
        required: true,
        help: "Must exist in 7-Items. This vendor/item pair must also appear in 13-VendorItems — packaging hangs off that mapping.",
      },
      {
        key: "ChainName",
        width: 30,
        required: true,
        help: "Must exist in 17-PackagingChains, and its MaterialCategoryCode must match this item's.",
      },
      {
        key: "Ratios",
        width: 20,
        required: true,
        help: "How many of each level fit in ONE of the next level up, innermost first, comma-separated. One whole number (1 or more) per level in the chain. 10, 5 = 10 Bags per Box, 5 Boxes per Case.",
      },
    ],
    example: ["PackRight Manufacturing", "AP-BG-00002", "Bags → Boxes → Cases", "10, 5"],
  },
  {
    name: "19-ItemThresholds",
    purpose:
      "The stock level below which an item is flagged low. One row per item, plus optional per-grower overrides.",
    cols: [
      { key: "ItemID", width: 18, required: true, help: "Must exist in 7-Items" },
      {
        key: "GrowerName",
        width: 30,
        help: "Leave BLANK for the item's default, which applies to every grower. Fill in to override it for one grower — must exist in 8-Growers. At most one row per item per grower.",
      },
      {
        key: "ThresholdQuantity",
        width: 22,
        required: true,
        help: "A number, 0 or more. In the item's material category — the same terms its counts are recorded in. There is no unit column.",
      },
    ],
    example: ["AP-BX-00001", "", 500],
  },
  {
    name: "20-ReminderSchedules",
    purpose:
      "When a grower who has not submitted gets chased by email. One global row, plus optional per-grower overrides.",
    cols: [
      {
        key: "GrowerName",
        width: 30,
        help: "Leave BLANK for the global setting — fill in at most one such row. Otherwise a grower from 8-Growers. A grower row REPLACES the global one for them, so fill in every column on it.",
      },
      {
        key: "CadenceType",
        width: 18,
        required: true,
        list: CADENCE_TYPES,
        help: "Daily / Weekly / Monthly = how often the grower is expected to submit. AfterNDays = chase once this many days have passed with nothing submitted.",
      },
      {
        key: "ThresholdDays",
        width: 18,
        help: "Whole days, 1 or more. Only read when CadenceType is AfterNDays — leave blank for the other three.",
      },
      {
        key: "IsEnabled",
        width: 14,
        required: true,
        list: YES_NO,
        help: "No = send no reminders for this scope. An overdue grower gets at most one reminder a day regardless.",
      },
    ],
    example: ["", "AfterNDays", 3, "Yes"],
  },
]

