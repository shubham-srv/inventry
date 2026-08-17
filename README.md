# Inventory Management & Tracking

Full-stack Next.js app for inventory management across three personas:

- **Internal users** — Admins (master data, onboarding, user↔grower/vendor mapping, settings) and Editors (master data only). Items carry their own grower (who uses it) and vendor (who supplies it) mappings, editable from the item form.
- **Growers** — submit daily on-hand counts, raise & track orders (per vendor, marked received/cancelled), flag low inventory, request missing items, view history + analytics. Mobile-first.
- **Vendors** — report item quantities with per-grower allocation breakdowns, view history + analytics.

Strict data isolation: growers/vendors only ever see their own data (enforced server-side by the session's grower/vendor mapping).

## Stack

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind v4 · shadcn/ui · Prisma 6 · **Azure SQL / SQL Server** · zod · recharts · ExcelJS.

The app runs **fully offline for the demo** via pluggable providers:
- **Auth** — local user-picker + signed cookie (real **Entra ID** code is in `integration/`).
- **Email** — triggers recorded to an in-app **Outbox** (real **ACS** sender at `lib/email/acs/`).
- **Scheduler** — manual button / `npm run reminders` (real **Azure Timer Function** in `integration/`).

See [`integration/INTEGRATION.md`](integration/INTEGRATION.md) to switch any of these on.

## Getting started

```bash
npm install

# 1. Configure the database
cp .env.example .env
#   edit DATABASE_URL to point at your SQL Server (Azure SQL / SQL Express / etc.)

# 2. Create schema + demo data
npm run db:push
npm run db:seed

# 3. Run
npm run dev          # http://localhost:3000
```

Open `/login` and pick any seeded user. Reset data anytime with `npm run db:reset`.

### Demo accounts
`admin@demo.local` (admin) · `editor@demo.local` (editor) · `james@agribar.local`, `diago@brigo.local`, `priya@pdg.local` (growers) · `sam@packright.local`, `lena@palletpool.local`, `omar@labelworks.local` (vendors).

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the app |
| `npm run db:push` | Sync Prisma schema to the DB |
| `npm run db:seed` | Load demo data |
| `npm run db:reset` | Force-reset schema + reseed |
| `npm run reminders` | Run the scheduled-reminder check locally |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

To produce the blank master-data workbook to send the client:

```bash
npx tsx scripts/generate-master-data-template.ts   # -> master-data-template.xlsx
```

## Project structure

```
app/(auth)/login        demo user picker
app/(app)/admin         internal: master data, growers/vendors, users, authorizations,
                        requests, conversions, reports, settings (schedulers/thresholds/
                        audit-logs/outbox), Excel export route
app/(app)/grower        submit, on-order, history, requests, dashboard
app/(app)/vendor        submit (with grower allocation), history, dashboard
app/api/cron/reminders  secret-protected scheduler endpoint
lib/auth                session (cookie/jose) + RBAC; entra/ is reference-only
lib/actions             server actions (per domain), validated with zod
lib/email               notify() abstraction + acs/ sender
lib/scheduler           shared reminder logic
lib/admin               shared list filters + Excel export
prisma/                 schema + seed
integration/            Entra, ACS, Azure Function — drop-in, build-excluded
```

## Documentation

| Doc | What it covers |
|---|---|
| [`VERIFICATION.md`](VERIFICATION.md) | Manual verification checklist, one section per round of changes |
| [`MIGRATIONS.md`](MIGRATIONS.md) | Migration workflow, renaming tables safely, fixing "drift detected" |
| [`docs/azure-staging-setup.md`](docs/azure-staging-setup.md) | Standing up the Azure infrastructure, click by click |
| [`docs/azure-devops-setup.md`](docs/azure-devops-setup.md) | Wiring the CI/CD pipeline in Azure DevOps |
| [`docs/master-data-upload.md`](docs/master-data-upload.md) | Workbook format for the client's one-time master-data load |
| [`integration/INTEGRATION.md`](integration/INTEGRATION.md) | Swapping in Entra, ACS email, the scheduler and the production login page |

> **Database note:** Prisma 6 is pinned intentionally — Prisma 7 removed `url` from
> the datasource block and requires a driver adapter. The schema avoids SQL Server
> incompatibilities (no native enums; status fields are strings; `NoAction` FKs to
> avoid multiple cascade paths), so it targets Azure SQL directly.
