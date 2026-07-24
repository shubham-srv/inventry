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

## Quality gates
- [ ] `npm run typecheck` clean · `npm run lint` clean.
