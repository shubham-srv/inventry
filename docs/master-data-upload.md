# Master data upload — workbook specification

The format for the client's **one-time** master data load: items, growers,
vendors, users, the lookups those depend on, and the mappings between them.

Generate the blank workbook to send them with:

```bash
npm run data:template            # writes master-data-template.xlsx in the repo root
```

and load the filled-in file back with:

```bash
npm run data:import -- <file.xlsx> --dry-run   # validate only, writes nothing
npm run data:import -- <file.xlsx>             # validate, then import
```

This document is the reference; the workbook carries the same rules as column
notes and dropdowns, so the client can mostly work from the file alone.

Both scripts read the sheet definitions from
[`scripts/master-data-spec.ts`](../scripts/master-data-spec.ts) — one definition,
so the file we send and the file we can read back cannot drift apart.

**Not in scope.** Item messages and any transactional data (submissions, orders,
the ledger) are configured in the app after go-live, not uploaded. Sheets 17–20
(packaging, thresholds, reminders) *can* be uploaded but do not have to be —
leaving them empty holds nothing up.

---

## How to fill it in

One sheet per entity, one row per record. Row 1 describes the sheet, **row 2 is
the header — do not rename, reorder or delete columns**, row 3 is a greyed-out
example to delete, and the client's data starts on row 4. Extra columns are
ignored; a missing *required* column fails the import, while a missing optional
one is treated as blank. Leave optional cells blank rather than writing "N/A" or
"-", except where a literal `N/A` is a listed option.

The importer finds the header by its text rather than by counting rows, so an
inserted row does not break it, and it skips the example row if it was left in —
saying so in the output rather than importing "PackRight Manufacturing" as real
data.

Sheets reference each other **by name** (grower name, location name, category
code), not by database id — the one exception is items, which are referenced by
their ID. Every name you use in a mapping sheet must exist in the sheet that
defines it, spelled identically. Leading and trailing spaces are trimmed;
everything else must match exactly, including case.

### Load order

The importer processes sheets in this order, because each depends on the ones
above it.

**Nothing is written until the whole workbook validates.** The importer reads
every sheet, resolves every cross-sheet reference and reports every problem it
finds — with sheet and row numbers — before it touches the database. If there is
even one error, nothing at all is imported. That is what makes a half-loaded
database impossible here, rather than a transaction.

**It is safe to run more than once.** Every write is an upsert keyed on the same
name the workbook uses, so the normal loop — import, read the errors, fix those
rows, run the whole file again — converges instead of duplicating.

```
1  Regions
2  Countries
3  Commodities
4  MaterialCategories
5  SubCategories        -> MaterialCategories
6  Locations            -> Regions, Countries
7  Items                -> Commodities, MaterialCategories, SubCategories, Countries
8  Growers
9  Vendors              -> Countries
10 Users                -> Growers, Vendors
11 GrowerLocations      -> Growers, Locations
12 GrowerItems          -> Growers, Items
13 VendorItems          -> Vendors, Items
14 VendorCategories     -> Vendors, MaterialCategories
15 VendorSupplyCountries-> Vendors, Countries
16 VendorLocations      -> Vendors, Locations
17 PackagingChains      -> MaterialCategories
18 VendorPackaging      -> Vendors, Items, VendorItems, PackagingChains
19 ItemThresholds       -> Items, Growers
20 ReminderSchedules    -> Growers
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
| `Grower Site` | growers only |
| `Packing House` | growers only |
| `Cold Storage` | growers only |
| `Manufacturing Plant` | vendors only |
| `Distribution Center` | vendors only |
| `3PL Facility` | vendors only |
| `Warehouse` | either |
| `Cross-dock` | either |

> **This list is the starting point, not a fixed one.** Location types are
> maintained in the application at **Admin -> Location types**, so one can be
> added, renamed or re-sided after go-live without a code change or a deploy.
>
> Still confirm the list with the client before sending the workbook: the
> `LocationType` column validates against these names, so a site whose type does
> not exist yet cannot be loaded. Types added in the app afterwards are available
> to later imports immediately.
>
> Renamed September 2026: **Grower Field** became **Grower Site**.

---

## 7. Items

**Item IDs are supplied by the client and used verbatim.** They are the primary
key, referenced by every count, order and ledger row, and can never be changed
afterwards.

| Column | Required | Type | Rules |
|---|---|---|---|
| `ItemID` | ✅ | text | Format `CC-MM-NNNNNN` — see below |
| `ItemName` | ✅ | text | e.g. `Corrugated Box 40x30` |
| `CommodityCode` | ✅ | text | Must exist in **Commodities** |
| `MaterialCategoryCode` | ✅ | text | Must exist in **MaterialCategories** |
| `SubCategoryName` | ✅ | text | Must exist in **SubCategories** *under this MaterialCategoryCode* |
| `CountryOfOrigin` | ✅ | text | Must exist in **Countries** |
| `ApplicationMethod` | | list | `Machine`, `Hand`, `Machine/Hand`, `N/A` |
| `Status` | ✅ | list | `Active`, `Inactive`, `Review` |
| `LegacyItemRef` | | text | The client's own identifier from their previous system. Carried through for reconciliation; not used as a key |
| `Notes` | | text | |
| `ImageFile` | | text | File name of the item's photo in the accompanying images folder — see [Item photos](#item-photos) |

### The ItemID format

```
AP  -  BX  -  000001
│      │      │
│      │      └─ 6-digit sequence, zero-padded, 000001–999999
│      └──────── MaterialCategoryCode, must match this row's column
└─────────────── CommodityCode, must match this row's column
```

Rules the importer enforces:

1. Matches `^[A-Z]{2}-[A-Z]{2}-\d{6}$` exactly.
2. The first segment equals this row's `CommodityCode`.
3. The second equals this row's `MaterialCategoryCode`.
4. The full ID is unique across the sheet.

Rule 2 and 3 exist because the ID would otherwise lie about the item — an ID
reading `AP-BX-` on a row whose category is `BG` misleads every human who reads
it, and the app has no way to detect it later.

> **The sequence does not need to be contiguous**, and gaps are fine. Items
> created in the app afterwards continue from the highest number in use, across
> all commodity/category combinations — so importing up to `AP-BX-000250` means
> the next item created in the UI is `00251`, whatever its category. Numbers are
> never reused.

### There is no unit column — the category *is* the unit

An item's quantities are counted in its **material category**. An item in a
category named `Boxes` is counted in boxes, everywhere: the grower's daily count,
the vendor's report, every order, and its low-stock threshold. That is why there
is no separate `UnitOfMeasure` column — a second, independently chosen unit could
only ever contradict the category.

**So name your categories after the thing you count.** If you count rolls of
labels, the category should be `Rolls`, not `Labels`. Renaming a category later
relabels every quantity ever recorded against its items — it does not convert
them — so a rename after go-live changes what the history *reads as*, while the
numbers stay exactly as entered.

### Item photos

One optional photo per item. The photos travel as a **plain folder (or zip)
alongside the workbook**, and `ImageFile` names the file for that row:

```
master-data.xlsx
item-photos/
  AP-BX-000001.jpg
  AP-BX-000002.png
