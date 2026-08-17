# Master data upload — workbook specification

The format for the client's **one-time** master data load: items, growers,
vendors, users, the lookups those depend on, and the mappings between them.

Generate the blank workbook to send them with:

```bash
npx tsx scripts/generate-master-data-template.ts
# writes master-data-template.xlsx in the repo root
```

This document is the reference; the workbook carries the same rules as column
notes and dropdowns, so the client can mostly work from the file alone.

**Not in scope.** Thresholds, scheduler settings, item messages, packaging
chains and any transactional data (submissions, orders, the ledger) are
configured in the app after go-live, not uploaded.

---

## How to fill it in

One sheet per entity, one row per record. **Row 1 is the header — do not rename,
reorder or delete columns.** Extra columns are ignored; missing ones fail the
import. Leave optional cells blank rather than writing "N/A" or "-", except
where a literal `N/A` is a listed option.

Sheets reference each other **by name** (grower name, location name, category
code), not by database id — the one exception is items, which are referenced by
their ID. Every name you use in a mapping sheet must exist in the sheet that
defines it, spelled identically. Leading and trailing spaces are trimmed;
everything else must match exactly, including case.

### Load order

The importer processes sheets in this order, because each depends on the ones
above it. It matters if a load fails halfway: everything runs in a single
transaction, so a failure rolls the whole thing back and nothing is half-loaded.

```
1  Regions
2  Countries
3  Commodities
4  MaterialCategories
5  SubCategories        -> MaterialCategories
6  Locations            -> Regions, Countries
7  Items                -> Commodities, MaterialCategories, SubCategories, Countries
8  Growers
9  Vendors              -> Countries, Locations
10 Users                -> Growers, Vendors
11 GrowerLocations      -> Growers, Locations
12 GrowerItems          -> Growers, Items
13 VendorItems          -> Vendors, Items
14 VendorCategories     -> Vendors, MaterialCategories
15 VendorSupplyCountries-> Vendors, Countries
```

---

## 1. Regions

Geographic grouping. Used by locations only.

| Column | Required | Type | Rules |
|---|---|---|---|
| `RegionName` | ✅ | text | Unique. e.g. `West`, `Central`, `East` |

---

## 2. Countries

Shared lookup: an item's country of origin, a location's country, a vendor's
headquarters, and vendor supply-to lists.

| Column | Required | Type | Rules |
|---|---|---|---|
| `CountryName` | ✅ | text | Unique. e.g. `USA`, `Mexico` |
| `SelectableAsRealCountry` | | `Yes` / `No` | Default `Yes`. Set `No` for placeholders like `N/A` — they stay valid as an item's origin but are hidden from location, vendor and supply-to pickers |

> Include an `N/A` row with `No` if any item has no meaningful origin.

---

## 3. Commodities

The crop or product family. **The code becomes the first segment of every item
ID**, so choose carefully — item IDs are permanent.

| Column | Required | Type | Rules |
|---|---|---|---|
| `CommodityCode` | ✅ | text | Exactly 2 characters, A–Z uppercase. Unique. e.g. `AP` |
| `CommodityName` | ✅ | text | e.g. `Asparagus` |

---

## 4. MaterialCategories

The packaging material family. **The code becomes the second segment of every
item ID.**

| Column | Required | Type | Rules |
|---|---|---|---|
| `MaterialCategoryCode` | ✅ | text | Exactly 2 characters, A–Z uppercase. Unique. e.g. `BX` |
| `MaterialCategoryName` | ✅ | text | e.g. `Boxes` |

---

## 5. SubCategories

| Column | Required | Type | Rules |
|---|---|---|---|
| `MaterialCategoryCode` | ✅ | text | Must exist in **MaterialCategories** |
| `SubCategoryName` | ✅ | text | Unique within its category. e.g. `Cardboard Boxes` |

---

## 6. Locations

Physical sites. **A grower cannot submit inventory without at least one
location**, so this sheet is not optional in practice.

| Column | Required | Type | Rules |
|---|---|---|---|
| `LocationName` | ✅ | text | Unique |
| `LocationType` | ✅ | list | See the table below |
| `RegionName` | | text | Must exist in **Regions** |
| `CountryName` | | text | Must exist in **Countries**, and be `Selectable` |
| `CommodityFocus` | | text | Free text, e.g. `Asparagus` |
| `KeyPersonnel` | | text | Free text |
| `Notes` | | text | |

### Location types — and what they gate

The type decides **which side may use the site**. A grower-side type cannot be
mapped to a vendor and vice versa; `Both` types can be used by either.

| Type | Usable by |
|---|---|
| `Grower Field` | growers only |
| `Packing House` | growers only |
| `Cold Storage` | growers only |
| `Manufacturing Plant` | vendors only |
| `Distribution Center` | vendors only |
| `3PL Facility` | vendors only |
| `Warehouse` | either |
| `Cross-dock` | either |

