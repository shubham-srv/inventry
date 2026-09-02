# Inventory Management & Tracking

A full-stack web application for tracking packaging and materials inventory across a
distributed supply network — growers who hold and consume stock, vendors who supply it,
and the internal team that runs the master data behind both.

The whole application runs on a laptop with no cloud account. Every external integration
(sign-in, email, translation) has an offline fallback, so you can install it and click
through the entire product in about ten minutes.

> **Client-facing technical documentation:** [`TECHNICAL-DOCUMENTATION.md`](TECHNICAL-DOCUMENTATION.md)
> — architecture, data model, security, deployment and operations in full.

---

## What it does

Three audiences, one shared picture of stock:

| Audience | What they do |
|---|---|
| **Growers** | Submit daily on-hand counts per location, raise orders against vendors and mark them received or cancelled, flag low stock, request items that don't exist yet, review history and dashboards. Mobile-first. |
| **Vendors** | Report the quantities they hold, with a per-grower allocation breakdown. Review history and dashboards. |
| **Internal staff** | Own the master data everyone else selects from (items, commodities, categories, locations, growers, vendors), act on shortages and requests, onboard users, configure thresholds and reminders, and report across the whole network. |

Two principles run through the design:

- **Each number has exactly one owner.** On-hand stock is whatever the grower counted —
  never inferred from orders or receipts.
- **Strict data isolation.** Growers and vendors only ever see their own data, enforced
  server-side from the session's grower/vendor mapping. The identifier in a request is
  never the one used to scope a query.

## Stack

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind v4 ·
shadcn/ui · Prisma 6 · **Azure SQL / SQL Server** · zod · Recharts · ExcelJS

Production integrations are live in the app, and each falls back to something that works
offline:

- **Auth** — **Entra ID** for internal staff, passwordless **magic link** for growers and
  vendors, both ending at the same session cookie. A credential-free user picker is also
  available, but only outside production (`AUTH_PROVIDER=local`).
- **Email** — **Azure Communication Services**. `EMAIL_PROVIDER=local` records triggers to
  an in-app **Outbox** without sending. Messages are queued and drained at the provider's
  allowed rate rather than sent inline.
- **Scheduler** — **Azure Container Apps jobs** hitting `/api/cron/*`; locally, an admin
  button or `npm run reminders`.

---

## Running it locally

### Prerequisites

| | |
|---|---|
| **Node.js 20 LTS or newer** | `node --version` |
| **A SQL Server instance** | Azure SQL, SQL Server Express, LocalDB, or the Docker image below |
| **npm** | Ships with Node |

No SQL Server handy? This gets you one in a container:

```bash
docker run -d --name inventory-sql \
  -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=Your_password123" \
  -p 1433:1433 mcr.microsoft.com/mssql/server:2022-latest
```

### 1. Install

```bash
git clone <repository-url>
cd <repository-directory>
npm install
```

### 2. Create the databases

Create an empty `inventory` database on your instance, plus an `inventory_shadow` one.
The shadow database is a scratch space Prisma wipes and replays migrations into; it must
exist before `prisma migrate dev` will run, and it must never point at your real data.

Using `sqlcmd` (or SSMS / Azure Data Studio — anything that runs SQL):

```bash
sqlcmd -S localhost -U sa -P 'Your_password123' -C -Q "CREATE DATABASE inventory; CREATE DATABASE inventory_shadow;"
```

With the Docker container above, run it inside the container instead:

