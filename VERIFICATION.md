# Verification Guide

How to run and verify the demo locally. (You verify; this file tracks what to check.)

## Setup

```bash
# .env already points at your SQL Server (webapp@localhost:1433, db inventory_demo)
npm install
npm run db:push      # sync schema (already done)
npm run db:seed      # load demo data (already done; re-run to reset)
npm run dev          # http://localhost:3000  (I was testing on PORT=3100)
```

If you change data and want a clean slate: `npm run db:reset` (force-push + reseed).

## Demo logins (user picker at `/login`)

| Email | Role | Scope |
|---|---|---|
| admin@demo.local | Internal Admin | everything incl. settings |
| editor@demo.local | Editor | master data only (no users/growers/vendors/settings) |
| james@agribar.local / maria@agribar.local | Grower | Agribar |
| diago@brigo.local | Grower | Brigo |
| priya@pdg.local | Grower | PDG |
| sam@packright.local | Vendor | PackRight |
| lena@palletpool.local | Vendor | PalletPool |
| omar@labelworks.local | Vendor | LabelWorks |

---

## P1 — Auth & access (done)
- [ ] `/login` lists seeded users grouped by Internal / Growers / Vendors.
- [ ] Logging in as each role lands on its home (`/admin`, `/grower`, `/vendor`).
- [ ] A grower visiting `/admin/...` is redirected away (data isolation).
- [ ] Editor sidebar hides Growers/Vendors/Users/Settings; admin sees them.
- [ ] Sign out (sidebar footer) returns to `/login`.

## P2 — Admin master data & mapping (done)
Pages: `/admin/items`, `/commodities`, `/categories`, `/sub-categories`, `/locations`, `/growers`, `/vendors`, `/users`, `/authorizations`.
- [ ] Each list loads with search + filters; pagination works.
- [ ] **Add / Edit / Delete** via the dialog on each page persists and refreshes.
      - NOTE: I just fixed a render crash on **/admin/sub-categories** and **/admin/users**
        (dialog content now renders lazily). Please confirm both load and that Edit saves.
- [ ] Editing a row pre-fills values and saves (id is submitted automatically).
- [ ] **Export to Excel** downloads the current filtered view (.xlsx).
- [ ] **Full export** downloads one multi-sheet workbook of all master data.
- [ ] Users page: create a user with role Grower → must require a grower; role Vendor → must require a vendor; internal roles map to neither.
- [ ] Authorizations: add/revoke/remove an item for a grower.
- [ ] Editor is blocked (redirect) from `/admin/users`, `/admin/growers`, `/admin/vendors`, `/admin/authorizations`, and from admin-only exports.
- [ ] After admin CRUD, check **Audit Logs** (P5) captured each action.

## P3 — Grower flow (log in as james@agribar.local)
- [ ] **Dashboard** shows badges (submitted this week / unchanged-vs-last-week / last submitted), stat cards, today's progress bar, and "biggest changes vs last week".
- [ ] **Submit inventory**: items are listed & sorted; enter On-hand (the On-order input was removed — orders are now managed per card, see Round 5); the progress bar fills as you fill rows; items below their threshold show a "Below threshold" badge; toggle "Low" on an item; click **Submit counts** → toast, progress persists on reload.
- [ ] **On order**: lists the grower's open orders plus anything received/cancelled today (see Round 5).
- [ ] **History**: past submissions with per-item details and Low flags.
- [ ] **Requests**: raise a missing-item request → it appears with status Open.
- [ ] Each submit/flag/request creates an **Outbox** entry (check as admin).
- [ ] Log in as **diago@brigo.local** → confirm you only see Brigo's items/history (isolation).
- [ ] Responsive: narrow the window / open on a phone — submit page stays usable.

## P4 — Vendor flow (log in as sam@packright.local)
- [ ] **Dashboard**: items supplied, growers served, latest total qty, reported-this-week badge, top items.
- [ ] **Submit report**: enter a quantity + unit per item; expand **Allocate to growers**; the "allocated / quantity" badge turns red if allocations exceed the quantity (server also rejects it); submit → toast.
- [ ] **History**: reports with per-grower allocation chips.
- [ ] Log in as **lena@palletpool.local** → only PalletPool's items/history (isolation).