> ⚠️ **This list is provisional** — confirm it with the client before sending
> the workbook. Adding, renaming or re-siding a type is a one-line change in
> `LOCATION_TYPES` in [`lib/constants.ts`](../lib/constants.ts), but only before
> data is loaded against it.

---

## 7. Items

**Item IDs are supplied by the client and used verbatim.** They are the primary
key, referenced by every count, order and ledger row, and can never be changed
afterwards.

| Column | Required | Type | Rules |
|---|---|---|---|
| `ItemID` | ✅ | text | Format `CC-MM-NNNNN` — see below |
| `ItemName` | ✅ | text | e.g. `Corrugated Box 40x30` |
| `CommodityCode` | ✅ | text | Must exist in **Commodities** |
| `MaterialCategoryCode` | ✅ | text | Must exist in **MaterialCategories** |
| `SubCategoryName` | ✅ | text | Must exist in **SubCategories** *under this MaterialCategoryCode* |
| `CountryOfOrigin` | ✅ | text | Must exist in **Countries** |
| `UnitOfMeasure` | ✅ | list | `Cases`, `Pallets`, `Rolls`, `Bags`, `Boxes`, `Each`, `Bundles` |
| `ApplicationMethod` | | list | `Machine`, `Hand`, `Machine/Hand`, `N/A` |
| `Status` | ✅ | list | `Active`, `Inactive`, `Review` |
| `LegacyItemRef` | | text | The client's own identifier from their previous system. Carried through for reconciliation; not used as a key |
| `Notes` | | text | |

### The ItemID format

```
AP  -  BX  -  00001
│      │      │
│      │      └─ 5-digit sequence, zero-padded, 00001–99999
│      └──────── MaterialCategoryCode, must match this row's column
└─────────────── CommodityCode, must match this row's column
```

Rules the importer enforces:

1. Matches `^[A-Z]{2}-[A-Z]{2}-\d{5}$` exactly.
2. The first segment equals this row's `CommodityCode`.
3. The second equals this row's `MaterialCategoryCode`.
4. The full ID is unique across the sheet.

Rule 2 and 3 exist because the ID would otherwise lie about the item — an ID
reading `AP-BX-` on a row whose category is `BG` misleads every human who reads
it, and the app has no way to detect it later.

> **The sequence does not need to be contiguous**, and gaps are fine. Items
> created in the app afterwards continue from the highest number in use, across
> all commodity/category combinations — so importing up to `AP-BX-00250` means
> the next item created in the UI is `00251`, whatever its category. Numbers are
> never reused.

### `UnitOfMeasure` is permanent in practice

The item's unit is inherited by every count a grower enters, every order raised,
and its low-stock threshold. Changing it later does not convert historical
quantities, so it silently reinterprets them. Get it right in the upload.

---

## 8. Growers

| Column | Required | Type | Rules |
|---|---|---|---|
| `GrowerName` | ✅ | text | Unique. Used as the key in mapping sheets |
| `PrimaryEmail` | | email | Where submission and reminder emails go |
| `Status` | ✅ | list | `Active`, `Inactive`, `Pending` |
| `PreferredLocale` | ✅ | list | `en` or `es` — language for emails to `PrimaryEmail` |

---

## 9. Vendors

| Column | Required | Type | Rules |
|---|---|---|---|
| `VendorName` | ✅ | text | Unique. Used as the key in mapping sheets |
| `VendorType` | | list | `Manufacturer`, `Pallet Pooling`, `3PL`, `Distributor` |
| `HeadquartersCountry` | | text | Must exist in **Countries**. Where the vendor is *based* — can differ from the country of the site they ship from |
| `LocationName` | | text | Must exist in **Locations** and be a **vendor-usable type**. The vendor's region is read from here |
| `PrimaryContact` | | text | |
| `ContactEmail` | | email | Where vendor notifications go |
| `ContactPhone` | | text | |
| `LeadTimeDays` | | whole number | ≥ 0. Days from order to delivery |
| `PaymentTermsDays` | | whole number | ≥ 0. "Net N days" — the number only |
| `PTAccountNumber` | | text | |
| `Status` | ✅ | list | `Active`, `Inactive` |
| `PreferredLocale` | ✅ | list | `en` or `es` |
| `Notes` | | text | |

---

## 10. Users

People who sign in. **No passwords** — internal staff authenticate through
Microsoft (Entra), growers and vendors through an emailed sign-in link. The
email is therefore the identity and must be exact.