```

- Names must match exactly, including case and extension.
- `JPG`, `PNG` or `WebP`, up to 10 MB each. The importer resizes and converts
  them, so there is no need to shrink them first.
- A blank cell means "no photo" and is perfectly normal.
- A name with **no matching file** is a warning, not a failure: the item loads
  without a photo and the report lists it, so a missing file never blocks a load.

> **Do not paste images into the spreadsheet cells.** Excel stores them at full
> resolution, so a few hundred photos produce a workbook too large to open or
> email — and images pasted as floating objects drift away from their rows as
> soon as anyone inserts a row, which silently misfiles them against the wrong
> items. The separate folder is both smaller and unambiguous.

Photos can also be added and replaced per item in the app afterwards, on
`/admin/items` — the workbook is only the bulk path for the initial load.

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
| `HeadquartersCountry` | | text | Must exist in **Countries**. Where the vendor is *based* — can differ from the country of the sites they ship from |
| `PrimaryContact` | | text | |
| `ContactEmail` | | email | Where vendor notifications go |
| `ContactPhone` | | text | |
| `LeadTimeDays` | | whole number | ≥ 0. Days from order to delivery |
| `PaymentTermsDays` | | whole number | ≥ 0. "Net N days" — the number only |
| `PTAccountNumber` | | text | |
| `Status` | ✅ | list | `Active`, `Inactive` |
| `PreferredLocale` | ✅ | list | `en` or `es` |
| `Notes` | | text | |

> A vendor's sites live in **16. VendorLocations**, not here — a vendor can
> operate from several.

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
> `AP-BX-000001` its categories should include `BX`. The importer warns on a
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

## 16. VendorLocations

Which sites each vendor operates from — a manufacturing plant, a distribution
centre, a 3PL facility. The vendor's **region(s)** are read from here; there is
no region column on the vendor sheet.

| Column | Required | Type | Rules |
|---|---|---|---|
| `VendorName` | ✅ | text | Must exist in **Vendors** |
| `LocationName` | ✅ | text | Must exist in **Locations** and be a **vendor-usable type** |

One row per pair. Repeat the vendor name for each of its sites.

> Unlike **GrowerLocations**, a vendor with no row here still works — they just
> show no location and no region. Vendors report one figure per item per day
> regardless of how many sites they run.

---

# Sheets 17–20 — optional setup

Everything below can also be entered in the app after go-live. Fill these in
only if the client already knows the values; an empty sheet blocks nothing.

Two columns take a **comma-separated list** rather than one row per level:
`Levels` on 17 and `Ratios` on 18. That is not a shortcut — it is the shape the
app itself uses, where both are single text fields, and a chain is rarely more
than three deep. Keeping the workbook the same shape means what a client types
here is what they later see on screen.

## 17. PackagingChains

How a category is packed for shipping — **structure only, no quantities**. The
numbers are per vendor, on sheet 18.

| Column | Required | Type | Rules |
|---|---|---|---|
| `ChainName` | ✅ | text | Unique. How the chain reads, e.g. `Bags → Boxes → Cases`. Sheet 18 refers to a chain by this name. |
| `MaterialCategoryCode` | ✅ | text | Must exist in **MaterialCategories**. Where the chain starts. |
| `Levels` | ✅ | list | The containers **above** the item itself, innermost first: `Boxes, Cases` |
| `IsActive` | | Yes/No | Default Yes |

The chain's innermost level **is the material category**, so do not repeat it in
`Levels` — a `BG` chain starts from Bags already. Only items in the chain's
category can use it.

## 18. VendorPackaging

One vendor's packing quantities for one item.

| Column | Required | Type | Rules |
|---|---|---|---|
| `VendorName` | ✅ | text | Must exist in **Vendors** |
| `ItemID` | ✅ | text | Must exist in **Items**, and the vendor/item pair must appear in **13-VendorItems** |
| `ChainName` | ✅ | text | Must exist in **17-PackagingChains**, and its category must match the item's |
| `Ratios` | ✅ | list | One whole number (1+) per level in the chain, innermost first |

`10, 5` against `Boxes, Cases` means 10 bags per box, 5 boxes per case. The
count must equal the chain's number of levels — the importer rejects the row
otherwise, because a mismatch has no sensible interpretation.

> **Packaging is descriptive and never changes a quantity.** It works out how
> many containers an ordered quantity occupies in transit. Those containers are
> discarded on arrival and are never stock. What a grower orders is what a
> grower receives.

## 19. ItemThresholds

The stock level below which an item is flagged low.

| Column | Required | Type | Rules |
|---|---|---|---|
| `ItemID` | ✅ | text | Must exist in **Items** |
| `GrowerName` | | text | **Blank = the default for every grower.** Name a grower to override it for them. |
| `ThresholdQuantity` | ✅ | number | 0 or more |

At most one row per item per grower, plus at most one blank-grower default per
item. The quantity is in the item's **material category** — the same terms its
counts are recorded in. There is no unit column.

## 20. ReminderSchedules

When a grower who has not submitted gets chased by email.

| Column | Required | Type | Rules |
|---|---|---|---|
| `GrowerName` | | text | **Blank = the global setting.** At most one such row. |
| `CadenceType` | ✅ | list | `Daily`, `Weekly`, `Monthly`, `AfterNDays` |
| `ThresholdDays` | | number | Whole days, 1+. Only read when `CadenceType` is `AfterNDays`. |
| `IsEnabled` | ✅ | Yes/No | `No` = send no reminders for this scope |

A grower row **replaces** the global one for that grower wholesale — there is no
field-level merge, so fill in every column on it. An overdue grower gets at most
one reminder a day regardless of what is set here.

---

## Validation summary

Everything the importer checks before writing anything:

**Structural**
- every expected sheet present, header row unchanged
- no blank rows in the middle of a block
- required cells non-empty

**Format**
- `ItemID` matches `CC-MM-NNNNNN`, segments agree with the row's own codes
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

**Packaging, thresholds and reminders (17–20)**
- a chain's `Levels` is non-empty; a row's `Ratios` count equals its chain's level count
- every ratio is a whole number, 1 or more
- a packaging row's vendor/item pair exists in **13-VendorItems**
- the chain's category matches the item's category
- `ThresholdDays` is present when `CadenceType` is `AfterNDays`
- at most one blank-`GrowerName` row on **20-ReminderSchedules**

**Advisory (warn, don't fail)**
- rows naming a photo in `ImageFile` — the importer does not upload photos, so
  those items load without one
- the example row left in a sheet — skipped, not imported
- an optional column deleted from a sheet — treated as blank
- an active grower with no `GrowerLocations` row — they cannot submit
- an active grower with no `GrowerItems` rows — they will see an empty form
- a vendor supplying items outside its declared categories
- an item no grower is authorized for

---

## After the upload

- **Item messages** — `/admin/item-messages`. Not uploadable; authored in the app.
- **Item photos** — the importer does **not** upload them. It validates and
  counts the `ImageFile` column and warns about the rows that name a file, but
  the pictures themselves are attached through `/admin/items`.

Anything on sheets 17–20 that was left blank is also set in the app:
**thresholds** at `/admin/settings/thresholds`, **reminder schedules** at
`/admin/settings/schedulers`, **packaging** at `/admin/packaging` and then per
vendor-item on `/admin/mappings/vendors`.

Reference data the bootstrap creates by itself, whether or not it appears in the
workbook: the five **roles**, and the first admin **user** from
`BOOTSTRAP_ADMIN_EMAIL`. See [`prisma/bootstrap.ts`](../prisma/bootstrap.ts).