## P5 — Settings, tools & integrations (log in as admin@demo.local)
- [ ] **Conversions** (`/admin/conversions`): CRUD a unit conversion; optionally scope to a commodity/item; editor can also access this.
- [ ] **Reports** (`/admin/reports`): placeholder Power BI panels + a live trend chart from the ledger.
- [ ] **Settings → Thresholds**: add/edit a threshold; grower-scoped overrides global (verify it changes the "Below threshold" highlight on that grower's submit page).
- [ ] **Settings → Schedulers**: edit the global cadence / add a per-grower schedule; click **Run reminder check now** → toast with counts; overdue growers get a reminder in the **Outbox** (Brigo/PDG are seeded overdue). Re-running same day does not duplicate.
- [ ] **Settings → Audit logs**: filter by action/entity; confirm your earlier CRUD + exports + reminder runs are recorded.
- [ ] **Settings → Outbox**: filter mocked emails by type/status.
- [ ] **Item Requests** (`/admin/requests`): review a grower's request — change status + notes; the grower sees the updated status + admin note.
- [ ] `npm run reminders` from a terminal runs the same check and writes to the Outbox.

## P6 — Azure integration code (isolated, not active locally)
- [ ] Cron endpoint works: `curl -X POST -H "x-cron-secret: dev-only-cron-secret" http://localhost:3000/api/cron/reminders` returns JSON.
- [ ] `integration/` contains Entra auth routes, the Azure Timer Function, and `INTEGRATION.md`; it's excluded from the build (typecheck/lint stay green).
- [ ] `lib/email/acs/sender.ts` is the ACS path selected by `EMAIL_PROVIDER=acs`.
- [ ] Nothing in `integration/` is imported by the running app.

## Round 4 — fixes & new features (July 2026)

### Bug fixes
- [ ] **No horizontal scroll on mobile**: browse admin lists + grower/vendor pages on a phone — the page itself never scrolls sideways; wide tables scroll *inside* their bordered container instead. (Fix: `min-w-0` on the content pane + `overflow-x: clip` on body + table wrapper scrolls.)
- [ ] **Dialog vs dropdown**, all combinations:
      1. Open Add/Edit dialog → open a Select → click an **option** → dropdown closes, dialog stays.
      2. Open a Select → click **elsewhere inside the dialog** → dropdown closes, dialog stays.
      3. Open a Select → click the **dark overlay** → dropdown closes, dialog stays.
      4. No dropdown open → click the **overlay** → dialog closes (normal behavior restored).

### Grower draft/submit (james@agribar.local)
- [ ] Submit page now has **Save draft** (outline) and **Submit counts** (primary).
- [ ] Enter counts → **Save draft**: toast; amber "Draft saved — not submitted yet" chip appears; **progress bar does NOT move**; values persist on reload; rows show an amber clock icon.
- [ ] Draft does **not** create Outbox email, does not move dashboard badges/"submissions this week", and does not count for reminders (a drafting-only grower still gets reminded).
- [ ] Click **Submit counts**: progress bar jumps to the submitted count; rows turn green; Outbox gets the submission email; history shows the submission with an **Approved** badge (drafts show **Draft**).
- [ ] Ledger/analytics (admin Reports chart, week-over-week deltas) only reflect **submitted** numbers.

### Multi-lingual (English + Spanish)
- [ ] **Globe icon** in the top bar (and on the login page, top-right) switches EN ↔ ES; choice persists (cookie) across reloads and sessions.
- [ ] Fully translated: login page, sidebar/nav, header (role/context), user menu, and the **entire grower and vendor experience** (dashboards, submit forms incl. draft/submit buttons, history, on-order, requests) plus shared UI (search, export buttons, pagination, dialog Save/Cancel, toasts from grower/vendor actions).
- [ ] Admin data pages: chrome (search/export/pagination/buttons) translates; entity field labels/column headers intentionally remain English for now — extend `lib/i18n/dictionaries/*.json` to cover them when needed.
- [ ] Spanish check: log in as james@agribar.local, switch to Español → "Enviar inventario", "Guardar borrador", "Progreso de hoy", etc.

## Round 5 — item↔partner mapping + separated orders (July 2026)

> **Requires a schema change.** Run `npm run db:push` then `npm run db:seed`
> (or `npm run db:reset`) before testing — a new `Order` table was added and
> `InventorySubmissionDetail.quantityOnOrder` was dropped. `npx prisma generate`
> has already been run, so the Prisma client types are current.

### Item ↔ growers/vendors mapping (admin@demo.local, `/admin/items`)
- [ ] **Add item**: the New item dialog now has **Growers (who use this item)** and **Vendors (source this item from)** multi-selects (searchable popover with checkboxes + removable chips). Pick a few of each → create → item saved.
- [ ] The picks write to the same tables as `/admin/authorizations` (growers) and the item↔vendor map (vendors): a grower you selected can now see the item on their Submit page; a vendor you selected becomes an order option for it.
- [ ] **Edit item**: the two multi-selects pre-fill with the item's current active growers/vendors. Remove one and save → that mapping is deactivated (grower loses the item / vendor drops off its order list). Re-add and save → restored.
- [ ] Cross-check `/admin/authorizations` still works and reflects grower changes made from the item form.

### Grower orders (james@agribar.local, `/grower/submit`)
- [ ] Each item card now has an **Orders** section (the old "On order" input is gone; On-hand + Low remain).
- [ ] **Add order** → dialog: the Vendor list is limited to the item's mapped vendors; enter a quantity (unit defaults to the item's UOM) → toast "Order placed"; the order appears as **Open** with vendor + "Ordered <date>". Add another to the same item/vendor → both show (multiple orders allowed).
- [ ] **Receive** an open order → toast; it flips to a green **Received** badge and the buttons disappear. **Cancel** (X → confirm) → **Cancelled**. Both stay visible **today**.
- [ ] Drop-off rule: the seeded Agribar order **received yesterday** is already **hidden**; today's received/cancelled ones remain until day end. (Seed includes today-received, today-cancelled, and yesterday-received to prove this.)
- [ ] Receiving does **not** change on-hand or write to the ledger — orders are tracked separately; the next daily count reflects the stock.
- [ ] An item with **no** mapped vendors shows "No vendors mapped to this item." instead of the Add order button.
- [ ] **`/grower/on-order`** now tables the grower's Open orders + today's received/cancelled (vendor, qty, order date, status).
- [ ] **History** no longer has an On-order column.
- [ ] Isolation: server rejects ordering an unauthorized item or an unmapped vendor; orders belong to the grower only.
- [ ] Spanish: switch to Español → "Pedidos", "Agregar pedido", "Recibir", "Cancelar pedido", and the on-order table headers are translated.