| Column | Required | Type | Rules |
|---|---|---|---|
| `FirstName` | ✅ | text | |
| `LastName` | ✅ | text | |
| `Email` | ✅ | email | **Unique across the whole sheet.** For internal staff this must be their Microsoft sign-in address (UPN) |
| `Role` | ✅ | list | `SuperAdmin`, `InternalAdmin`, `Editor`, `GrowerUser`, `VendorUser` |
| `GrowerName` | conditional | text | **Required** when Role is `GrowerUser`; must be blank otherwise |
| `VendorName` | conditional | text | **Required** when Role is `VendorUser`; must be blank otherwise |
| `IsActive` | ✅ | `Yes` / `No` | |
| `PreferredLocale` | ✅ | list | `en` or `es` — this person's UI and email language |

### What the roles mean

| Role | Sees |
|---|---|
| `SuperAdmin` | everything including settings |
| `InternalAdmin` | everything including onboarding; settings |
| `Editor` | master data only — no users, growers, vendors or settings |
| `GrowerUser` | their own grower's inventory only |
| `VendorUser` | their own vendor's supply reporting only |

> A `GrowerUser` sees **only** the grower named in `GrowerName` — that is the
> data-isolation boundary. Two people at the same grower get two rows with the
> same `GrowerName`. Someone who genuinely covers two growers needs two accounts
> with different email addresses; one row cannot span both.

---

## 11. GrowerLocations

Which sites each grower counts inventory at. **A grower with no row here cannot
submit anything**, so every active grower needs at least one.

| Column | Required | Type | Rules |
|---|---|---|---|
| `GrowerName` | ✅ | text | Must exist in **Growers** |
| `LocationName` | ✅ | text | Must exist in **Locations** and be a **grower-usable type** |

One row per pair. Repeat the grower name for each of its sites.

---

## 12. GrowerItems

Which items each grower is authorized to count. A grower only ever sees items
listed here.

| Column | Required | Type | Rules |
|---|---|---|---|
| `GrowerName` | ✅ | text | Must exist in **Growers** |
| `ItemID` | ✅ | text | Must exist in **Items** |

One row per pair.

---

## 13. VendorItems

Which items each vendor can supply. Drives what a vendor reports on, and which
vendors a grower can order an item from.

| Column | Required | Type | Rules |
|---|---|---|---|
| `VendorName` | ✅ | text | Must exist in **Vendors** |
| `ItemID` | ✅ | text | Must exist in **Items** |

---

## 14. VendorCategories

Which material categories each vendor supplies. Used to narrow the item list
when an admin edits a vendor.

| Column | Required | Type | Rules |
|---|---|---|---|
| `VendorName` | ✅ | text | Must exist in **Vendors** |
| `MaterialCategoryCode` | ✅ | text | Must exist in **MaterialCategories** |

> Keep this consistent with **VendorItems** — if a vendor supplies item
> `AP-BX-00001` its categories should include `BX`. The importer warns on a
> mismatch rather than failing, because the two are edited separately later.

---

## 15. VendorSupplyCountries

Which countries each vendor can ship **to**. Distinct from
`HeadquartersCountry`, which is where they are based.

| Column | Required | Type | Rules |
|---|---|---|---|
| `VendorName` | ✅ | text | Must exist in **Vendors** |
| `CountryName` | ✅ | text | Must exist in **Countries**, and be `Selectable` |

---

## Validation summary

Everything the importer checks before writing anything:

**Structural**
- every expected sheet present, header row unchanged
- no blank rows in the middle of a block
- required cells non-empty

**Format**
- `ItemID` matches `CC-MM-NNNNN`, segments agree with the row's own codes
- commodity and category codes are exactly 2 uppercase letters
- emails are well-formed
- day counts are non-negative whole numbers
- list columns hold one of the documented values (case-sensitive)

**Uniqueness**
- `ItemID`, `Email`, `GrowerName`, `VendorName`, `LocationName`, `RegionName`,
  `CountryName`, `CommodityCode`, `MaterialCategoryCode`
- `SubCategoryName` within its category
- each mapping pair appears at most once

**Referential**
- every cross-sheet name resolves
- `SubCategoryName` belongs to the row's `MaterialCategoryCode`
- a user's `GrowerName`/`VendorName` matches their role
- location types satisfy the grower/vendor gate

**Advisory (warn, don't fail)**
- an active grower with no `GrowerLocations` row — they cannot submit
- an active grower with no `GrowerItems` rows — they will see an empty form
- a vendor supplying items outside its declared categories
- an item no grower is authorized for

---

## After the upload

Configure in the app, not the workbook:

- **Thresholds** — `/admin/settings/thresholds`. The unit is inherited from the item.
- **Reminder schedules** — `/admin/settings/schedulers`. A Global row is created by the bootstrap.
- **Packaging chains and pack ratios** — `/admin/packaging`, then per vendor-item on `/admin/mappings/vendors`.
- **Item messages** — `/admin/item-messages`.

Reference data the bootstrap creates by itself, whether or not it appears in the
workbook: the five **roles**, and the first admin **user** from
`BOOTSTRAP_ADMIN_EMAIL`. See [`prisma/bootstrap.ts`](../prisma/bootstrap.ts).
