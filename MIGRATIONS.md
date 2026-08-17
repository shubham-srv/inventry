# Database Migrations

Target DB: **Azure SQL / SQL Server**. ORM: **Prisma 6**.

This project now has a **migration history** under `prisma/migrations/`. That is the
source of truth for the database schema going forward — every schema change ships
as a reviewed SQL migration, so production changes are deliberate and reversible
in planning (no surprise `DROP TABLE`s).

## Two workflows — don't mix them

| Tool | Command | Use for | Keeps data? |
|---|---|---|---|
| **db push** | `npm run db:push` / `db:reset` | Throwaway local prototyping only | `--force-reset` wipes everything |
| **migrate** | `npm run db:migrate` / `:deploy` | **Everything that touches a shared or prod DB** | Yes (you review the SQL) |

Once a database is managed by migrations, **stop using `db push` against it** — a
push edits the schema without recording a migration, so the migration history and
the real schema drift apart. `db:push` / `db:reset` remain in `package.json` only
for spinning up a scratch local DB from zero; prefer `db:migrate` even locally.

> ⚠️ **`npm run db:reset` is NOT the migration-aware reset.** It is
> `prisma db push --force-reset`, which rebuilds the schema and writes **no**
> migration history — so the very next `migrate dev` reports drift and demands
> another reset. The one you want is `npm run db:migrate:reset`
> (`prisma migrate reset`): it drops everything, replays every migration in
> order, and runs the seed, leaving `_prisma_migrations` correct.

## "Drift detected" when you pull new migrations

Symptom — `prisma migrate dev` refuses to apply anything and offers a reset:

```
Drift detected: Your database schema is not in sync with your migration history
```

`migrate dev` replays the whole migration history into the shadow database and
compares the result with your real one. Any mismatch is unresolvable by
definition, so its only offer is to start over. Nothing is wrong with the new
migrations; the database simply has no history that accounts for its tables.

**Diagnose first** — this names the cause instead of guessing:

```
npm run db:migrate:status
```

- *"N migrations found … none applied"* while the database clearly has tables →
  it was built with `db push`. There is no history to reconcile.
- A migration listed as **failed** → resolve it with `prisma migrate resolve`.
- Everything applied and still drifting → someone changed the schema by hand or
  with a push after the last migration.

**Fix, for a local/demo database** (fastest, and leaves the history correct so
this cannot recur):

```
npm run db:migrate:reset
```

**Fix, when the data must survive** — baseline the migrations the schema already
reflects, then apply only the new ones:

```
npx prisma migrate resolve --applied 0_init
npx prisma migrate resolve --applied <each later migration already reflected>
npm run db:migrate:deploy
```

Baselining a *pushed* database is the risky variant: `resolve` records a
migration as applied without running it, so if push named a constraint or index
differently from the migration SQL, a later migration that references that name
by hand fails. Prefer the reset unless the data is genuinely worth the risk.

**Never run `migrate dev` against a shared or production database.** Use
`migrate deploy`, which has no drift check, never prompts and never resets.

## Everyday local change

1. Edit `prisma/schema.prisma`.
2. Create **and apply** a migration against your local DB, and regenerate the client:
   ```
   npm run db:migrate -- --name add_something
   ```
   Prisma writes `prisma/migrations/<timestamp>_add_something/migration.sql`,
   applies it, and updates `_prisma_migrations`.
3. Commit the schema change **and** the generated migration folder together.

## Deploying to a shared / production environment

CI or a release step runs (never `migrate dev`, never `db push` in prod):
```
npm run db:migrate:deploy
```
`migrate deploy` applies only pending, already-committed migrations — no schema
generation, no prompts, no data loss beyond what the reviewed SQL does.

Check drift / pending state anytime with:
```
npm run db:migrate:status
```

## Renaming a table (or column) without dropping it

This is the case that bit us: Prisma's schema is **declarative**, so a rename looks
identical to "drop old + create new". `db push` and *auto-generated* migrations
therefore emit `DROP`/`CREATE` and lose data. The fix is to **generate the
migration without applying it, then hand-edit the SQL** into a real rename.

Worked example — renaming `Foo` → `Bar`:

1. Rename the model in `prisma/schema.prisma` (`model Foo` → `model Bar`, update all
   relation references). Optionally, if you want the *code* name to change but the
   physical table to stay put (zero DB change), use `@@map("Foo")` instead and skip
   the rest of this section.
2. Generate the migration **without running it**:
   ```
   npm run db:migrate:create -- --name rename_foo_to_bar
   ```
3. Open the new `prisma/migrations/<ts>_rename_foo_to_bar/migration.sql`. Prisma
   generated `DROP TABLE [Foo]` + `CREATE TABLE [Bar] ...`. **Replace that whole
   body** with a SQL Server rename:
   ```sql
   EXEC sp_rename 'dbo.Foo', 'Bar';
   -- rename a column too, if needed:
   -- EXEC sp_rename 'dbo.Bar.oldCol', 'newCol', 'COLUMN';
   ```
   `sp_rename` is metadata-only and near-instant. It **preserves all rows, indexes,
   and foreign keys** (FKs reference the table's object id, not its name). Only
   auto-named constraints/indexes keep the old name embedded — cosmetic; rename them
   with more `sp_rename` calls if you care.
4. Apply locally and confirm it's clean:
   ```
   npm run db:migrate:status      # should list the migration as applied / up to date
   ```
   If Prisma reports **drift** (the edited SQL didn't reproduce the schema Prisma
   expects), fix the SQL until `status` is clean — that check is exactly what proves
   your hand-edited rename matches the declarative schema.
5. Commit; deploy with `migrate:deploy`.

> For a very hot table where even a brief metadata lock is unacceptable, use the
> **expand/contract** pattern instead: add the new table, dual-write, backfill,
> switch reads, then drop the old one across several deploys. For ordinary renames,
> the `sp_rename` migration above is standard and safe.

## Baseline note

The first migration, `prisma/migrations/0_init/`, was **baselined** from the schema
that already existed in the dev DB (generated with `prisma migrate diff --from-empty`
and marked applied via `prisma migrate resolve --applied 0_init`) — it was not run
against the data. When you provision a brand-new environment, `migrate deploy` will
execute `0_init` to build the full schema, then any later migrations in order.

## Seeding

Seed data is separate from migrations: `npm run db:seed` (runs `prisma/seed.ts`).
`migrate reset` (local only) will re-run migrations **and** the seed.