## Dropdown / menu layout-shift fix (globals.css)
Fix for the page shifting when a Radix menu opens (`scrollbar-gutter: stable` +
cancelling react-remove-scroll's `body[data-scroll-locked]` margin compensation).
- [ ] On a page **tall enough to have a vertical scrollbar**, open any dropdown /
      select / user menu → the page underneath (and the right-edge content) stays
      perfectly still; nothing shifts left or shrinks. Close it → still no jump.
- [ ] Repeat on a **short page** (no scrollbar) — no shift either.
- [ ] Same check for a **Dialog** and the mobile **Sheet** (they use the same lock).
- [ ] A thin gutter is now always reserved on the right edge (expected — that's
      what absorbs the shift). Confirm it doesn't look off in either theme.

### Dropdown position when scrolled (globals.css + app layout)
`overflow: clip` on `<body>` was making it a containing block for Radix's
`position: fixed` menus, so once you scrolled they rendered at the document top
(out of view). Moved the horizontal-scroll clip off `<body>` onto the app
wrapper (`SidebarProvider className="overflow-x-clip"`), which the body-level
Radix portal escapes.
- [ ] **Scroll down** a long page, then open the **avatar/user menu** in the top
      bar → the menu now appears anchored to the avatar and is fully visible.
- [ ] Same when scrolled for any **Select / dropdown / popover** lower on the page.
- [ ] Regression check — **mobile horizontal scroll still prevented**: on a phone
      width, browse admin lists / grower / vendor pages; the page never scrolls
      sideways, wide tables still scroll inside their own bordered container.
- [ ] Collapse/expand the sidebar and toggle the mobile sidebar (Sheet) — no
      stray horizontal scrollbar appears.

## Map items when creating growers / vendors (admin@demo.local)
Mirror of the Round 5 item form, from the partner side. No schema change — reuses
the same `GrowerItemAuthorization` / `ItemVendor` tables (soft-deactivate on
removal), so edits here, the item form, and `/admin/authorizations` stay in sync.
- [ ] **`/admin/growers` → Add grower**: the New grower dialog now has an **Items
      (this grower can access)** searchable multi-select. Pick a few → Create.
      The grower's Submit page now lists exactly those items; the row's **Items**
      count reflects the number picked.
- [ ] **Edit grower**: the multi-select pre-fills with the grower's current active
      items. Remove one + save → that item drops off the grower's Submit page.
      Re-add + save → it returns. Cross-check `/admin/authorizations` reflects it.
- [ ] **`/admin/vendors` → Add vendor**: New vendor dialog has an **Items (this
      vendor can supply)** multi-select. Pick a few → Create. Those items now list
      this vendor as an order option on a grower's Submit page (Round 5 orders).
- [ ] **Edit vendor**: pre-fills active items; remove/add + save reconciles the
      vendor↔item map (and the item form's Vendors list agrees).
- [ ] Isolation/consistency: a mapping added from the item form appears selected
      here, and vice-versa; both write the same rows.

## Conversions/Items page crash — Radix asChild + RSC (entity-form-dialog.tsx)
`/admin/conversions` and `/admin/items` were throwing on load: "Primitive.button
failed to slot onto its children." Root cause: `EntityFormDialog` passed the
server-created `trigger` element straight into `<DialogTrigger asChild>`, and once
the row dialog's `values` payload was large enough, React streamed that element as
a deferred reference — breaking Radix's `React.Children.only`. Fixed by wrapping
the trigger in a client-created `<span className="contents">` (layout-inert).
- [ ] **`/admin/conversions`** loads without crashing; rows render.
- [ ] **`/admin/items`** loads without crashing.
- [ ] Row **Edit** (pencil) and toolbar **Add** open the dialog — by mouse click
      AND by keyboard (Tab to the button, press Enter/Space).
- [ ] Same spot-check on a page that already worked (e.g. `/admin/commodities`,
      `/admin/growers`) — triggers still open dialogs normally.
- [ ] Note: `ConfirmButton` (delete) uses the same `asChild` trigger pattern but
      small props, so it doesn't hit the threshold; if a delete/confirm ever
      crashes the same way, apply the identical span wrapper there.

## Round 6 — item fields, table rename, vendor categories, order ETA (July 2026)

> **Requires a schema change.** Run `npm run db:push` then `npm run db:seed`
> (or `npm run db:reset`) before testing. This renames the `InventorySubmission`
> / `InventorySubmissionDetail` tables to `GrowerSubmission` /
> `GrowerSubmissionDetail`, adds a `CountryOfOrigin` lookup table and a
> `VendorMaterialCategory` mapping table, and adds columns
> (`Item.countryOfOriginId`, `Order.expectedDeliveryDate`).
> `npx prisma generate` has been run (the query-engine DLL was locked by a
> running dev server on Windows — restart `npm run dev` if types look stale).

### Table rename (no behavior change) — regression check
- [ ] Grower **Submit** / **History** / **Dashboard** still load and show submissions.
- [ ] Admin home **Recent submissions** list still renders with item counts.
- [ ] `/admin/reports` trend chart (reads the ledger) still renders.
- [ ] **Settings → Schedulers → Run reminder check now** still works (reads submissions).
- [ ] DB check: tables are now `GrowerSubmission` / `GrowerSubmissionDetail`.

### Item: Country of origin (admin@demo.local, `/admin/items`)
- [ ] **Add / Edit item** dialog has a **Country of origin** dropdown (USA, Mexico,
      Canada, Peru, Ecuador, N/A). Pick a value → save → it persists and pre-fills on edit.
- [ ] The items table shows an **Origin** column; seeded items have values.
- [ ] **Export items** (.xlsx) includes a Country of origin column.
- [ ] (Product class was later removed — see Round 7.)

### Vendor material categories (admin@demo.local, `/admin/vendors`)
- [ ] **Add / Edit vendor** dialog has a **Material categories (this vendor supplies)**
      multi-select of the material categories (BX, BG, LB, PL, ST). Pick a few → save.
- [ ] The vendors table shows a **Categories** count; edit pre-fills current picks;
      removing one + save deactivates that mapping (kept for history, like items).
- [ ] **Export vendors** (.xlsx) includes a Material categories column.

### Order expected delivery date (james@agribar.local)
- [ ] `/grower/submit` → an item's **Add order** dialog has an **Expected delivery date**
      picker (optional). Set one → the order row shows a truck **ETA <date>**.
- [ ] On an open order (submit page), the **pencil** opens "Expected delivery date" →
      change/clear it → toast "Expected delivery date updated"; the ETA updates.
- [ ] `/grower/on-order` has an **Expected delivery** column and a per-row **pencil**
      (open orders only) to edit it; seeded open orders show future ETAs.
- [ ] Isolation: editing another grower's order id is rejected server-side.
- [ ] Spanish: switch to Español → "Fecha de entrega prevista", "Entrega <date>".

## Round 7 — remove Item product class + first real migration (July 2026)

> **First change on the new migrate workflow** (see `MIGRATIONS.md`). This drops
> the `Item.productClass` column. It ships as migration
> `prisma/migrations/<ts>_remove_item_product_class/` (a `DROP COLUMN`), applied
> with `npm run db:migrate:deploy`. If your dev server was running during
> generate, **restart `npm run dev`** so it loads the client without `productClass`.

- [ ] `/admin/items`: the Add/Edit dialog no longer has a **Product class** field;
      the table no longer has a **Class** column. Country of origin is unaffected.
- [ ] Creating/editing an item still saves correctly.
- [ ] **Export items** (.xlsx) no longer has a Product class column (Origin remains).
- [ ] `npm run db:migrate:status` → up to date; the DB `Item` table has no
      `productClass` column.

## Round 8 — email language, React Email, low-inventory review, item messages (July 2026)

> **Requires schema changes.** Four additive migrations ship under
> `prisma/migrations/` (`add_preferred_locale`, `notification_body_html`,
> `low_inventory_review`, `item_messages`). `npx prisma generate` has already been
> run, so the client types are current.
>
> - Apply to your existing DB: `npm run db:migrate:deploy` (all four are additive —
>   new columns default sensibly; existing growers/vendors stay English).
> - **For the full bilingual demo** (Brigo/PalletPool pre-set to Español + seeded
>   item messages): `npm run db:reset` (force-reset + reseed).
>
> New optional env var: `APP_URL` (base URL for the button links in emails;
> defaults to `http://localhost:3000`). Restart `npm run dev` after migrating.

### P8.1 — Preferred language (both admin-set and self-served)
- [ ] **Self-serve**: log in as **james@agribar.local**, switch language via the globe
      icon → the choice persists across reload **and** across sign-out/in (it's now
      saved to the user, then re-applied to the cookie on next login — try a private
      window and log in again).
- [ ] **Admin-set (grower)**: `/admin/growers` → Edit a grower → new **Email language**
      dropdown (English / Español) saves and pre-fills on re-open.
- [ ] **Admin-set (vendor)**: `/admin/vendors` → Edit → same **Email language** field.
- [ ] Seeded Spanish orgs: **Brigo** grower and **PalletPool Co** vendor default to Español.

### P8.2 — Localized React Email + Outbox HTML preview (admin → Settings → Outbox)
All emails are now branded HTML (with a plaintext fallback) in the **recipient's**
language. In the Outbox each row shows the **rendered HTML** in a preview frame.
Trigger each and confirm language + content:
- [ ] **Grower submission** — submit as **james** (English email) and as
      **diago@brigo.local** (Brigo → **Spanish** email: "Envío de inventario recibido").
- [ ] **Vendor submission** — submit as **lena@palletpool.local** → **Spanish** email.
- [ ] **Scheduled reminder** — Settings → Schedulers → Run reminder check now (or
      `npm run reminders`) → Brigo's reminder is in **Spanish**, Agribar/PDG in English.
- [ ] **Item request received** — as a grower, raise a request → **every admin** gets
      an email (fan-out), each in **their own** language (not the grower's).
- [ ] **Item request reviewed** — as admin review it (`/admin/requests`) → the grower
      gets a "reviewed" email in their language (new).
- [ ] **Order placed** — as a grower add an order → grower gets an order-confirmation
      email (new; there was none before).
- [ ] **Low-inventory reviewed** — see P8.3.
- [ ] Raising a low flag sends **no** email (it only appears in the admin queue).

### P8.3 — Low-inventory admin review (`/admin/low-inventory`)
- [ ] As **james**, on Submit toggle **Low** on an item and Submit. Submit again 2–3×
      with it still on → the admin sees **one** row, not three (idempotent).
- [ ] New nav **Low Inventory** (admin) lists **Awaiting review** flags (item, grower,
      flagged-by, reason). Filters: State (Awaiting/Reviewed/All) + Grower + item search.
- [ ] **Review & clear** (with optional notes) → the flag flips to **Reviewed**, and the
      grower gets a **low-inventory-reviewed** email in their language.
- [ ] Back as the grower: the item's **Low** checkbox is now **cleared** (disappeared).
- [ ] Grower can still self-clear (toggle Low off + Submit) before admin review — that
      removes it from the queue with no email.
- [ ] Seeded: Agribar (BR-BX-00007) and Brigo (CG-BX-00005) start with an active flag.

### P8.4 — Global item messages (`/admin/item-messages`)
- [ ] New nav **Item Messages** (admin). **Add message**: pick an item, a **type**
      (Retiring / Increase stock / Clear inventory / Notice), severity, **audience**
      (All growers **or** Selected + a grower multi-select), an optional note, and an
      optional start/end window. Create.
- [ ] As an authorized grower, `/grower/submit` shows the message **under that item**
      (colored by severity, with the type label + your note).
- [ ] **Audience = Selected** reaches only the chosen growers; **All** reaches every
      authorized grower. **Disable** a message (Edit → State: Disabled) → it vanishes
      from grower views; re-enable → returns. Delete works too.
- [ ] Window: set an end date in the past → the message stops showing.
- [ ] **Localized type label**: seeded "Increase stock" message targets **Brigo** only
      — log in as **diago@brigo.local** in Español → it reads **"Aumentar stock"**.
      Seeded "Retiring" (all growers) shows on PDG's items; "Clear inventory" (critical,
      all) on Avocado Poly Bag.

### P8.5 — Load previous values (grower Submit)
- [ ] `/grower/submit` has a **Load previous values** button next to Save draft/Submit.
      Click it → every box with a last-submitted value is filled in (so you only edit
      the ones that changed). Disabled when there's no prior history to load. (Español:
      "Cargar valores anteriores".)

### P8.6 — Deployment (Azure Container Apps + Cron Job) — code/doc check
- [ ] Reminder path is headless (no cookie): `npm run reminders` localizes off
      `Grower.preferredLocale`. See updated `integration/INTEGRATION.md` §3 — the
      production scheduler is now an **ACA Cron Job** running `npm run reminders`
      (or curling `/api/cron/reminders`); the Azure Functions Timer is the legacy path.

### P8.7 — Multi-item authorization (`/admin/authorizations`)
- [ ] **Authorize item** dialog: the single Item dropdown is now a **multi-select** ("Items")
      — pick a grower and **several items** in one go, then Authorize.
- [ ] Result toast reads "N authorizations added"; one row appears per selected item, all Active.
- [ ] Re-authorizing an item the grower already has (in the same batch or a later one) is
      **idempotent** — it re-activates rather than erroring or duplicating (upsert).
- [ ] Selecting a single item still works and reads "Authorization added".
- [ ] Submitting with no item selected shows the "At least one item is required" error.

## Round 9 — item unit, generated IDs, lookups, safer deletes (July 2026)

**Run the migration first** — this round adds a table and changes columns:

```bash
npm run db:migrate:deploy   # applies 20260731090000_item_uom_and_region_lookup
npm run db:seed             # optional: refresh the demo data (wipes it)
```

The migration was replay-tested on the shadow DB (`inventory_demo_shadow`) with
fixture rows: item/vendor/location `region` text backfills into the new `Region`
FK (unknown values like "Atlantis" become new Region rows), and `Item.unitOfMeasure`
backfills from each item's threshold unit (global threshold preferred). Your
`inventory_demo` DB is untouched until you run the command above.

### P9.1 — Item unit of measure (`/admin/items` → grower/vendor views)
- [ ] **Add item** now has a required **Unit of measure** dropdown; the items table
      shows a **Unit** column.
- [ ] As a grower (`james@agribar.local`) on `/grower/submit`: the On-hand label reads
      **"On hand (Cases)"** for that item, and **Add order** shows the unit **greyed out
      and uneditable** — it is the item's unit, not a choice.
- [ ] Place an order → `/grower/on-order` and the order row show that unit. Changing the
      item's unit in admin and reloading shows the new unit on the next order.
- [ ] As a vendor (`sam@packright.local`) on `/vendor/submit`: the Unit box is read-only
      and pre-filled from the item.

### P9.2 — Generated item IDs
- [ ] **Add item**: there is no Item ID box — the dialog says it is generated. Create
      "Asparagus Bag" with commodity **AP** + category **BG** → toast reads
      **"Item AP-BG-000NN created"** and the row appears with that ID.
- [ ] The number is a single running sequence across all items (next one continues from
      the highest existing). A per-combination variant exists but is **not** wired up:
      `nextItemIdForCombination` in [lib/items/item-id.ts](lib/items/item-id.ts) — swap the
      call in `createItem` if the client asks for per-combination numbering.
- [ ] **Edit item** shows the ID read-only (greyed) and saving works — this is the bug
      where editing complained the ID field was required.

### P9.3 — Required fields + filtered sub-category
- [ ] Commodity, Category, Sub-category, Country of origin, Region and Unit are all
      required on create; leaving one blank highlights it with a message.
- [ ] **Sub-category is disabled until a Category is picked**, then lists only that
      category's sub-categories. Changing the Category clears the sub-category.
- [ ] **Legacy ID** is gone from both the create and edit forms (the column is kept for
      the initial upload and still appears in search + the Excel export).

### P9.4 — Type-to-confirm deletes (every admin list)
- [ ] Delete on items / commodities / categories / sub-categories / countries / locations /
      growers / vendors / users / conversions / thresholds / schedulers / item messages /
      authorizations asks you to **type "delete"**; the red button stays disabled until it
      matches, and the box resets when reopened. (Español: type **"eliminar"**.)
- [ ] Non-delete confirmations (grower **Cancel order**) are unchanged — single click.

### P9.5 — Countries of Origin page (`/admin/countries`)
- [ ] New **Countries of Origin** entry in the Master Data sidebar group; list shows each
      country with an **Items** count, search works, and Export downloads the sheet.
- [ ] Add / edit a country → it appears in the item form's Country of origin dropdown.
- [ ] Deleting a country **used by items** is refused with "used by N item(s)"; deleting an
      unused one works.

### P9.6 — Region lookup (no page, by design)
- [ ] Region is a dropdown (not free text) on **items**, **vendors** and **locations**, and
      each of those lists has a **Region** filter. Values come from the seeded
      `Region` table (West / Central / East) — deliberately no admin page.

## Round 10 — seed: bulk inserts + two seed bugs (August 2026)

No migration and no app-code change — this round only touches
[prisma/seed.ts](prisma/seed.ts). Re-seed to pick it up:

```bash
npm run db:seed             # wipes and re-seeds the demo data
```

### P10.1 — Seed is re-runnable (was: crashed on the second run)
`clearAll()` never deleted `ItemMessage` / `ItemMessageGrower`, and both FK to
`Item`/`Grower` with `ON DELETE NO ACTION` — so the *second* `npm run db:seed`
against an already-seeded DB failed on a FK violation at `item.deleteMany()`.
`npm run db:reset` hid this, because `--force-reset` drops the DB first.

- [ ] Run `npm run db:seed` **twice in a row**. Both runs finish with
      "✅ Seed complete." (before the fix, the second run threw a FK error).

### P10.2 — Every item has a unit (was: 7 of 12 had none)
The seed carried a `uom` per item but never wrote it to `Item.unitOfMeasure`, so
[resolveItemUnits()](lib/items/uom.ts) fell back to the threshold unit — and only
5 of the 12 demo items have a threshold. The other 7 showed no unit at all.

- [ ] `/admin/items` — the **Unit** column is filled for **all 12** rows, not just
      the 5 with thresholds. Check the previously-blank ones specifically:
      `AP-BG-00002` (Bags), `BP-LB-00004` (Rolls), `CG-PL-00006` (Pallets),
      `BR-LB-00008` (Rolls), `AV-BG-00010` (Bags), `BP-PL-00011` (Pallets),
      `CG-ST-00012` (Rolls).
- [ ] As `priya@pdg.local` on `/grower/submit`: `BP-PL-00011` and `CG-ST-00012`
      show "On hand (Pallets)" / "On hand (Rolls)" instead of a bare "On hand",
      and **Add order** pre-fills the same unit greyed out.

### P10.3 — Seed speed (the reason for the change)
Write-only loops now use `createMany` (one INSERT per table instead of one per
row). Rows that need a generated id back are still individual `create()` calls —
`createManyAndReturn` is not supported on the `sqlserver` provider — so
submissions stay one-by-one and their children are accumulated and bulk-inserted.

Statements sent to the DB dropped from **~556 to ~99**; the big ones were grower
details + ledger (208 → 2), vendor details + allocations (144 → 3) and the
mapping tables (41 → 3). Against a remote Azure SQL this is the difference
between ~500 and ~90 round trips.

- [ ] Time `npm run db:seed` against the remote DB — it should be several times
      faster than before, and the console still prints the same stage lines.
- [ ] Data is unchanged in shape: 12 items, 24 authorizations, 13 grower
      submissions / 104 details / 104 ledger rows, 12 vendor submissions /
      48 details / 96 allocations, 12 orders.
- [ ] Spot-check that the demo still tells its story: Brigo's last submission is
      4 days ago (reminder due), Agribar has orders closed today still visible on
      `/grower/on-order`, and the three item messages appear on `/admin/item-messages`
      (one of them targeted at Brigo only).

Remaining sequential inserts are the 25 submission rows (13 grower + 12 vendor).
They could be batched too, but matching the rows back would mean keying on
`(growerId, submissionDate)` — deliberately not done, to avoid depending on
datetime round-trip precision for a ~25 statement saving.

## Round 11 — packaging, receipt validation, nav & loading (August 2026)

**Run the migration first** — this round adds four tables, drops one, and
changes two Vendor columns:

```bash
npm run db:migrate:deploy   # applies 20260806090000_packaging_and_order_receipt
npm run db:seed             # refresh the demo data (wipes it)
```

The migration was replay-tested on the shadow DB (`inventory_demo_shadow`): all
9 migrations applied from empty, and `prisma migrate diff` against the datamodel
came back **empty**, i.e. the hand-written SQL reproduces `schema.prisma`
exactly. The seed was then run **twice** against that DB to confirm `clearAll()`
handles the new tables. Your `inventory_demo` is untouched until you run the
commands above.

⚠️ **Backfill caveat.** `Vendor.leadTime`/`paymentTerms` (free text) become
`leadTimeDays`/`paymentTermsDays` (int) by taking the **first run of digits**.
Verified: `"5 days"`→5, `"Net 30"`→30, `"Due on receipt"`/`"COD"`→NULL. But
`"2/10 Net 30"`→**2**, not 30. The demo seed has no such values; **check real
vendor data before running this on staging.**

### P11.1 — Vendor terms are numeric (`/admin/vendors`)
- [ ] Add/Edit vendor shows **Lead time (days)** and **Payment terms (days)** as
      number inputs that refuse negatives; the description reads "Net N days".
- [ ] Export includes both as numeric columns.

### P11.2 — Packaging chains (`/admin/packaging`, replaces Conversions)
- [ ] Sidebar → Tools → **Packaging**. The old Conversions page is gone.
- [ ] Seeded chains: `BG Bags → Boxes → Cases`, `BX Cases → Pallets`,
      `LB/ST Rolls → Cartons`. **PL has none on purpose** — pallets ship as-is.
- [ ] Add a chain: category + base unit + comma-separated levels ("Boxes, Cases").
      No quantities here — that is the whole point.
- [ ] Editing a chain that is **in use** refuses to change the number of levels
      (it would orphan vendor ratios). Deleting one in use is refused too.

### P11.3 — Vendor↔item mappings (`/admin/mappings`)
- [ ] Two tabs: **Grower authorizations** (moved from `/admin/authorizations`)
      and **Vendor items** (new). Each keeps its own search/filter/page in the URL
      — switch tabs, filter, and hit back; they don't interfere.
- [ ] **"Revoke" now reads "Deactivate"** on the grower tab; toast says
      "Authorization deactivated".
- [ ] Vendor tab → package icon opens the packaging dialog. The chain dropdown
      only offers chains whose base unit matches the item's unit; picking a
      mismatched one is impossible. Try `BP-PL-00011` (Pallets) — no chain offered.
- [ ] Enter the wrong number of quantities → refused with the level names listed.
- [ ] "Packaging: Not set" filter finds the PalletPool mappings.

### P11.4 — Order box maths (`/grower/submit`, james@agribar.local)
Seeded so all three `shipsInLevel` behaviours are visible:

| Item | Vendor | Ratios | Ships in |
|---|---|---|---|
| `AP-BG-00002` | PackRight | 10 bags/box, 5 boxes/case | whole **Boxes** |
| `AV-BG-00010` | PackRight | 20 bags/box, 4 boxes/case | whole **Cases** |
| `AP-BX-00001` | PackRight | 60 cases/pallet | base unit (**partials ok**) |

- [ ] Add an order for `AP-BG-00002`, qty **343** → the row shows
      `350 Bags · 35 Boxes · 7 Cases`. **You ordered 343 and receive 350.**
- [ ] Same quantity on `AP-BX-00001` (partials allowed) → delivered stays exactly
      what you typed; container counts are descriptive only.
- [ ] An item with no chain (`CG-PL-00006`, PalletPool) orders in plain units,
      exactly as before.

The resolver ([lib/packaging/resolve.ts](lib/packaging/resolve.ts)) is pure and was
checked against every worked example, including the cascade case: with 10/box and
**3** boxes/case, 343 bags shipping in whole cases → 12 cases = 36 boxes = **360**
bags. Rounding cascades from the already-rounded level below, never from the raw
quantity — computing each level independently would claim 35 boxes *and* 12 cases,
which cannot both be true.

### P11.5 — Receipt validation
- [ ] **Receive** on an open order now opens a dialog prefilled with the expected
      quantity — one tap in the normal case.
- [ ] Where rounding applied, the hint reads "You ordered 343 Bags; this vendor
      ships whole containers, so 350 is expected."
- [ ] Change the number → the reason dropdown (Short / Damaged / Over) is what
      gets stored. Leave it matching → no reason is stored.
- [ ] **Inventory is unaffected.** Receiving writes no ledger row: check
      `/grower/history` and the on-hand figures are unchanged by a receipt. Stock
      comes from the daily count only; adding receipts would double-count.

### P11.6 — Currently low (`/admin/low-inventory`)
- [ ] Two tabs: **Raised flags** (the old page, grower-raised, needs clearing) and
      **Currently low** (computed live, nothing to clear).
- [ ] Seeded data shows exactly two currently-low rows, and they demonstrate
      threshold precedence: **Agribar `AP-BX-00001` 29/80** (grower override) and
      **PDG `AP-BX-00001` 27/50** (global). The "Threshold" column says which.
- [ ] The **Flagged** column shows whether a grower also raised a flag — the two
      tabs are independent by design.

### P11.7 — Sidebar order + badges
- [ ] New order: Dashboard → **Action Items** → Master Data → Partners & Users →
      Tools → Settings.
- [ ] Low inventory and Item requests carry **amber** badges (work is owed).
      Item messages carries a **muted** badge — it is ambient status, not a queue,
      and colouring it would dilute the two that matter.
- [ ] Act on a flag or request → its badge drops on the next render
      (`revalidatePath`, no polling).

### P11.8 — Loading & error states
- [ ] Throttle the network (DevTools → Slow 3G) and click a sidebar item: the
      clicked item's icon becomes a **spinner** immediately (`useLinkStatus`), and
      a table skeleton fills the page.
- [ ] Note this replaces the whole segment, header included — every page awaits
      its capability check and queries at the top level, so there is no shell to
      hold still. Per-page `<Suspense>` around only the table is the follow-up if
      the flash bothers you.

### P11.9 — Load previous values (`/grower/submit`)
- [ ] The button is out of the sticky bar and now sits above the item list in its
      own panel with an explanatory line, as an `outline` button. Previously a
      `ghost` button competing with Save/Submit, which is why it was invisible.
- [ ] Still explicit, not auto-filled — deliberate, so nobody submits yesterday's
      numbers without looking.

### P11.10 — Consistency fix worth spot-checking
`previousQty` on the submit form now sums the **latest value per (item, location)**
instead of taking whichever ledger row was written last, matching the admin
"currently low" query. With the current seed each item sits in one location so the
numbers are unchanged — but if you add multi-location history, the two views now
agree. The same query is also bounded to 90 days; it previously pulled a grower's
entire ledger on every page load.

### P11.11 — Localized item-message notes (`/admin/item-messages`)

`ItemMessage.type` was already a translatable key, but `body` was free text shown
to everyone as authored — so a Spanish-preference grower got a localized *label*
followed by an English *note*. Notes now live per locale in
`ItemMessageTranslation` (migration `20260810090000_item_message_translations`).

**Translation happens on save, never on read.** Notes are written a handful of
times and displayed constantly; per-view translation would re-translate identical
text endlessly, add latency to the grower's page, and make an external API a hard
dependency of a screen used on a phone in a packing house. Seeded notes total
~180 characters, so any provider's free tier is irrelevant at this volume.

- [ ] The message dialog has a **Spanish note** field. Leave it blank → the note
      is machine-translated on save. Type into it → stored as-is and marked
      reviewed.
- [ ] The list has an **Español** column: `Reviewed` (someone checked it),
      `Auto` (raw machine output, amber — worth checking, since these notes drive
      behaviour like "clear inventory"), or `Missing`.
- [ ] Seeded state covers all three: `CG-ST-00012` and `CG-BX-00005` are
      **Reviewed**, `AV-BG-00010` is **Auto**.
- [ ] As **diago@brigo.local** (Spanish grower) on `/grower/submit`, the note under
      `CG-BX-00005` reads *"Demanda estacional alta — aumente las existencias…"*.
      As james@agribar.local it stays English.
- [ ] Delete a message → its translations cascade away.

**Provider is off by default.** `TRANSLATION_PROVIDER=local` (see `.env.example`)
is a no-op, so the demo runs with no credentials and growers simply fall back to
the authored note — same pattern as `EMAIL_PROVIDER`. To enable:

```bash
TRANSLATION_PROVIDER=azure
AZURE_TRANSLATOR_KEY=...
AZURE_TRANSLATOR_REGION=westeurope   # omit for a global resource
```

Chosen over Google Cloud Translation on stack-fit grounds — same subscription,
Key Vault and managed-identity story as the rest of the Azure deployment, and a
more generous free tier. **Confirm current free-tier limits before relying on
them**; both vendors change these. Note the quota is measured in *characters*,
not words.

Two deliberate behaviours worth knowing:
- A translator outage never blocks a save. `syncTranslations` runs **after** the
  message transaction commits, so the worst case is the note stays English.
- Re-saving a message whose Spanish note was hand-corrected does **not**
  re-translate and clobber it — only `isMachine` rows are refreshed.

## Round 12 — a quarter of demo history + week-over-week (August 2026)

No migration. Re-seed to pick it up:

```bash
npm run db:seed             # wipes and re-seeds; takes ~30s
```

### P12.1 — Seed scale
Grown from 3 growers / 3 vendors / 12 items / ~2 weeks to:

| | Count |
|---|---|
| Growers / vendors / items | 5 / 5 / 20 |
| Grower submissions | 221 |
| Submission details · ledger rows | 1,755 · 1,755 |
| Orders · pack lines | 68 · 132 |
| Vendor submissions · details · allocations | 65 · 286 · 585 |

- [ ] Ledger spans ~91 days (check `/admin/reports` — the 14-day chart is now a
      window onto real history rather than the whole dataset).
- [ ] Quantities move as smooth trend + weekly cycle + light noise. **No dramatic
      events are seeded** (per your call): no stockouts, no spikes, and receipts
      match what the pack maths predicted, so vendor discrepancy views start
      clean. Edit a receipt by hand to exercise the mismatch path.

### P12.2 — Cadence varies per grower
Each grower counts on different weekdays, which is what makes the reminder
scheduler demoable — Sunridge only counts Mondays, so it is always several days
stale.

- [ ] `/admin/growers` and the grower dashboards show: Agribar 65 submissions
      (weekdays), Verdeval 78 (Mon–Sat), Brigo 39 (Mon/Wed/Fri), PDG 26
      (Tue/Thu), Sunridge 13 (Mondays).

### P12.3 — Week-over-week badge (`/grower/submit`)
- [ ] Each item row shows a **+N / −N / 0** badge against its unit, green up, red
      down, muted for no change. Hover for "Change vs the same item a week ago".
- [ ] Nothing shows only when there is genuinely no count from a week back. A
      zero is displayed rather than hidden — "unchanged" is information, and
      hiding it would make it look identical to "no history".
- [ ] The dashboard's "biggest changes" list and these badges now share one
      implementation, so they cannot disagree.

**Two correctness fixes the quarter of data exposed** — both invisible at two
weeks of history:

1. **Noon vs midnight.** The week-ago cutoff was `startOfDay(today) − 7d`, but
   ledger rows are stamped at **noon**, so the count taken exactly seven days ago
   was excluded and the comparison silently reached back to day eight. Now
   `endOfDay(today − 7d)`.
2. **Weekly counters compared against themselves.** For a grower who counts once
   a week, the latest row *is* the week-ago row, so every item reported 0.
   `weekAgoPerItem` now skips each item's newest observation date before applying
   the cutoff. Verified: Sunridge went from all-zeros to real movement
   (`CG-BX-00005 −2`, `AV-BX-00009 +7`), while PDG still shows a genuine `0`.

### P12.4 — Seed performance at this size
- [ ] `npm run db:seed` completes in roughly 30s against a local DB.

Both grower and vendor submissions are now bulk-inserted and read back by
`(ownerId, submissionDate)` — at 221 + 65 rows the one-round-trip-each approach
that was fine for 13 no longer is. All large inserts go through
`createManyChunked` at 200 rows, keeping every statement under SQL Server's
2,100-parameter cap (1,755 ledger rows × 8 columns would be ~14,000).

### P12.5 — Reports are admin-only
- [ ] `VIEW_REPORTS` removed from `EDITOR_CAPS` ([lib/rbac.ts](lib/rbac.ts)).
      Sign in as **editor@demo.local** — no Reports entry in the sidebar, and
      `/admin/reports` is refused.

## Round 13 — branding, email polish, pagination (August 2026)

No migration, no re-seed needed.

### P13.1 — Brand palette
Primary is the brand green, converted from hex to `oklch` losslessly so the
values are exact: **#004C43** light, **#006B53** dark. Red **#E00700** is now
`--destructive` and is used for nothing else. The remaining style-guide accents
drive the charts (#4FA78B, #00B0BE, #F1C052, #F58C35, #BD7E82).

- [ ] Buttons, sidebar active state, focus rings and links all read as brand green
      in both themes; `/admin/reports` charts pick up the accent sequence.
- [ ] Delete buttons and low-inventory badges are still red and still look
      distinct from anything branded.

**Two deviations from the spec, both forced by contrast** — measured, not guessed:

| | | |
|---|---|---|
| `#006B53` as **text** on the dark background | 2.94:1 | ❌ fails AA |
| previous dark `--primary-foreground` on `#006B53` | 2.88:1 | ❌ fails AA |

`--primary` doubles as link colour (Tailwind's `text-primary`, baked into the
button and badge *link* variants — not fixable at call sites). So dark mode uses
a **lightened tint of the same hue**, and `--primary-foreground` flipped to
near-white. Final measurements, all passing AA:

```
LIGHT   fg on primary fill 9.67   primary as text 9.70   destructive text 4.89
DARK    fg on primary fill 6.78   primary as text 6.92   destructive text 6.55
```

If you'd rather have the exact `#006B53` in dark mode regardless, it's one line
in [globals.css](app/globals.css) — but links will be hard to read.

### P13.2 — Logo & login background
- [ ] Sidebar and login show the wordmark ([components/brand-logo.tsx](components/brand-logo.tsx) —
      one file to swap the asset).
- [ ] Login has the brand background with a scrim over it so the user cards stay
      readable.

Two conversions were needed, both generated into `public/`:

| Source | Issue | Output |
|---|---|---|
| `logo.webp` | WebP isn't rendered by Outlook and others **in email** | `logo-email.png` (360×195) |
| `login-bg.jpg` | 7001×4001, **1.6 MB** shipped to every visitor | `login-bg.webp` (2400w, **81 KB**) |

The originals are still in `public/` — safe to delete `login-bg.jpg` once you're
happy, it isn't referenced.

### P13.3 — Email branding
- [ ] Outbox previews show the logo above the heading, and the accent bar is
      brand green (`info`), soft green (`success`) or orange (`warning`).
- [ ] **Red is deliberately not an email accent.** An alarming header on a routine
      "submission received" trains people to ignore the colour.

Two constraints handled in [notification-email.tsx](lib/email/templates/notification-email.tsx):
- The logo uses an **absolute** URL built from `APP_URL`. A relative path resolves
  to nothing in an inbox — and nothing in the Outbox preview either, which renders
  stored HTML via `srcDoc`.
- Remote images are blocked by default in several clients, so the `alt` text is
  the brand name: a blocked image degrades to the wordmark, not an empty box.

⚠️ Set `APP_URL` to the real host before sending externally, or recipients get
`localhost` image links.

### P13.4 — Pagination on all six list pages
| Page | Was | Now |
|---|---|---|
| `/admin/requests` | paged | unchanged |
| `/admin/settings/outbox` | `take: 100`, no pager | paged, 20/page |
| `/grower/history` | `take: 30`, no pager | paged, 10/page |
| `/vendor/history` | `take: 30`, no pager | paged, 10/page |
| `/grower/requests` | **unbounded** | paged, 10/page |
| `/grower/on-order` | **unbounded** | paged, 15/page |

- [ ] As **james@agribar.local**, `/grower/history` pages through all **65**
      submissions. It previously showed 30 and silently hid the rest — the quarter
      of seed data made that a live bug, not a theoretical one.
- [ ] Record count and page indicator appear on every one of the six.

The pager was extracted from `DataTable` into [components/pager.tsx](components/pager.tsx)
so the card-based pages share one implementation rather than copying it.

### P13.5 — Outbox preview toggle
- [ ] Previews are **collapsed by default**, showing a two-line plaintext snippet.
      "Show preview" mounts the iframe for that row only.
- [ ] Open several, page forward and back — no leftover iframes.

This was the heaviest page in the app: it rendered a full HTML document in an
iframe for **every** row, up to 100 of them. Now at most as many as you open.

## Round 8 — locations & countries (August 2026)

> **Requires migrations.** This round changes the *grain* of grower submissions,
> so `db:push` is not enough — the data has to be moved.
>
> ```bash
> npm run db:migrate:deploy   # applies the three new migrations in order
> npm run db:seed             # reseed with multi-location demo data
> ```
>
> On a database built with `db:push` (no `_prisma_migrations` rows) `deploy`
> will try to replay from `0_init` and fail on existing tables. Use
> `npm run db:reset` there instead — it force-pushes the schema and reseeds,
> which is the right move for a demo DB with no data worth keeping.
>
> The three migrations were replayed on a scratch database against
> representative pre-migration data (submissions spanning two locations, rows
> with `locationId` NULL, an empty draft, vendor country strings both in and out
> of the lookup) and all transformations verified. What follows is UI checking.

### What changed at the schema level
| Change | Notes |
|---|---|
| `CountryOfOrigin` → `Country` | `sp_rename`, so item FKs and rows survive. New `isSelectable` flag hides `N/A` from the new pickers |
| `Location.countryId` | new nullable FK |
| `Vendor.country` → `Vendor.countryId` | free text became an FK, backfilled by name match; unmatched names were **inserted** into `Country`, not dropped |
| `Vendor.locationId` | plain FK — vendors get one operating site, not a join table |
| `VendorCountry` | new join: countries a vendor can supply **to** |
| `GrowerLocation` | new join: sites a grower counts at |
| `GrowerSubmission.locationId` | **required** — the grain is now grower × location × day |
| `GrowerSubmissionDetail` / `InventoryLedger` `.locationId` | nullable → **required** |
| `@@unique([submissionId, itemId])` | was only enforced by a `findFirst` in the action |

### R8.1 — Countries (admin@demo.local, `/admin/countries`)
- [ ] Page is titled **Countries** and lists **Items / Locations / Vendor supply
      lists** counts per row.
- [ ] `N/A` shows an **origin only** marker (its `isSelectable` is off).
- [ ] Add/Edit has a **Selectable as a real country** dropdown; the item origin
      dropdown on `/admin/items` still offers `N/A`, but the location, vendor
      and supply-to pickers do **not**.
- [ ] Deleting a country in use names *which* of the four uses is blocking it.
- [ ] Existing items kept their country of origin through the rename.

### R8.2 — Locations & vendors
- [ ] `/admin/locations`: rows show a **Country** column; add/edit has a country
      dropdown; the Country filter in the toolbar works.
- [ ] `/admin/vendors`: rows show **Country**, **Location** and a **Supplies to**
      count. Add/Edit has a single-select Country and Location, plus a
      **Supplies to (countries)** multi-select.
- [ ] Removing a supply-to country and saving drops it from the count
      (deactivated, kept for history — same as item mappings).
- [ ] **Export vendors** (.xlsx) has Country, Location and Supplies to columns.

### R8.3 — Grower ↔ location mapping (`/admin/growers`)
- [ ] Each grower row shows a **Locations** column. Seeded: Agribar 2, Brigo 1,
      PDG 3, Verdeval 1, Sunridge 2.
- [ ] A grower with none shows a red **None — cannot submit**.
- [ ] Add/Edit has a **Locations (this grower counts inventory at)** multi-select
      that pre-fills and saves.

### R8.4 — Per-location submissions (the main one)
As **priya@pdg.local** (3 locations), `/grower/submit`:
- [ ] A **location picker** sits above the progress bar. The URL carries
      `?location=<id>`; reload and back both land on the same site.
- [ ] Switching site **clears typed values** and reloads that site's prefill —
      `prev` values are that location's last count, not another's.
- [ ] Progress reads *this location's* submitted count, not the grower's day.
- [ ] Enter counts at site A → **Submit**. Switch to site B → it is still
      unsubmitted, with its own empty/previous numbers. **This is the behaviour
      the whole schema change exists for.**
- [ ] Save a **draft** at site A, then **Submit** at site B. Site A stays a
      draft and its numbers do **not** reach the ledger. (Before this round the
      ledger rebuild would have promoted them.)
- [ ] As **diago@brigo.local** (1 location) the picker is **hidden** and the
      location name shows in the progress row instead.
- [ ] A grower with no locations mapped sees the "ask an admin" message rather
      than a broken form.

### R8.5 — Downstream reads
- [ ] `/grower/history`: one card per site per day, each naming its location.
- [ ] `/grower` dashboard: progress is summed **across** locations and reads
      "across N locations" for multi-site growers; the denominator is
      authorized items × mapped locations.
- [ ] `/admin` **Recent submissions**: rows read `Grower · Location`.
- [ ] `/admin/low-inventory/current` still agrees with the grower's own view —
      both sum on-hand across a grower's locations.
- [ ] `/admin/reports` trend chart still renders.
- [ ] **Settings → Schedulers → Run reminder check now**: a grower is overdue if
      **any** of their locations is. Submitting at one site no longer silences
      reminders for the others — check with a multi-site grower.
- [ ] Submission emails: one per location, subject and body name the site.
      A three-site grower submitting all three gets three mails.

### R8.6 — Vendor "load previous"
As **sam@packright.local**, `/vendor/submit`:
- [ ] A **Load previous values** bar appears above the item list (only when
      there is history), matching the grower form.
- [ ] Clicking it fills every quantity with the last reported value and leaves
      per-grower allocations alone.
- [ ] The previous-value lookup is now bounded to 90 days — it used to read the
      vendor's entire submission history on every page load.

## Quality gates
- [ ] `npm run typecheck` clean · `npm run lint` clean · `npm run build` clean.