```bash
docker exec -i inventory-sql /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P 'Your_password123' -C \
  -Q "CREATE DATABASE inventory; CREATE DATABASE inventory_shadow;"
```

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env` and set `DATABASE_URL` (and `SHADOW_DATABASE_URL`) to your instance. For the
Docker container above, the values already in `.env.example` work as-is:

```
DATABASE_URL="sqlserver://localhost:1433;database=inventory;user=sa;password=Your_password123;encrypt=true;trustServerCertificate=true"
```

Everything else in `.env.example` is pre-set for offline use — no Azure account, no keys.
The file documents each variable inline; [`TECHNICAL-DOCUMENTATION.md` §13](TECHNICAL-DOCUMENTATION.md#13-configuration-reference)
has the full reference.

### 4. Create the schema and load demo data

```bash
npm run db:push     # sync the Prisma schema to your database
npm run db:seed     # load demo growers, vendors, items and history
```

### 5. Run

```bash
npm run dev         # http://localhost:3000
```

Open `/login` and pick any seeded user. Reset everything with `npm run db:reset`.

### Demo accounts

| Role | Sign in as |
|---|---|
| Admin | `admin@demo.local` |
| Editor | `editor@demo.local` |
| Growers | `james@agribar.local` · `diago@brigo.local` · `priya@pdg.local` |
| Vendors | `sam@packright.local` · `lena@palletpool.local` · `omar@labelworks.local` |

No passwords — the local picker signs you in directly. To rehearse the real login page
instead, set `AUTH_PROVIDER=entra` and fill in the Entra variables.

### If something goes wrong

| Symptom | Fix |
|---|---|
| `Cannot open database "inventory"` | The database doesn't exist yet — step 2. |
| TLS / certificate errors connecting | Add `trustServerCertificate=true` to `DATABASE_URL` (already in the example). |
| `Drift detected` | See [`MIGRATIONS.md`](MIGRATIONS.md). For local work, `npm run db:reset` is usually the answer. |
| Buttons dead when opening the dev server from a phone on your LAN | Add your machine's IP to `allowedDevOrigins` in [`next.config.ts`](next.config.ts). |
| Emails "not arriving" | Expected. With `EMAIL_PROVIDER=local` nothing is sent — read them in Admin → Settings → Outbox. |

---

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the app |
| `npm run build` / `npm start` | Production build and serve |
| `npm run db:push` | Sync Prisma schema to the DB (local only) |
| `npm run db:seed` | Load demo data |
| `npm run db:reset` | Force-reset schema + reseed |
| `npm run db:studio` | Browse the data in Prisma Studio |
| `npm run db:migrate` | Create a migration from schema changes |
| `npm run db:migrate:deploy` | Apply migrations (what CI/CD runs) |
| `npm run db:bootstrap` | Create roles, lookups and the first admin on an empty DB |
| `npm run reminders` | Run the scheduled-reminder check locally |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

To produce the blank master-data workbook to send the client:

```bash
npx tsx scripts/generate-master-data-template.ts   # -> master-data-template.xlsx
```

## Project structure

```
app/(auth)/login        sign-in: Microsoft, magic link, demo picker
app/(app)/admin         internal: master data, growers/vendors, users, authorizations,
                        requests, packaging, reports (grower stock, orders, vendor
                        stock, Power BI), settings (schedulers/thresholds/
                        audit-logs/outbox), Excel export
app/(app)/grower        submit, on-order, history, requests, dashboard
app/(app)/vendor        submit (with grower allocation), history, dashboard
app/api/auth            Entra login/callback + magic-link request/consume
app/api/cron            secret-protected scheduler + email-dispatch endpoints
lib/auth                session (cookie/jose), entra, magic-link, sliding session
lib/actions             server actions (per domain), validated with zod
lib/email               notify() enqueues; dispatch.ts paces and sends; acs/ is the wire
lib/scheduler           shared reminder logic
lib/admin               shared list filters + Excel export
lib/rbac.ts             the entire permission model
prisma/                 schema + migrations + seed
instrumentation.ts      starts the email dispatch loop on server start
```

## Documentation

| Doc | What it covers |
|---|---|
| [`TECHNICAL-DOCUMENTATION.md`](TECHNICAL-DOCUMENTATION.md) | **Full technical documentation** — architecture, data model, security model, notifications, deployment, configuration and operations. Includes **Appendix A**, the master-data workbook specification, and **Appendix B**, the Azure provisioning inventory and pre-cutover checklist |
| [`MIGRATIONS.md`](MIGRATIONS.md) | Migration workflow, renaming tables safely on SQL Server, fixing "drift detected" |

Where the code is the reference:

| File | Is the source of truth for |
|---|---|
| [`.env.example`](.env.example) | Every configuration variable, documented inline |
| [`prisma/schema.prisma`](prisma/schema.prisma) | The database schema |
| [`schema.dbml`](schema.dbml) | ER diagram source — paste into [dbdiagram.io](https://dbdiagram.io) |
| [`lib/rbac.ts`](lib/rbac.ts) | The complete permission model |
| [`lib/constants.ts`](lib/constants.ts) | Every enum-like value in the system |
| [`azure-pipelines.yml`](azure-pipelines.yml) | The CI/CD definition, commented throughout |

> **Database note:** Prisma 6 is pinned intentionally — Prisma 7 removed `url` from the
> datasource block and requires a driver adapter. The schema avoids SQL Server
> incompatibilities (no native enums; status fields are strings; `NoAction` FKs to avoid
> multiple cascade paths), so it targets Azure SQL directly.
