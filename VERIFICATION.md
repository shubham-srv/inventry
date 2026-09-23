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
- [ ] **Reports** (`/admin/reports`): four tabs — Grower stock, Orders, Vendor stock, Power BI. Lands on Grower stock; the Power BI tab has the placeholder panels + a live trend chart from the ledger.
- [ ] **Settings → Thresholds**: add/edit a threshold; grower-scoped overrides global (verify it changes the "Below threshold" highlight on that grower's submit page).
- [ ] **Settings → Schedulers**: edit the global cadence / add a per-grower schedule; click **Run reminder check now** → toast with counts; overdue growers get a reminder in the **Outbox** (Brigo/PDG are seeded overdue). Re-running same day does not duplicate.
- [ ] **Settings → Audit logs**: filter by action/entity; confirm your earlier CRUD + exports + reminder runs are recorded.
- [ ] **Settings → Outbox**: filter mocked emails by type/status.
- [ ] **Item Requests** (`/admin/requests`): review a grower's request — change status + notes; the grower sees the updated status + admin note.
- [ ] `npm run reminders` from a terminal runs the same check and writes to the Outbox.

## P6 — Azure integration code (isolated, not active locally)
> **Superseded by Round 15.** `integration/` no longer exists: Entra and magic-link
> sign-in are wired into the app, and the Azure Functions timer is gone in favour of
> Container Apps jobs. Only the first line below still applies. See the Round 15
> section at the end of this file.

- [ ] Cron endpoint works: `curl -X POST -H "x-cron-secret: dev-only-cron-secret" http://localhost:3000/api/cron/reminders` returns JSON.
- [ ] ~~`integration/` contains Entra auth routes, the Azure Timer Function, and `INTEGRATION.md`~~
- [ ] ~~`lib/email/acs/sender.ts` is the ACS path selected by `EMAIL_PROVIDER=acs`~~ — now `lib/email/acs/transport.ts`, driven by `lib/email/dispatch.ts`.
- [ ] ~~Nothing in `integration/` is imported by the running app~~

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
      (open orders only) to edit it. Seeded ETAs come from each vendor's own
      quoted lead time, so roughly half the open orders are already past theirs
      (see R13) — expect a mix of future and past dates, not all future.
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
| Vendor submissions · details · allocations | 61 · 257 · 545 |

- [ ] Ledger spans ~91 days (check `/admin/reports` — the 14-day chart is now a
      window onto real history rather than the whole dataset).
- [ ] Quantities move as smooth trend + weekly cycle + light noise — no stockouts
      and no spikes. **Order receipts and vendor cadence are no longer uniform**,
      though: since R13 a minority of receipts are short/damaged/over, roughly
      half the open orders are past their ETA, and the five vendors report on
      different schedules. That is deliberate — the admin Orders and Vendor stock
      reports exist to surface exactly those, and a uniform seed left their
      headline columns empty.

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
- [ ] Clicking it fills every quantity with the last reported value.
      (Superseded by R14.1 — it now fills the per-grower allocations too.)
- [ ] The previous-value lookup is now bounded to 90 days — it used to read the
      vendor's entire submission history on every page load.

## Round 9 — region cleanup, location gating, scheduler honesty (August 2026)

> One migration, `20260817090000_drop_region_from_item_vendor_and_reminder_frequency`.
> `npm run db:migrate:deploy` then `npm run db:seed` (or `npm run db:reset` on a
> pushed database — see the Round 8 note).
>
> **This migration deletes data on purpose.** `Item.regionId` and
> `Vendor.regionId` go away, and those values were themselves backfilled from
> free text in `20260731090000`. Vendor region stays derivable through the
> vendor's location; item region is simply gone. Back up first if anyone still
> wants those columns.
>
> Replayed on a scratch database, seeded, and `prisma migrate dev` afterwards
> reports **"Already in sync"** — the hand-written SQL reproduces schema.prisma.

### R9.1 — Region removed from items
- [ ] `/admin/items`: no **Region** column, no Region filter, and the Add/Edit
      dialog has no Region field. Country of origin is still there and still required.
- [ ] Creating and editing an item works without ever supplying a region
      (it used to be a required field that would block the save).
- [ ] **Export items** (.xlsx) has no Region column; Country of origin remains.

### R9.2 — Vendor region comes from its location
- [ ] `/admin/vendors`: the Add/Edit dialog has **no Region field**. It keeps
      **Country (headquarters)**, which is deliberate — a vendor can be based in
      one country and ship from a facility in another.
- [ ] The **Region** column still shows a value, read through the vendor's
      location. A vendor with no location shows "—".
- [ ] The **Region** filter still works, matching through the location. Vendors
      with no location correctly drop out of it.
- [ ] **Export vendors** (.xlsx) Region column matches the on-screen value.
- [ ] Seeded check: PackRight=West, PalletPool=Central, LabelWorks=East,
      BoxCraft=Central, StickerPro=West — all resolved via their sites.

### R9.3 — Location types gate which side can use a site
Types live in `LOCATION_TYPES` in [lib/constants.ts](lib/constants.ts):

| Side | Types |
|---|---|
| Grower only | Grower Field, Packing House, Cold Storage |
| Vendor only | Manufacturing Plant, Distribution Center, 3PL Facility |
| Either | Warehouse, Cross-dock |

> **The list is a starting point, not a specification.** Edit that one array to
> add, rename or re-side a type — the pickers, the filters and the server-side
> checks all read from it.

- [ ] `/admin/locations`: **Type** is now required, and each option is labelled
      with the side it serves, e.g. "Packing House (grower)", "Warehouse (grower or vendor)".
- [ ] `/admin/growers` → Edit → **Locations**: offers only grower-side and shared
      sites. "PackRight Plant" and "Gulf Distribution Center" must NOT appear.
- [ ] `/admin/vendors` → Edit → **Location**: offers only vendor-side and shared
      sites. "Salinas Packing House" must NOT appear.
- [ ] A location with **no type** appears in neither picker.
- [ ] The gate is enforced server-side too, not just in the dropdown — posting a
      grower-side location id on the vendor form stores null rather than saving it
      ([lib/actions/partners.ts](lib/actions/partners.ts) `validVendorLocationId`
      and `syncGrowerLocations`).

### R9.4 — Scheduler: dead field removed, real tolerance shown
- [ ] `/admin/settings/schedulers`: the **Frequency** column and the
      "Reminder frequency" form field are **gone**. They were never read — the
      re-nag interval has always been "at most one per grower per day", enforced
      by a NotificationLog check, so Daily and Weekly behaved identically.
- [ ] The table's **Overdue after** column shows the tolerance actually in force:
      the seeded Global row reads **3 day(s)** (AfterNDays/3) and the PDG row
      reads **7 day(s)** (Weekly). Previously a Weekly row displayed its unused
      `thresholdDays`, which could say something entirely different.
- [ ] The "Remind after N days" field now says it applies only to **AfterNDays**.
      Set a grower to Weekly with N=1 and confirm they are still only chased
      after 7 days.
- [ ] **Run reminder check now** still works.

## Round 10 — reactive dialog fields (August 2026)

> **No migration.** UI and server-action changes only — `git pull` and restart
> the dev server. One behaviour change is not cosmetic, though: the two mapping
> dialogs now REMOVE as well as add. See R10.2.

All five changes ride on one addition to
[EntityFormDialog](components/crud/entity-form-dialog.tsx): a field can now
react to another field via `dependsOn`, with three effects — **filter** options
(existing, now working for multiselects too), **preset** the value
(`presetFrom`), and **derive** a read-only display (`derive`).

Two rules worth knowing while testing:
- An empty **select** parent offers nothing ("pick an item first"). An empty
  **multiselect** parent offers everything — nothing ticked means "not
  filtering", not "exclude all".
- Filtered children are **pruned**, not cleared. Removing one category drops
  that category's items from the selection and leaves the rest alone.

### R10.1 — Vendor items filtered by material category (`/admin/vendors`)
- [ ] Edit a vendor. With **no** categories ticked, the Items list shows every
      active item.
- [ ] Tick **BX** only — the Items list narrows to BX items. Tick **BG** as well
      and BG items join it.
- [ ] Tick BX + BG, select one item from each, then untick BX: the BX item drops
      out of the selection and the BG one stays. (This is the pruning rule — it
      should not wipe the whole box.)
- [ ] Save and reopen: the surviving selection persisted.

### R10.2 — Mapping dialogs pre-tick and reconcile ⚠️
**This changes what the dialog does.** It used to only add; unticking was
impossible and removal happened via the per-row Deactivate button. It now edits
the whole set, so **an unticked box is a removal instruction**.

`/admin/mappings/growers` → **Authorize items**:
- [ ] Before a grower is chosen the Items list is empty.
- [ ] Choosing **Agribar** ticks its 8 current items. Switching to **Brigo**
      replaces them with Brigo's 8 — no leftovers from Agribar.
- [ ] Add one item, save → toast reads "1 added". The row list shows it Active.
- [ ] Reopen, untick an item, save → toast reads "1 removed". The row list shows
      that row as **Inactive**, not gone — removal is soft, so submissions and
      ledger rows that reference it still resolve.
- [ ] Save with nothing changed → "No changes".
- [ ] Unticking everything is allowed (it deactivates the lot) — it used to fail
      validation with "At least one item is required".
- [ ] The preset covers a grower's **whole** set, not just the visible page.
      Page to the last page of the table, open the dialog, pick a grower with
      more items than one page holds, and confirm all of them are ticked.

`/admin/mappings/vendors` → **Map items** — the same checks. Additionally:
- [ ] Untick a mapped item that has packaging configured, save, then re-tick it:
      the packaging chain and ratios are still there (the row was deactivated,
      not deleted).

- [ ] The equivalent multiselects on `/admin/growers` and `/admin/vendors` still
      work and agree with the mapping pages — both routes reconcile the same way.

### R10.3 — Threshold unit inherited from the item
- [ ] `/admin/settings/thresholds` → Add: the **Unit** field is a grey read-only
      box reading "Inherited from the item" until an item is chosen, then shows
      that item's unit.
- [ ] Changing the item changes the displayed unit.
- [ ] Saving stores the item's unit — the table's Threshold column shows e.g.
      "50 Cases" matching the item's own unit. It is no longer possible to set a
      threshold in Cases for an item counted in Bags, which previously compared
      two different quantities silently.
- [ ] Editing an existing threshold keeps the right unit.

### R10.4 — Item message growers filtered by item
- [ ] `/admin/item-messages` → Add: before an item is chosen the Growers list is
      empty.
- [ ] Choose an item — only growers **authorized for that item** are offered.
      Cross-check against `/admin/mappings/growers` filtered to that item.
- [ ] Change the item: growers who are not authorized for the new item are
      pruned from the selection.
- [ ] Set audience **Selected**, pick growers, save, and confirm the message
      appears on those growers' submit pages under that item — and only there.

## Round 11 — vendor locations, submit search & sort (August 2026)

> **Requires a migration**, `20260820090000_vendor_locations`.
>
> ```bash
> npm run db:migrate:deploy   # creates VendorLocation, carries the old column over
> npm run db:seed             # reseed so two vendors have multiple sites
> ```
>
> `Vendor.locationId` is **dropped**. The value is not lost — each vendor's
> single site becomes its first `VendorLocation` row, `createdBy`/`updatedBy`
> included — but anything reading `Vendor.locationId` directly must be updated.
>
> Replayed on a scratch database against pre-migration fixtures (vendors with a
> vendor-side site, an untyped site, and `locationId` NULL): 3 of 4 vendors got a
> row, the NULL one correctly got none, the column is gone, and
> `prisma migrate diff` reports no drift afterwards.

### What changed at the schema level
| Change | Notes |
|---|---|
| `VendorLocation` | new join table, mirroring `GrowerLocation` — unique `(vendorId, locationId)`, soft `isActive` |
| `Vendor.locationId` | **dropped**, backfilled into the table above |
| Reporting grain | **unchanged** — a `VendorSubmission` is still one per vendor per day, *not* per site |

### R11.1 — Vendor sites (`/admin/vendors`, admin@demo.local)
- [ ] The **Location** column is now **Locations** and lists every mapped site,
      comma-separated. Seeded: PackRight 2 (PackRight Plant, Central Warehouse),
      StickerPro 2 (Nogales 3PL, Gulf Distribution Center), the rest 1.
- [ ] The **Region** column shows every distinct region those sites are in —
      PackRight reads `West, Central` and StickerPro `West, East`. A vendor with
      two sites in the *same* region shows that region **once**, not twice.
- [ ] A vendor with no sites shows `—` in both columns (and still saves fine —
      unlike growers, a vendor with no location is not broken).
- [ ] Add/Edit now has a **Locations (this vendor operates from)** multi-select
      that pre-fills with the current sites and saves.
- [ ] Only vendor-side and shared types are offered. **"Salinas Packing House"
      must NOT appear.** (Same gate as before, still re-checked server-side in
      `syncVendorLocations` — posting a grower-side id drops it rather than
      saving it.)
- [ ] Unticking a site and saving removes it from the row. Re-tick it and save:
      it comes back (the row was deactivated, not deleted — same as item mappings).
- [ ] The **Region** filter now matches a vendor if **any** of its sites is in
      that region. Filter to `Central` → PackRight appears even though its other
      site is in the West. Vendors with no sites drop out of every region.
- [ ] **Export vendors** (.xlsx): `Locations` and `Region` columns match what is
      on screen, comma-separated and deduped the same way.

### R11.2 — Submit list: search & sort (both roles)
Same control on `/grower/submit` (james@agribar.local) and `/vendor/submit`
(sam@packright.local) — it sits in the sticky bar, so it stays reachable while
scrolling a long list.

- [ ] The list still **opens sorted by item ID** — unchanged from before.
- [ ] **Name (A–Z)** re-sorts alphabetically by item name.
- [ ] **Quantity (high to low)** / **(low to high)** sort on the *last known*
      count — today's saved value, else the previous one. Items that have never
      been counted sink to the bottom in **both** directions.
- [ ] ⚠️ **Type a number into a box while a quantity sort is active — the row
      must NOT jump.** Sorting deliberately ignores what is currently typed; a
      hint under the control says so.
- [ ] Search filters as you type on **item name, item ID, commodity and
      category**. "box" finds items by category, not just by name.
- [ ] The **✕** in the search box clears it; a "Showing 3 of 12" count appears
      only while filtering.
- [ ] No matches shows a message, not an empty page.

### R11.3 — Searching must never lose a count ⚠️
The one thing worth being deliberate about: filtering is a **view**, not a
filter on what gets submitted.

- [ ] Enter quantities on 3 items. Search for something that hides them all.
      The progress bar and the `n / total` counter **still count all 3**, and a
      note reads "3 item(s) you entered are hidden by the search — all of them
      are still included when you submit."
- [ ] Submit while the search is still active → all 3 are saved. Clear the
      search and confirm all 3 show as submitted.
- [ ] Grower page: **Save draft** while filtered behaves the same way.
- [ ] **Load previous values** fills every row, including hidden ones.
- [ ] Switching location on the grower page still clears typed values (unchanged)
      — the search box and sort persist, which is intended.

### R11.4 — Vendor form no longer submits on Enter (behaviour change)
The vendor report used to wrap every input, so **Enter** in a quantity box
submitted it. The form now holds only the payload and the button reaches it by
`form=` attribute — the same arrangement the grower form has always had. This
was needed so the new search box could not fire off a half-finished report.

- [ ] Press **Enter** in a quantity box, an allocation box, or the search box on
      `/vendor/submit`: nothing submits.
- [ ] The **Submit report** button still works, is still disabled until at least
      one quantity is entered, and allocations still post with it.

## Round 12 — no more units, packaging is descriptive, inventory snapshot (August 2026)

> **Requires two migrations.**
>
> ```bash
> npm run db:migrate:deploy   # 20260821090000_drop_unit_of_measure
>                             # 20260821090100_packaging_informational
> npm run db:seed
> ```
>
> Both were replayed on a scratch database against pre-migration fixtures (an
> item counted in "Rolls" inside a category named "Stickers"; an order of 343
> rounded up to an expected 360 and received at 360). Every dropped column is
> gone, every quantity survived byte-for-byte, old pack lines kept the level-0
> figure recorded at the time, and `prisma migrate diff` reports no drift. The
> seed was then run **twice** in a row against a populated database.

### ⚠️ Read this before testing: quantities are RELABELLED, not converted
There is no unit of measure any more. A quantity is counted in the item's
**material category** — an item in a category named "Boxes" is counted in boxes.
Where a category's name differs from the unit its items used to carry, the label
on screen changes. On the demo seed:

| Code | Category name | Used to read | Now reads |
|---|---|---|---|
| `BX` | Boxes | Cases | **Boxes** |
| `LB` | Labels | Rolls | **Labels** |
| `ST` | Stickers | Rolls | **Stickers** |
| `BG` | Bags | Bags | Bags ✓ |
| `PL` | Pallets | Pallets | Pallets ✓ |

**The numbers are untouched and always were right.** Only the word beside them
changes. This is expected — do not raise it as a bug.

### What changed at the schema level
| Change | Notes |
|---|---|
| `Item.unitOfMeasure` | **dropped** — the only one anybody ever authored |
| `GrowerSubmissionDetail` / `VendorSubmissionDetail` / `Order` / `ItemThreshold` `.unitOfMeasure` | **dropped** — all four were copies of the item's unit, written from it every time |
| `PackagingChain.baseUnit` | **dropped** — a chain already belongs to a material category; this was a second hand-typed label for the same thing |
| `Order.expectedQuantity` | **dropped** — with no rounding it always equalled `quantity` |
| `ItemVendor.shipsInLevel` | **dropped** — existed only to pick the rounding level |
| `Order.receivedQuantity` / `receiptNote` | **kept** — now compared against what was ordered |
| `OrderPackLine` | **kept** — now purely descriptive; level 0 equals `Order.quantity` |

### R12.1 — Units are gone (admin@demo.local)
- [ ] `/admin/items`: **no Unit column and no Unit field** in add/edit. Creating an
      item still works with one fewer required field.
- [ ] `/admin/settings/thresholds`: the read-only field reads **"Counted in"** and
      shows the item's category; the list shows e.g. `29 Boxes`.
- [ ] `/admin/export?entity=items` (.xlsx): one **Category** column, **no** "Unit of
      measure" column.
- [ ] `/admin/low-inventory/current`: still the same rows, now labelled with the
      category.
- [ ] `/admin/packaging`: the add/edit dialog has **no Base unit field**. Each row's
      first badge is the category name. Search still works (it now matches the
      chain name or its category).
- [ ] Try to add a level named exactly the category ("Boxes" on a BX chain) → refused.
- [ ] `/admin/mappings/vendors`: the chain dropdown offers **every chain in the
      item's category**, no longer narrowed by a unit. The item column's sub-line
      shows the category.

### R12.2 — Grower & vendor views
- [ ] `/grower/submit` (james@agribar.local): the quantity label reads
      **`On hand (Boxes)`** for `AP-BX-00001`. The week-change badge reads
      e.g. `+5 Boxes`.
- [ ] ⚠️ The category appears **once** in the meta line and once on the quantity
      label — it must not be repeated a third time after `prev:`.
- [ ] Add-order dialog: quantity label reads **`Quantity (Boxes)`**; the separate
      read-only Unit box is gone.
- [ ] `/vendor/submit` (sam@packright.local): quantity label carries the category;
      the greyed-out Unit box beside it is gone. Submitting still works.
- [ ] `/grower/history`, `/vendor/history`, `/grower/on-order`: quantities carry the
      category, no blanks.
- [ ] Order-placed email in `/admin/settings/outbox`: the quantity line reads e.g.
      `111 Boxes`.
- [ ] Spanish (Brigo, diago@brigo.local): the receipt dialog reads
      **"Cantidad recibida (…)"** and the hint mentions *lo que pediste*.

### R12.3 — Packaging no longer changes a quantity ⚠️ (the main one)
- [ ] Order `AP-BG-00002` from PackRight, qty **343** → the order row reads
      **`343 Bags · 35 Boxes · 7 Cases`**. **NOT 350.** Before this round it
      inflated the count to fill whole boxes.
- [ ] Open **Receive** on it → the quantity is prefilled with **343**, and the
      "this vendor ships whole containers, so 350 is expected" hint is **gone**.
- [ ] Confirm at 343 → no receipt note is stored. Change it to 340 → the
      Short/Damaged/Over reason is stored. A mismatch now means a real short
      delivery, not a packaging artefact.
- [ ] Receiving still writes **no ledger row** — on-hand on `/grower/submit` and
      `/grower/history` is unchanged by it.
- [ ] `/admin/mappings/vendors` packaging dialog has **no "Ships in" select**;
      saving ratios still works, and the row still shows the ×ratio chain.
- [ ] `CG-PL-00006` (pallets, no chain) still orders in plain units with no pack
      summary.

### R12.4 — Reports is now two tabs
> **Superseded by R13.1** — four tabs now, `/admin/reports` lands on Grower stock,
> and the sidebar links to the index route. Skip this section; run R13.1 instead.
- [ ] `/admin/reports` redirects to `/admin/reports/power-bi`; the trend chart and
      the Power BI placeholder cards are exactly as before.
- [ ] ⚠️ **Exactly one tab is highlighted on each route** — check both. (A tab
      living at `/admin/reports` itself would light up on both, which is why they
      are sibling paths.)
- [ ] The sidebar **Reports** link goes to the Power BI tab.

### R12.5 — Inventory snapshot (`/admin/reports/inventory`)
> **Moved by R13.1** to `/admin/reports/grower-stock` and relabelled "Grower
> stock". Every check below still applies — read the new URL throughout.
- [ ] Rows are **grower × item**, on-hand summed across that grower's locations.
      Cross-check one row against `/admin/low-inventory/current` — the two must
      agree, they share the same latest-per-location maths.
- [ ] ⚠️ Pairs a grower is authorized for but has **never counted** appear, marked
      **Uncounted** with an em-dash under Last counted. Verify by authorizing a new
      item for a grower on `/admin/items` and reloading.
- [ ] Each of the five filters (grower, location, commodity, category, stock)
      narrows independently, survives paging, and resets to page 1 when changed.
- [ ] **Location filter**: pick a site → on-hand is that site's only, and growers
      who do not count there disappear entirely. An item counted only at another
      site correctly reads Uncounted here.
- [ ] **Stock filter**: the four counts (Uncounted + Zero + Below threshold + OK)
      **add up to the unfiltered total**.
- [ ] Page 2 differs from page 1 and the total is stable across pages.
- [ ] **Export** honours the filters currently on screen and its row count matches
      the on-screen total. On-hand is **blank**, not 0, for uncounted pairs.
- [ ] `/admin/export?entity=full` does **not** contain an Inventory snapshot sheet.

### R12.6 — Access ⚠️
- [ ] As **editor@demo.local**: no Reports link in the sidebar (it used to show and
      then bounce), 403 on `/admin/reports/grower-stock`, **and 403 on
      `/admin/export?entity=inventory-snapshot`**. That last one was a real hole —
      the export route fell back to `MANAGE_MASTER_DATA`, which an Editor has.
- [ ] As a grower or vendor: 403 on both.

### R12.7 — Seed re-runnability (fixed in passing)
`clearAll()` deleted `Country` before `Location` and `Vendor`, both of which point
at it, and never deleted `VendorLocation` at all. A second `npm run db:seed`
against a populated database therefore always failed on a FK constraint. Only
`db:reset` (which force-resets first) avoided it.
- [ ] `npm run db:seed` twice in a row succeeds.

### Superseded by this round
These earlier sections are now wrong; kept for history rather than rewritten:
- **P11.2–P11.5** (lines ~494-547) — base-unit gating, the `shipsInLevel` table, and
  especially **"You ordered 343 and receive 350"**, which is now precisely what must
  *not* happen.
- **Round 9 "item unit"** (~344-367) and **P10.2 "Every item has a unit"** (~426-438).
- **R10.3 "Threshold unit inherited from the item"** (~1035).
- **P12.5 reports** (~705) — the page is now two tabs.

## Round 13 — admin report tabs: Orders + Vendor stock (August 2026)

> **No migration. Re-seed required:** `npm run db:seed`.
>
> The seed was enriched on purpose (see R13.5). Without it three of the four new
> headline columns render one repeated value or an empty set, because the old
> seed had zero receipt discrepancies, every open ETA in the future, 100% of
> vendor stock allocated, and one shared reporting schedule for all five vendors.

`/admin/reports` now has four tabs. Two of them are new surfaces entirely —
before this round there was **no admin view of orders or of vendor submissions
anywhere in the app**; both were visible only inside the grower/vendor portals.

### ⚠️ The three reports do not reconcile with each other
Read this before checking numbers across tabs:

- **Receiving an order writes no ledger row.** Deliberate, and verified back in
  R11 — on-hand comes from the daily count, so adding a receipt would double it.
  A Received order for 343 does **not** move Grower stock by 343.
- **A vendor allocation is an intention.** Earmarking 100 for Agribar transfers
  nothing and touches no ledger.
- **The three are keyed differently** (grower×item, order, vendor×item), so no
  row-level cross-check between any two of them is even possible.

### R13.1 — Tabs
- [ ] Four tabs, in order: **Grower stock · Orders · Vendor stock · Power BI**.
- [ ] `/admin/reports` redirects to **Grower stock**.
- [ ] ⚠️ **Exactly one tab highlighted on each of the four routes** — check all
      four, not a sample.
- [ ] ⚠️ The sidebar **Reports** entry stays highlighted on **all four** routes.
      It did not before: nav pointed at a leaf and the sidebar matches on
      `startsWith`, so it went dark on every tab but Power BI.
- [ ] Grower stock is the old Inventory snapshot, unchanged — same rows, same
      five filters, same export. Its URL moved to `/admin/reports/grower-stock`;
      the export entity key is still `inventory-snapshot` (it is written to
      `AuditLog.entityType`, so renaming it would orphan existing audit rows).

### R13.2 — Orders (`/admin/reports/orders`)
- [ ] Unfiltered row count is **68**, and Open 10 + Received 57 + Cancelled 1
      sums to it.
- [ ] ⚠️ **Both** an overdue open order ("N days overdue", red) and a not-yet-due
      one ("Due in Nd") are present. Seeded: 5 of each.
- [ ] ⚠️ A **Cancelled** order shows `—` under Lead time, **not** a computed
      delivery. Its `closedAt` is set — it is the cancellation date, not a
      delivery — and treating it as one is the easiest bug here to ship.
- [ ] ⚠️ At least one Received order shows a variance **with no Reason**. The
      reason is optional in the receive dialog, so a report that detects
      discrepancies via `receiptNote IS NOT NULL` would miss it; this one derives
      them from `receivedQuantity <> quantity`. Seeded: 4 such rows.
- [ ] Short, Damaged and Over each appear at least once under Reason.
- [ ] Lead time reads "4d vs 5d SLA" and the SLA differs between vendors.
- [ ] An order with its ETA cleared (edit one on `/grower/submit`) shows `—`
      under Delivery, **not** "on time".
- [ ] Note the `Delivery` and `Receipt` filter counts do **not** sum to the total
      — by design. `Delivery` says nothing about Cancelled orders and `Receipt`
      covers Received only. Only the `Status` counts add up.
- [ ] Filters narrow independently, survive paging, reset to page 1 on change.
      Page 2 differs from page 1; the total is stable across pages.

### R13.3 — Vendor stock (`/admin/reports/vendor-stock`)
- [ ] **22 rows** unfiltered — one per active vendor↔item mapping, regardless of
      whether anything has been reported against it.
- [ ] ⚠️ All four statuses are represented, and their counts **add up to 22**.
      Seeded: Fresh 12 · Ageing 5 · Stale 4 · Never reported 1.
- [ ] ⚠️ **StickerPro shows Fresh, Stale *and* Never reported on different items
      of the same vendor.** This is what proves the report is keyed on
      (vendor, item) rather than just vendor.
- [ ] ⚠️ A **Never reported** row shows `—` for Reported, Allocated, Unallocated
      **and** Growers — none of them `0`. "Nothing to allocate" and "nothing
      allocated" must not render alike.
- [ ] At least one row has **Unallocated > 0** (amber). Cross-check it by hand
      against that vendor's `/vendor/history`.
- [ ] The **Held for** filter narrows to items that grower has a share of on the
      vendor's *latest* report — never-reported rows correctly disappear, and so
      do allocations that existed historically but not now. The empty-state
      message says so.

### R13.4 — Exports and access
- [ ] Both new tabs export; each honours the filters on screen and the row count
      matches the on-screen total.
- [ ] Blanks are **blank, not 0**, for unrecorded receipts and never-reported
      stock.
- [ ] `/admin/export?entity=full` contains **neither** an Orders nor a Vendor
      stock sheet (computed reports are registered separately from master data).
- [ ] ⚠️ As **editor@demo.local**: no Reports link, 403 on both new pages, **and
      403 on `/admin/export?entity=orders` and `?entity=vendor-stock`**. Missing
      either from the per-entity capability map silently hands an Editor the full
      report by URL — the same hole R12.6 closed for the snapshot.
- [ ] As a grower or vendor: 403 on all four tabs.

### R13.5 — Seed enrichment
- [ ] `npm run db:seed` twice in a row still succeeds.
- [ ] Order ETAs now come from each vendor's quoted `leadTimeDays` rather than a
      flat +4 days, which is what produces the overdue/not-due mix and a real
      promised-vs-actual spread.
- [ ] `Orders · pack lines` is still **68 · 132** — unchanged, because the
      never-reported row was made by skipping an existing mapping rather than
      adding one (adding one would have shifted the order vendor rotation).
- [ ] Vendor counts are now **61 · 257 · 545** (were 65 · 286 · 585): fewer
      because the five vendors report on different anchors and two StickerPro
      items are skipped.
- [ ] `/grower/on-order`, `/grower/submit`, `/vendor/submit` and
      `/vendor/history` are all still coherent, and Agribar still has an order
      closed today visible on `/grower/on-order` with yesterday's dropped off.

### Superseded by this round
- **R12.4** — "Reports is now two tabs", including its "the sidebar Reports link
  goes to the Power BI tab" checkbox. It is four tabs and the link goes to the
  index route.
- **R12.5** — still correct, but the page now lives at
  `/admin/reports/grower-stock`.
- **P12.1's** "no dramatic events are seeded … receipts match" bullet, rewritten
  in place above.

## Round 14 — vendor allocation prefill, history paging, card legibility (August 2026)

> No migration and no re-seed. Three reported problems, plus two adjacent bugs
> found while tracing them.

### R14.1 — "Load previous values" now restores the grower split
The prefill only ever read each item's previous *quantity*. `VendorSubmitRow`
had no previous-allocations field at all, so an item with per-grower boxes filled
its quantity and left every grower box blank — and submitting from there wiped
the split outright, because `lib/actions/vendor.ts` replaces a detail's
allocations wholesale. The seed was never the problem: it writes a
`VendorAllocation` for every authorized grower on every historical detail.

Log in as **lena@palletpool.local** — *not* sam@packright.local, which has **no
single-grower items** and so cannot reproduce the report. `nina@boxcraft.local`,
`omar@labelworks.local` and `hugo@stickerpro.local` also have them.

- [ ] `/vendor/submit` → **Load previous values**.
- [ ] Items with grower boxes fill the quantity **and** every grower box, and
      those rows are expanded so the filled values are visible, not hidden.
- [ ] Each grower row shows `prev: N` under the grower name, matching what was
      filled. This is the item-level `prev:` hint applied per grower.
- [ ] A **single-grower** item fills — this is the reported bug. On PalletPool,
      `AP-PL-00018` and `BP-PL-00011` are single-grower.
- [ ] For every row, the grower boxes sum to ≤ the quantity: both come from the
      same past report, so they cannot disagree.
- [ ] Submit → `/vendor/history` top card shows the allocation badges (before
      this round it showed `—`).
- [ ] As admin, `/admin/reports/vendor-stock` filtered to that grower still lists
      the item. This is what silently broke: the report filters on the *latest*
      report's allocations, so a wiped split dropped the item out of the view.
- [ ] A grower de-authorized from an item since the last report gets **no**
      prefilled box — the server rejects a report that allocates to an
      unauthorized grower, and it fails the whole payload, not just that row.

### R14.2 — Over-allocation no longer loses the whole report
The server rejects the entire payload if any one item allocates more than it
reports, so a single bad row discarded every number on the page. Only a small
red badge hinted at it and nothing blocked submit.

- [ ] Type a grower allocation larger than the item's quantity. The item's left
      rail turns red, submit is **disabled**, and a line under the button counts
      the offending items.
- [ ] Fix it → submit re-enables.

### R14.3 — Vendor history paging
The pager has been there since the P13.4 round, but each card rendered *every*
detail row, so ten cards buried it far below the fold.

- [ ] Record count and page indicator now appear **above** the list as well as
      below, visible without scrolling.
- [ ] A card with more than 8 items shows 8 rows plus a **Show all N items**
      disclosure; expanding lines up with the columns above it. It is a native
      `<details>`, so these pages stay fully server-rendered.
- [ ] `sam@packright.local` (13 submissions) pages 1 → 2 and back; `?page=2`
      deep-links. `omar@labelworks.local` has exactly 10 → one page, both
      buttons greyed.
- [ ] No submission appears on two pages. Both history queries now tie-break on
      `id`; ordering on `submissionDate` alone left same-day rows in arbitrary
      order, so paging could repeat one row and skip another.
- [ ] Same checks on `/grower/history`, which got the same treatment.

### R14.4 — Item cards are distinguishable again
`Card` draws its edge with `ring-1 ring-foreground/10` and never sets a border
*width*, and Tailwind v4 preflight resets everything to `border: 0 solid`. So
the `border-emerald-500/40` / `border-amber-500/40` state classes both submit
forms carried were colour-only and **rendered nothing** — a submitted card and
an untouched one were pixel-identical. Light mode made it worse: `--card`
(oklch 1) sits 0.8% off `--background` (oklch 0.992).

Styling lives in `components/submit/card-tone.ts` so the two forms cannot drift.
No token or `components/ui/card.tsx` change, so admin pages are untouched.

Check in **light and dark**, and at phone width:
- [ ] `/vendor/submit`, `/grower/submit`: every card has a 4px left rail —
      neutral until entered, emerald once submitted, amber for a grower draft,
      red when over-allocated. The rail is always present, so the card does not
      reflow as its state changes.
- [ ] Clicking into a quantity input visibly lifts that card (`focus-within`).
      On a long list this is the point.
- [ ] `/vendor/history`, `/grower/history`: each submission's date header sits on
      a tinted bar, so one card clearly ends and the next begins.
- [ ] Vendor allocation sub-rows are tinted fills rather than outlined boxes, so
      they read as *inside* the card instead of competing with its edge.
- [ ] **No horizontal page scroll on mobile** (the standing P13 requirement) —
      the detail tables still scroll inside their own container.

## Round 15 — Entra + magic link + email outbox (August 2026, `pre-prod`)

Entra ID and passwordless magic-link sign-in are now wired into the app rather
than sitting in `integration/` as reference code, and `NotificationLog` has
become a real outbox that a paced dispatcher drains. Background:
[docs/auth-and-email.md](docs/auth-and-email.md) and
[docs/email-delivery.md](docs/email-delivery.md).

**`integration/` is gone.** Its contents now live at `lib/auth/entra.ts`,
`lib/auth/magic-link.ts`, `lib/auth/sliding-session.ts`,
`app/(auth)/login/page.tsx` and `components/auth/magic-link-form.tsx`.
`azure-functions/` was deleted outright — Container Apps jobs replaced it. The
`typecheck:integration` script and `tsconfig.integration.json` are gone with it;
this code is in the main build now, so `npm run typecheck` covers it.

### 0. Migration first
The only schema change is additive (`MagicToken`, plus queue columns and two
indexes on `NotificationLog`), but replay it on a scratch copy with real data
before trusting it — that is how the `sp_rename` INDEX/OBJECT bug was caught.

- [ ] Restore a copy of the real database, point `DATABASE_URL` at it, then:
      `npm run db:migrate:deploy` → `npm run db:migrate:status` reports no pending.
- [ ] Existing `NotificationLog` rows survive with `priority=5`, `attempts=0`,
      null retry columns — they are history, and that is what history looks like.

### 1. Gates
- [ ] `npm run typecheck` · `npm run lint` · `npm run build` all clean.
- [ ] `npm run build` output lists `/api/auth/login`, `/api/auth/callback`,
      `/api/auth/magic/request`, `/api/auth/magic/consume`, `/api/cron/reminders`,
      `/api/cron/email-dispatch`.

### 2. Local, no Azure account
Set `EMAIL_PROVIDER=acs` with **`ACS_CONNECTION_STRING` left unset** — outside
production the transport reports success without sending, so the whole queue
path is exercisable. Keep `AUTH_PROVIDER=local`. Also set
`MAGIC_LINK_SECRET` to any long random string.

- [ ] `/login` shows the Microsoft button, the email box, **and** the demo picker
      below a "Development only" divider.
- [ ] Click **Sign in with Microsoft** with no `AZURE_AD_*` set → bounces back to
      `/login?error=config` with a readable banner, not a stack trace.
- [ ] Enter `james@agribar.local` in the email box → neutral "check your inbox"
      message. The link is printed to the **server console**; open it → lands on
      `/grower`.
- [ ] Click that same link again → `/login?error=linkexpired`.
- [ ] Request a second link, then open the **first** one → also rejected (a new
      request invalidates outstanding links).
- [ ] Enter an internal address (`admin@demo.local`) → same neutral response, and
      **no** link in the console. Internal staff use Entra.
- [ ] Enter an address that does not exist → identical neutral response. The two
      cases must be indistinguishable from the browser.
- [ ] **Outbox** has a `MagicLink` row: subject and recipient present, body reads
      `[sign-in link — not stored]`, no preview button. The token must not be
      anywhere in the Outbox — that page is readable by every admin.
- [ ] Switch the UI to Español, request a link → the email renders in Spanish
      (check the Outbox row's language, or the console-logged HTML).

### 3. The queue and its pacing
Set `EMAIL_RATE_PER_MINUTE=2` and `EMAIL_INTERACTIVE_RESERVE=1` to make it visible.

- [ ] Settings → Schedulers → **Run reminder check now** → rows land in the
      Outbox as **Queued**, not Sent. The toast reports counts immediately —
      it no longer waits on any mail round-trip.
- [ ] Within ~30s the in-app loop starts moving them: `Queued → Sending → Sent`,
      one per pass at this rate. Container/`next dev` console logs a
      `[email] dispatch` line for each pass that did something.
      *This is the one piece of hand-written SQL in the app — the `WITH … UPDATE …
      OUTPUT` batch claim in `lib/email/dispatch.ts`, which typechecking cannot
      cover. If rows never leave `Queued`, look for an error from that query first.*
- [ ] **Send queued email now** (Settings → Schedulers) runs one pass on demand
      and reports what happened, including "Rate limit reached" when it is.
- [ ] `curl -X POST -H "x-cron-secret: dev-only-cron-secret" http://localhost:3000/api/cron/email-dispatch`
      returns JSON counts. Without the header → 401.
- [ ] Set `EMAIL_DISPATCH_INTERVAL_MS=0`, restart → nothing drains on its own;
      the endpoint and the button still work.
- [ ] Priority holds: queue a batch of reminders, then request a magic link while
      they are draining. The link arrives immediately — it is sent inline, and the
      reserve keeps a slot free for it.
- [ ] With `EMAIL_PROVIDER=local`, reminders are `Mocked` and the dispatcher
      reports "nothing to send" — the offline demo is unchanged.

### 4. Admin fan-out grouping
- [ ] Give two admins different `preferredLocale` values, then raise a missing-item
      request as a grower. The Outbox shows **one row per language**, not one per
      admin, with the recipients comma-separated in the To line.

### 5. Sessions
- [ ] Sign in, then visit a deep link like `/admin/items` in a fresh private
      window → bounced to `/login?returnTo=/admin/items`; after signing in you land
      on `/admin/items`, not the dashboard.
- [ ] Sign out from the user menu → back at `/login`, and the session cookie is gone.

### 6. Demo picker gate
- [ ] Set `AUTH_PROVIDER=entra`, restart → the picker is gone from `/login`; the
      Microsoft button and email box remain.
- [ ] With it gone, invoking `loginAs` directly still fails — it re-checks the gate
      itself, because a server action is reachable whether or not a form renders it.
      (Easiest check: flip back to `local`, submit the form with devtools open to
      capture the action request, then flip to `entra` and replay it.)

### 7. Against staging (Entra app registration + ACS managed domain)
- [ ] The app registration's redirect URIs include
      `https://<staging-fqdn>/api/auth/callback` — the pipeline derives this from the
      ingress FQDN, so it must match exactly.
- [ ] Its post-logout redirect URIs include `https://<staging-fqdn>/login`.
- [ ] Sign in with Microsoft as a provisioned admin → lands on `/admin`;
      `User.entraObjectId` is backfilled on that row.
- [ ] Sign in as a tenant account with **no** `User` row → `?error=unprovisioned`.
- [ ] Sign out → clicking "Sign in with Microsoft" again actually prompts, rather
      than silently signing the same person back in.
- [ ] Tamper check: hit `/api/auth/callback?code=whatever` directly → `?error=state`.
- [ ] Both Container Apps jobs → **Run now** → exit 0, and the Outbox reflects it.
- [ ] Real send: queue ~30 reminders and watch them drain over several minutes with
      **no `Failed` rows**. Any `Failed` row shows its reason and attempt count.
- [ ] `EMAIL_RATE_PER_MINUTE` / `EMAIL_RATE_PER_HOUR` on the Container App match
      what the ACS resource actually allows — confirm the current figures in the
      portal rather than assuming.

## Round 16 — session redirect loop + fail-closed SESSION_SECRET (September 2026)

Two fixes. The loop: `proxy.ts` gated on the session cookie being *present*, and
nothing on any rejection path ever deleted it, so a cookie that could not be
verified bounced between `/` and `/login` until the browser gave up with
`ERR_TOO_MANY_REDIRECTS` — with the login page unreachable. The proxy now gates
on the verified payload and deletes a dead cookie; `requireUser()` routes through
`/api/auth/session-ended` for the case the proxy cannot see (valid JWT, no active
user). Plain 7-day expiry never looped and still does not — the cookie `maxAge`
and the JWT `exp` lapse together — which is exactly why this hid for so long.

### 1. The loop is gone (any signed-in user)
- [ ] Sign in. DevTools → Application → Cookies → change one character of
      `demo_session` → reload any page.
- [ ] You land on `/login` **once**, with "Your session ended. Please sign in again."
- [ ] `demo_session` is gone from the cookie jar — not merely ignored.
- [ ] Sign in again from that same page; no cookie clearing by hand.
- [ ] Before the fix this was `ERR_TOO_MANY_REDIRECTS` and `/login` never rendered.

### 2. Deactivated user mid-session (the case the proxy cannot catch)
- [ ] Sign in as `james@agribar.local` in one browser.
- [ ] As `admin@demo.local` in another, edit that user → uncheck Active → save.
- [ ] Back in the first browser, click any nav link → one redirect to `/login`
      with "That account does not have access to this app."
- [ ] `demo_session` is cleared. Re-activate the user and confirm they can sign in.

### 3. Secret rotation does not wedge everyone
- [ ] Sign in, then change `SESSION_SECRET` in `.env` and restart.
- [ ] Reload → single redirect to `/login`, cookie cleared, no loop. This is the
      one that would otherwise have hit *every* signed-in user at once on deploy.

### 4. Nothing that used to work regressed
- [ ] Unauthenticated deep link `/admin/items` → `/login?returnTo=/admin/items`,
      no `error` param (there was no session to end).
- [ ] Sign in → you land back on `/admin/items`, not the dashboard.
- [ ] Signed in, visit `/login` directly → redirected to `/`.
- [ ] Entra and magic-link sign-in both still work end to end.
- [ ] Sign out from the user menu → `/login`, cookie gone, no error banner.
- [ ] Sliding expiry still re-mints: `npx tsx scripts/dev-mint-session.ts` with the
      script's `setIssuedAt()` backdated past 3.5 days, paste as `demo_session`,
      load a page → the cookie value changes. (Unchanged behaviour, but the
      re-mint moved into the proxy's verify path.)

### 5. SESSION_SECRET fails closed
- [ ] `NODE_ENV=production SESSION_SECRET= npm start` → refuses to boot with
      `[startup] SESSION_SECRET is not set`. Previously it started and signed every
      session with `dev-only-insecure-secret`, a constant published in this repo.
- [ ] Same with `SESSION_SECRET=dev-only-insecure-secret` → refuses, same shape.
- [ ] A real secret boots normally.
- [ ] Dev is unaffected: `npm run dev` with no `SESSION_SECRET` still works.
- [ ] `npm run build` still succeeds **without** `SESSION_SECRET` in the
      environment — the check is skipped during `phase-production-build` because
      the pipeline injects the secret at deploy time, not at image build time.
      Worth confirming in CI, not just locally.

## Round 17 — item photos (September 2026)

One optional photo per item. Bytes live in Azure Blob Storage (private
container), never in SQL Server; `Item.imageKey` holds the storage key, not a
URL. Locally, with no `AZURE_STORAGE_CONNECTION_STRING`, photos are written to
`.uploads/` so none of this needs an Azure account.

**Apply the migration first:** `npm run db:migrate` (dev) — it is a single
additive nullable column, so nothing existing changes.

### 1. Upload on create (admin@demo.local, `/admin/items`)
- [ ] **New item** → the dialog shows a Photo field with a placeholder tile.
- [ ] Pick a large photo (a phone photo, 3–8 MB). The button reads "Processing…"
      briefly, then the tile shows it.
- [ ] Save → the item appears in the table **with its thumbnail** in the first column.
- [ ] Check `.uploads/items/<ItemID>/` — one `.webp` file, a few hundred KB, not
      the multi-megabyte original. (That resize is why the default 1 MB server-action
      limit is not in the way.)

### 2. Replace and remove
- [ ] Edit an item with a photo → the current photo shows in the dialog.
- [ ] **Replace** with a different image → save → the table thumbnail changes.
- [ ] A **new** file exists in `.uploads/items/<ItemID>/` and the old one is gone.
- [ ] Edit → **Remove** → save → the placeholder returns and the file is deleted.
- [ ] Edit an item **without touching the photo** — change only the name → save →
      the photo is still there. (The keep/replace/remove field exists for exactly
      this; a file input posts nothing when untouched.)
- [ ] Delete an item that has a photo → its folder contents are gone.

### 3. Growers and vendors can see photos
- [ ] Sign in as `james@agribar.local` → open any page listing items → photos load.
- [ ] Hit `/items/<ItemID>/image` directly while signed in → the image renders.
- [ ] Sign out and hit the same URL → redirected to `/login`, no image served.

### 4. Rejecting bad files
- [ ] Rename a `.pdf` (or any non-image) to `.jpg` and pick it → rejected. The check
      reads the file's leading bytes, so the extension and declared type do not matter.
- [ ] The failure message appears on the field, and the rest of the form is preserved.

### 5. Storage configuration
- [ ] With `AZURE_STORAGE_CONNECTION_STRING` set against a real account (or Azurite):
      upload a photo → it appears as a blob under `item-images/items/<ItemID>/`.
- [ ] The container is **private** — the blob's direct URL returns
      `ResourceNotFound`/`PublicAccessNotPermitted` in a signed-out browser, while
      `/items/<ItemID>/image` still works in the app. If the raw blob URL renders the
      image, the container was created public and must be fixed.
- [ ] `NODE_ENV=production` with **no** connection string → uploading fails loudly
      rather than writing to the container filesystem, which Container Apps discards
      on the next revision.

### 6. The client workbook
- [ ] `npx tsx scripts/generate-master-data-template.ts` → 63 columns.
- [ ] `7-Items` has **ImageFile** as its last column, after `Notes`, with the naming
      rule in the cell prompt. Existing columns have not moved — a client already
      filling the previous copy can keep their work.
- [ ] The README tab has an "Item photos" section explaining the separate folder.
- [ ] ⚠️ **Nothing consumes this column yet.** The importer described in
      `docs/master-data-upload.md` has never been built — the column and its
      documentation ship so the client can gather photos in the same pass, but the
      bulk load itself is still outstanding work.

## Round 18 — Power BI panels render a real URL (September 2026)

The panels were placeholders. Each now frames whatever URL is stored against the
report in `PowerBiReport.embedUrl`, so connecting one is a URL change with no
deploy. The seeded `DEMO_` URLs still show the placeholder card.

**Decide before pasting a URL:** a *Publish to web* URL
(`app.powerbi.com/view?r=...`) needs no sign-in and no licence, and is **public
to anyone with the link**. A *Secure embed* URL
(`app.powerbi.com/reportEmbed?...`) keeps the report private but prompts the
viewer to sign in to Power BI and requires a licence per viewer. Signing into
this app with Microsoft does not carry across to either — see the note in
`components/reports/power-bi-embed.tsx`.

### 1. Unconfigured state (admin@demo.local, `/admin/reports/power-bi`)
- [ ] With the seeded data, both panels show **"Not connected yet"** with the
      stored URL beneath, and the banner reads *"2 of 2 reports are not connected yet"*.
- [ ] No **open** link appears on an unconnected panel — it would go nowhere.
- [ ] **Nothing but Power BI panels on the page.** The locally-drawn inventory
      trend chart was removed in Round 20 — the page is solely for embedded
      Power BI reports.

### 2. Connecting a report
- [ ] In the database, set one report's `embedUrl` to a real Power BI URL.
- [ ] Reload → that panel renders the live report in a frame; the other still
      shows the placeholder; the banner now reads *"1 of 2"*.
- [ ] The **open** link appears on the connected panel and opens the report in a
      new tab.
- [ ] Set both → the banner disappears entirely.

### 3. It refuses to frame anything that is not Power BI
The URL comes from the database and renders inside an authenticated admin page,
so an arbitrary URL there would be a convincing place to put a fake login form.
- [ ] Set an `embedUrl` to `https://example.com` → placeholder, not a frame.
- [ ] `http://app.powerbi.com/view?r=x` (not HTTPS) → placeholder.
- [ ] `https://app.powerbi.com.evil.example/view?r=x` → placeholder. This is the
      one a naive "contains app.powerbi.com" check would happily frame.
- [ ] `javascript:alert(1)` → placeholder.

### 4. Which sign-in the viewer is asked for
- [ ] With a **Publish to web** URL, open the page in a private window signed in
      as an admin → the report renders with **no Power BI prompt**.
- [ ] Confirm you are comfortable with that: open the same URL in a browser with
      no session at all. It will render. That is what "publish to web" means.
- [ ] With a **Secure embed** URL, the frame prompts for a Microsoft sign-in
      unless that browser already has a licensed Power BI session.

## Round 19 — Power BI "embed for your organization" (September 2026)

Secure-embed reports now render through the powerbi-client library with a token
the app acquires for the signed-in admin, instead of an iframe left to
authenticate itself. The iframe route survives for publish-to-web URLs; each
panel picks by looking at its own URL.

**Azure side first** — `docs/azure-staging-setup.md` §10d. Nothing below works
until `Report.Read.All` + `Dataset.Read.All` are granted **with admin consent**,
*"Embed content in apps"* is enabled in the Power BI admin portal, and
`TOKEN_CACHE_SECRET` is set. Those are three different switches owned by up to
three different people.

**Apply the migration:** `npm run db:migrate` (two nullable columns on `User`).

### 1. Token storage (already verified end-to-end against SQL Server)
Confirmed on a real database when this shipped — re-run only if the crypto changes:
- [ ] After an Entra sign-in, `User.entraTokenCache` is populated and
      `User.entraHomeAccountId` holds an MSAL account id.
- [ ] The column is **ciphertext** — searching it for any recognisable token
      fragment finds nothing.
- [ ] Changing `TOKEN_CACHE_SECRET` makes the stored cache unreadable, and the
      reports page asks the user to sign in again rather than erroring.

### 2. The thing this was built to fix (admin@demo.local → real Entra admin)
- [ ] Sign in with Microsoft, open `/admin/reports/power-bi` → a secure-embed
      report renders with **no Power BI sign-in prompt inside the panel**.
- [ ] Repeat in **Safari**. This is the whole point: Safari blocks third-party
      cookies, so the old iframe prompted there even for a signed-in admin.
- [ ] Repeat in a Chrome window with third-party cookies blocked.
- [ ] Leave the page open for over an hour, reload → still renders. The Power BI
      token lasts about an hour and is re-minted from the stored refresh token.

### 3. Each failure says something different and actionable
- [ ] Sign in via the **demo picker** (not Entra) → banner reads *"Sign in with
      Microsoft to view these reports"* with a working button. Not a broken frame.
- [ ] Unset `TOKEN_CACHE_SECRET`, restart → *"Power BI embedding is not
      configured"*, and the rest of the app is unaffected.
- [ ] Before admin consent is granted → *"Power BI access has not been approved
      yet"*, and it says signing in again will not help. It should **not** loop.
- [ ] Paste an address-bar URL (`/groups/…/reports/…`) → the panel explains the
      URL has no `reportId` and points at the Embed menu.
- [ ] A report the signed-in admin has no Power BI access to → the panel shows
      Power BI's own error rather than a blank box.

### 4. Both URL kinds still work side by side
- [ ] One report on a `/reportEmbed?reportId=…` URL and one on a `/view?r=…`
      URL → the first uses the library, the second a plain iframe, both render.
- [ ] A page with only publish-to-web panels makes **no token call at all**
      (no Entra traffic in the logs) — nothing there needs one.

### 5. Regression
- [ ] Ordinary Microsoft sign-in still works, including for non-admins who never
      touch reports. `offline_access` was added to the login scopes, so the
      consent prompt may appear once more per user.
- [ ] Magic-link sign-in for growers and vendors is untouched — they have no
      Microsoft identity and no token cache is written for them.
- [ ] `npm run build` clean.

## Round 20 — Power BI page shows only Power BI (September 2026)

The page carried a locally-drawn inventory trend chart built from
`InventoryLedger`. It was there because the Power BI panels were placeholders and
the page would otherwise have been empty; with the panels rendering real reports
it only invited the question of why one panel behaves differently from the rest.
Removed, along with the ledger query that fed it.

- [ ] `/admin/reports/power-bi` shows **only** Power BI report cards — no trend
      chart, no locally-drawn visualisation of any kind.
- [ ] The page no longer queries `InventoryLedger`. With no reports configured it
      touches only `PowerBiReport`.
- [ ] Report panels, the "not connected" placeholders and the sign-in and consent
      banners all behave exactly as in Rounds 18 and 19.
- [ ] The other report tabs — Grower stock, Orders, Vendor stock — are unchanged.

> `components/reports/inventory-trend-chart.tsx` is now unused. It was left in
> place rather than deleted: the chart itself is a reasonable live view of ledger
> data and may be wanted on the dashboard or another report tab. Delete it if
> not.

## Round 21 — Report panels are full width and can go fullscreen (September 2026)

The panels sat in a two-column grid at 16:9, which halved every report. A Power
BI report is authored for a full browser window, so labels and axes were below
reading size. Panels are now one per row, and each carries a maximize control.

Maximizing uses the **Fullscreen API on the existing node**, not a dialog:
promoting the element in place leaves the `<iframe>` mounted, so the report keeps
its current page, filters and (for secure embeds) its token handshake. Portalling
an iframe into a dialog would reload it and discard all of that.

- [ ] `/admin/reports/power-bi` — each report card spans the **full page width**,
      one per row, at 16:9. No two-column layout at any breakpoint.
- [ ] Hovering a panel shows a maximize button in its **top-right corner**; it is
      visible-but-dimmed before hover, not invisible.
- [ ] Clicking it fills the **whole screen** — no letterboxing, no black bars
      from the 16:9 ratio, and the background matches the current theme rather
      than flashing black in light mode.
- [ ] The button becomes a *minimize* icon while fullscreen.
- [ ] **Esc** exits, and the icon flips back — the state follows the browser, not
      the click, so exiting via Esc or the browser's own control stays in sync.
- [ ] **State survives maximizing.** Navigate to page 2 of a report, apply a
      filter, then maximize → the report does **not** reload and stays exactly
      where it was. Same on the way back out. *(This is the point of the whole
      approach — if it reloads, the frame is being re-mounted somewhere.)*
- [ ] Works for **both** URL kinds: a `/reportEmbed?reportId=…` secure panel and
      a `/view?r=…` publish-to-web panel each maximize the same way.
- [ ] A **"Not connected yet"** placeholder has *no* maximize button — there is
      nothing to maximize.
- [ ] An errored panel ("could not be loaded") keeps its message legible and
      centred in both sizes.
- [ ] Keyboard: the button is tab-reachable and its `aria-label` names the report
      ("View \<name\> fullscreen").
- [ ] Narrow viewport (phone width): panels are still full width, nothing
      overflows horizontally, and the button does not cover the report's own
      toolbar.

> Safari uses the prefixed `webkit*` fullscreen API; the helpers at the bottom of
> `components/reports/report-frame.tsx` cover it. Worth a check there if the
> client's staff use Macs. If a browser refuses the request the panel simply
> stays card-sized and logs a warning — no broken state.

## Round 22 — APP_URL follows the custom domain, not the ingress FQDN (September 2026)

Both deploy stages built `APP_URL` and `AZURE_AD_REDIRECT_URI` from the Container
App's `*.azurecontainerapps.io` ingress FQDN. With custom domains bound
(`staging.domain3.com`, `domain3.com`) that is the wrong origin for both. New
pipeline variables `stagingPublicHost` / `prodPublicHost` supply the real host;
leaving one empty falls back to the FQDN, so an unbound environment still works.
The health-check poll deliberately still uses the FQDN — it answers "is the
revision serving", which should not fail on a DNS or certificate problem.

**Entra first, or sign-in breaks.** Register the new redirect URI *before* the
first deploy that uses it — a redirect URI that isn't registered is rejected by
Microsoft outright (`AADSTS50011`).

- [ ] App registration has **`https://staging.domain3.com/api/auth/callback`** as
      a Web redirect URI, and production's has its own.
- [ ] Post-logout redirect URI updated to `https://staging.domain3.com/login`.
- [ ] Pipeline log line `ingress=…  public=…` shows the custom domain as
      `public`, not the `azurecontainerapps.io` host.
- [ ] Container App → env vars: `APP_URL` and `AZURE_AD_REDIRECT_URI` both carry
      the custom domain after the deploy.
- [ ] Sign in with Microsoft **starting at `https://staging.domain3.com/login`**
      → you land back on `staging.domain3.com`, signed in. You are **not**
      bounced to `*.azurecontainerapps.io` at any point. *(This is the failure the
      change prevents: the callback sets the session cookie on whichever origin
      handles it, so the old value left you signed in on the wrong hostname.)*
- [ ] Sign out → returns to `staging.domain3.com/login`.
- [ ] Request a magic link → the emailed URL is on `staging.domain3.com`, and
      following it signs you in.
- [ ] The email logo renders (it is `APP_URL/logo-email.png` — it was pointing at
      the ACA host before, which worked but was off-brand).
- [ ] Cron jobs still fire. They `curl` the FQDN by design; no change needed, and
      pointing them at the custom domain would only add a DNS dependency to a
      call that never leaves Azure.
- [ ] Visiting the old `*.azurecontainerapps.io` URL still serves the app but now
      issues links on the custom domain. Consider whether the client wants that
      hostname locked down — see below.

> **Decide before go-live:** the default ACA hostname stays publicly reachable
> after a custom domain is bound. Two origins serving the same app means a stray
> bookmark can produce sessions on the wrong host. Options: leave it (harmless,
> slightly untidy), or add a redirect to the canonical host.

> `prodPublicHost` is set to the apex `domain3.com`. **Apex and `www` are
> different origins** — if the client's DNS sends `www` anywhere, pick one as
> canonical and redirect the other, or sign-in works on one and not the other.

## Quality gates
- [ ] `npm run typecheck` clean · `npm run lint` clean · `npm run build` clean.
