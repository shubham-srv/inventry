# Inventory Management & Tracking — Technical Documentation

**Version:** 1.0 · **Applies to:** the `inventory-manage` application
**Audience:** the client's technical stakeholders — architects, IT/infrastructure, DBAs,
security reviewers, and any development team that will own or extend the system.

This is the system-of-record technical description of the application: what it does,
how it is built, how it is secured, how it is deployed, and how it is operated. It is
written to stand on its own — you should not need access to the delivery team to
understand or take ownership of the platform.

---

## Contents

1. [System overview](#1-system-overview)
2. [Users, roles and permissions](#2-users-roles-and-permissions)
3. [Functional capabilities](#3-functional-capabilities)
4. [Architecture](#4-architecture)
5. [Technology stack](#5-technology-stack)
6. [Data model](#6-data-model)
7. [Security model](#7-security-model)
8. [Notifications and scheduled jobs](#8-notifications-and-scheduled-jobs)
9. [Reporting, analytics and export](#9-reporting-analytics-and-export)
10. [Internationalisation](#10-internationalisation)
11. [Environments and deployment](#11-environments-and-deployment)
12. [Database change management](#12-database-change-management)
13. [Configuration reference](#13-configuration-reference)
14. [Operations](#14-operations)
15. [Non-functional characteristics](#15-non-functional-characteristics)
16. [Onboarding procedures](#16-onboarding-procedures)
17. [Extending the system](#17-extending-the-system)
18. [Repository layout](#18-repository-layout)
19. [Glossary](#19-glossary)
20. [Related documents](#20-related-documents)

**Appendices**

- [A — Master-data workbook specification](#appendix-a--master-data-workbook-specification)
  · the one-time data load: every sheet, column and validation rule
- [B — Provisioning inventory](#appendix-b--provisioning-inventory)
  · what must exist in Azure, the Key Vault secrets, and the pre-cutover checklist

---

## 1. System overview

### 1.1 Purpose

The system replaces spreadsheet- and email-based tracking of packaging and materials
inventory across a distributed supply network. It gives three groups of people one
shared, current picture of stock:

- **Growers** record what they physically have on hand, order more of it, and flag
  what is running out.
- **Vendors** report what they are holding, broken down by the grower it is
  earmarked for.
- **Internal staff** own the master data everyone else selects from, act on the
  shortages and requests those two groups raise, and report across the whole network.

The design goal throughout is that **each number has exactly one owner**. On-hand stock
is whatever the grower counted — it is never inferred from orders or receipts. Vendor
stock is whatever the vendor reported. Nothing in the system silently derives a
quantity that a human is accountable for.

### 1.2 The daily cycle

```
   GROWER                          INTERNAL                        VENDOR
   ------                          --------                        ------
   Submit on-hand counts  ───────► Low-inventory queue
   (per location, per day)         Missing-item requests
                                   Master data & mappings ───────► Report stock held,
   Raise orders to vendors         Thresholds & reminders          allocated per grower
   Mark received / cancelled       Reports & Excel export  ◄───────
   Flag low stock         ───────►
   Request a missing item ───────►
                                   Scheduled reminders ──────────► (email)
```

### 1.3 Key design decisions

These are the choices that most shape the system. They are stated up front because
they explain a lot of what follows.

| Decision | Rationale |
|---|---|
| **A quantity has no separate unit of measure.** An item is counted in its *material category* — an item in "Boxes" is counted in boxes. | Every count, order and threshold is then expressed in the same terms by construction. A per-item unit column could only ever disagree with the category. |
| **On-hand stock comes only from the grower's daily count.** Receiving an order does not increase inventory. | Receipts are recorded to score vendor reliability (short / damaged / over), not to move stock. One owner per number. |
| **Submissions are scoped to a grower *and a location*.** | A grower with several sites can have one site submitted and another still a draft, and each site's history stays independently correct. |
| **Packaging is descriptive.** Boxes, cases and pallets record what a quantity *occupies in transit*; they are never inventory and never change the quantity. | What is ordered is what is received. |
| **Master data is deactivated, never deleted.** Status flags (`Active`/`Inactive`) replace hard deletes. | History stays readable. A three-year-old submission still resolves the item it referenced. |
| **Bulk email is queued and paced, not sent inline.** Sign-in links are the one exception. | The mail provider's per-minute allowance is small; a burst of reminders sent inline would be rejected and silently lost. A 15-minute sign-in link cannot wait behind that queue, so it is sent immediately against reserved capacity. |

---

## 2. Users, roles and permissions

### 2.1 Roles

| Role | Audience | Signs in with | Sees |
|---|---|---|---|
| **SuperAdmin** | Internal | Microsoft Entra ID | Everything |
| **InternalAdmin** | Internal | Microsoft Entra ID | Everything |
| **Editor** | Internal | Microsoft Entra ID | Master data and packaging only |
| **GrowerUser** | External | Passwordless email link | Their own grower's data only |
| **VendorUser** | External | Passwordless email link | Their own vendor's data only |

`SuperAdmin` and `InternalAdmin` are currently equivalent in capability; the split
exists so that a narrower `InternalAdmin` can be introduced later without a data
migration.

### 2.2 Capability matrix

Permissions are expressed as **capabilities**, not as page-by-page checks. A role holds
a set of capabilities; every server-side entry point demands a capability.

| Capability | Covers | SuperAdmin | InternalAdmin | Editor | Grower | Vendor |
|---|---|:--:|:--:|:--:|:--:|:--:|
| `manage_master_data` | Items, commodities, categories, sub-categories, locations, countries | ✅ | ✅ | ✅ | — | — |
| `manage_conversions` | Packaging chains and vendor pack ratios | ✅ | ✅ | ✅ | — | — |
| `manage_growers_vendors` | Grower/vendor records, item authorisations, low-inventory queue, requests, item messages | ✅ | ✅ | — | — | — |
| `manage_users` | User onboarding, user↔grower/vendor mapping | ✅ | ✅ | — | — | — |
| `access_settings` | Reminder schedules, thresholds, audit log, email outbox | ✅ | ✅ | — | — | — |
| `view_reports` | Cross-network reports and Excel export | ✅ | ✅ | — | — | — |

Growers and vendors hold **no** capabilities. Their access is not a permission set — it
is a data scope, described in [§7.4](#74-data-isolation).

Reports are deliberately admin-only: they aggregate across the entire network and are
the intended surface for embedded BI, so widening them widens what a single compromised
account can read.

The authoritative definition is one small, dependency-free module — `lib/rbac.ts` — so a
reviewer can read the whole permission model in under a minute.

---

## 3. Functional capabilities

### 3.1 Grower (mobile-first)

| Capability | Detail |
|---|---|
| **Daily inventory submission** | Enter on-hand quantities for every item the grower is authorised for, at a chosen location. Supports **Draft** (saved, does not count) and **Submit** (counts, writes the ledger, notifies, updates progress). |
| **Low-stock flagging** | Tick an item during submission to raise a flag for internal review. Growers can also clear their own flag. |
| **Orders** | Raise an order for an item against any of that item's mapped vendors. Multiple open orders per item are allowed. Set and revise an expected delivery date. |
| **Receiving** | Mark an order **Received** (optionally recording a quantity mismatch as Short / Damaged / Over) or **Cancelled**. Same-day closures stay visible for the rest of the day, then drop off. |
| **Missing-item requests** | Ask internal staff to add an item that does not exist yet, with a commodity/category hint and free-text notes. Track the outcome. |
| **History** | Past submissions and their line detail, filterable. |
| **Dashboard** | Submission progress, current shortages, open orders, and item messages addressed to them. |
| **Item messages** | Read-only notices attached to an item by internal staff ("Retiring", "Increase stock", "Clear inventory", "Info"), shown in the grower's own language. |

### 3.2 Vendor

| Capability | Detail |
|---|---|
| **Stock reporting** | Report quantity held per item, with an optional per-grower allocation breakdown showing how much of that stock is earmarked for whom. |
| **History** | Past reports and their allocations. |
| **Dashboard** | Trends and totals for the vendor's own reported stock. |

### 3.3 Internal — action queues

| Screen | Purpose |
|---|---|
| **Low inventory → Flags** | Grower-raised flags awaiting review; reviewable with notes, which notifies the grower. |
| **Low inventory → Current** | A live computed report of every (grower, item) pair below its effective threshold — no queue, no state, always current. |
| **Item requests** | Missing-item requests, moved through Open → Reviewed / Fulfilled / Rejected with review notes. |
| **Item messages** | Author, schedule (start/end dates), target (all growers or a selected subset) and translate the notices growers see against an item. |

Each of these carries a live badge count in the navigation. Queues that need action are
styled to draw attention; ambient status counts deliberately stay quiet, so that an
always-on badge never trains people to ignore the urgent ones.

### 3.4 Internal — master data

Commodities · Material categories · Sub-categories · **Items** · Locations · Countries ·
Regions · Growers · Vendors · Packaging chains.

Items are the centre of gravity. An item carries its commodity, material category,
sub-category, country of origin, application method and status — and, editable from the
same form, its **grower authorisations** (who may count it) and **vendor mappings** (who
supplies it, and at what pack ratios).

Item IDs take the form `CC-MM-NNNNN` — commodity code, material category code, and a
five-digit sequence. On the one-time master-data load they are **supplied by the client
and used verbatim** ([Appendix A](#appendix-a--master-data-workbook-specification));
items created in the application afterwards have the ID **generated**, continuing from
the highest sequence in use. Either way the ID is permanent: it is the primary key that
every count, order and ledger row references.

### 3.5 Internal — configuration and oversight

| Screen | Purpose |
|---|---|
| **Users** | Onboard internal and external users; map a user to exactly one grower or vendor; set role, language and active status. |
| **Authorisations** | Which growers may count which items; which vendors supply which items, categories, countries and locations. |
| **Thresholds** | Per-item low-stock thresholds, with optional per-grower overrides that take precedence. |
| **Schedulers** | Reminder cadence (Daily / Weekly / Monthly / After *N* days) globally, with per-grower overrides. Includes a "run the check now" button. |
| **Audit logs** | Every create/update/delete/export, with actor, entity, timestamp and a before/after diff. |
| **Outbox** | Every notification the system produced, its status (Queued / Sending / Sent / Failed / Mocked), retry count, last error, and an HTML preview of the message. |

### 3.6 Internal — reports

Grower stock · Orders · Vendor stock · BI report registry · Excel export of any filtered
view. Covered in [§9](#9-reporting-analytics-and-export).

---

## 4. Architecture

### 4.1 Shape

The application is a **single deployable unit**: one containerised Next.js server that
renders the UI, executes business logic, and talks to the database. There is no separate
API tier and no client-side state store to keep in sync.

```
                      ┌──────────────────────────────────────────┐
   Browser  ─ HTTPS ─►│  Azure Container Apps                    │
   (desktop           │  ┌────────────────────────────────────┐  │
    + mobile)         │  │  Next.js server (standalone)       │  │
                      │  │   • Server-rendered pages          │  │
                      │  │   • Server Actions (mutations)     │  │
                      │  │   • /api/auth/*   /api/cron/*      │  │
                      │  │   • Email dispatch loop            │  │
                      │  └───────┬──────────────┬─────────────┘  │
                      └──────────┼──────────────┼────────────────┘
                                 │              │
                     Prisma ─────┤              ├──── Microsoft Entra ID (staff SSO)
                                 ▼              ├──── Azure Communication Services (email)
                        ┌────────────────┐      └──── Azure AI Translator (optional)
                        │   Azure SQL    │
                        └────────────────┘
                                 ▲
                                 │
                   ┌─────────────┴──────────────┐
                   │  Container Apps Jobs (cron)│
                   │   • daily reminders        │
                   │   • email dispatch safety  │
                   └────────────────────────────┘
```

### 4.2 Why this shape

- **Server-first rendering.** Pages are React Server Components: they query the database
  directly and stream HTML. Sensitive data is filtered before it is serialised, so a
  grower's browser never receives another grower's rows to hide with CSS.
- **Server Actions instead of a REST API.** Mutations are exported server functions
  invoked from forms. There is no publicly addressable mutation endpoint to enumerate,
  and no duplicated validation between a client and an API layer.
- **One process, no queue infrastructure.** The email outbox is a database table drained
  by a loop inside the same process, with a scheduled job as a safety net. This removes
  a broker from the deployment without losing the properties a queue provides.

### 4.3 Request lifecycle

A page request:

1. **Proxy** (Next.js 16's rename of middleware) checks that a session cookie is
   *present* and redirects to `/login` if not, preserving the requested path so the user
   lands where they were going. It also re-issues aging session cookies. This is an
   optimistic gate, deliberately cheap — it does not verify signatures or touch the
   database.
2. **Layout** performs the real check: verifies the cookie signature, loads the user from
   the database, confirms they are still active, and resolves their role and
   grower/vendor mapping.
3. **Page** requires a capability (internal screens) or resolves the caller's data scope
   (grower/vendor screens), queries only within it, and renders.

A mutation:

1. The form posts to a **Server Action**.
2. The action re-authenticates from scratch — it never trusts an identifier supplied by
   the client — and asserts the required role or capability.
3. Input is parsed and validated with **zod**.
4. The write executes, inside a transaction where several tables must move together.
5. An audit row is written; any resulting notification is **enqueued**, not sent.
6. Affected paths are revalidated so every open view reflects the change.

Steps 2 and 3 are not optional conveniences — they are the security boundary. Because a
Server Action is reachable by anyone who can reach the app, an action that trusted a
client-supplied `growerId` would be an authorisation bypass. Every action derives scope
from the session instead.

---

## 5. Technology stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router, Server Components, Server Actions) | Single deployable; standalone output for containers |
| UI | **React 19**, **Tailwind CSS v4**, **shadcn/ui**, Radix primitives | Accessible components, mobile-first for external users |
| Language | **TypeScript 5** (strict) | Compile-time checks enforced in CI |
| Data access | **Prisma 6** | Type-safe queries; raw SQL where a set-based query is materially better |
| Database | **Azure SQL / SQL Server** | Schema authored to be SQL Server-native |
| Validation | **zod 4** | Every action input; shared between form and server |
| Charts | **Recharts** | In-app dashboards |
| Spreadsheets | **ExcelJS** | Export and the master-data template |
| Email rendering | **React Email** | Localised HTML + plaintext parts |
| Tokens | **jose** | Signed session and sign-in link tokens |
| Identity | **MSAL Node** | Entra ID authorisation-code flow |
| Email transport | **Azure Communication Services** | |
| Container | Node 20 (Debian slim), multi-stage build, non-root runtime | |

### 5.1 Version pinning notes

- **Prisma is pinned to 6.x deliberately.** Prisma 7 removed `url` from the datasource
  block and requires a driver adapter; moving to it is a considered upgrade, not a
  routine bump.
- **The schema avoids SQL Server incompatibilities by design:** no native enums (status
  fields are strings with values centralised in one module and enforced by zod), and
  foreign keys use `NoAction` because SQL Server rejects multiple cascade paths. The only
  cascades are from a parent submission to its own child rows.

---

## 6. Data model

Around 40 tables in six groups. `schema.dbml` in the repository root renders as an ER
diagram at [dbdiagram.io](https://dbdiagram.io) if you want the visual form.

### 6.1 Identity and access

| Table | Holds |
|---|---|
| `Role` | The five reference roles |
| `User` | People. Exactly one optional `growerId` **or** `vendorId` establishes an external user's scope. Carries `preferredLocale` and `entraObjectId` (backfilled on first SSO login) |
| `MagicToken` | Issued passwordless sign-in links. Stores only the SHA-256 of the token nonce |

### 6.2 Master data

`Commodity` · `MaterialCategory` · `SubCategory` · `Item` · `Location` · `Country` ·
`Region` · `Grower` · `Vendor`

`Item` is the hub: commodity, material category, sub-category, country of origin,
application method, status. `Location` carries a type that gates where it may be used.
`Vendor` records lead time, payment terms (as "Net *N* days"), a home country and contact
details.

### 6.3 Relationships and authorisation

| Table | Expresses |
|---|---|
| `GrowerItemAuthorization` | Which items a grower may count |
| `GrowerLocation` | Which sites a grower operates |
| `ItemVendor` | Which vendors supply an item (and the packaging chain used) |
| `VendorMaterialCategory` | Which categories a vendor deals in |
| `VendorCountry` | Which countries a vendor supplies **to** (distinct from where they are based) |
| `VendorLocation` | Which sites a vendor serves |

All are soft-toggled with `isActive` rather than deleted, so history remains resolvable.

### 6.4 Transactions

| Table | Holds |
|---|---|
| `GrowerSubmission` | One per grower **per location per day**. Carries status, submitter, review fields and comments |
| `GrowerSubmissionDetail` | One row per item in that submission: quantity and low flag. Unique per (submission, item) |
| `Order` | A grower's order to a vendor: quantity, expected delivery, status, closure timestamp, and — on receipt — the received quantity and a mismatch note |
| `OrderPackLine` | An immutable per-level snapshot of what the order occupies, written once at creation |
| `VendorSubmission` / `VendorSubmissionDetail` / `VendorAllocation` | A vendor's report, its lines, and the per-grower split of each line |
| `MissingItemRequest` | Grower requests for items that do not exist yet |
| `LowInventoryFlag` | Grower-raised shortage flags and their review outcome |

`OrderPackLine` is stored as rows rather than JSON so BI tools can aggregate it directly,
and so that later edits to a vendor's pack ratios never rewrite historical orders.

### 6.5 Analytics

`InventoryLedger` is the fact table: one row per (date, grower, item, location) with the
final quantity, written when a submission is approved. It is shaped for BI consumption —
narrow, additive, and indexed on `(growerId, itemId, locationId, date)` and on `date`.

Because the ledger is rebuilt from the submission whenever that submission changes, the
ledger and the submission can never disagree.

### 6.6 Configuration and oversight

| Table | Holds |
|---|---|
| `ItemThreshold` | Low-stock threshold per item; `growerId = NULL` is the global default, a grower row overrides it |
| `SchedulerSetting` | Reminder cadence, global or per grower. A grower row replaces the global one wholesale — there is no field-level merge |
| `PackagingChain` / `PackagingChainLevel` / `VendorPackRatio` | The packaging hierarchy and each vendor's ratios |
| `AuditLog` | Actor, action, entity, and a JSON before/after diff |
| `NotificationLog` | The email **outbox** — see [§8](#8-notifications-and-scheduled-jobs) |
| `PowerBiReport` | Registry of BI reports and their embed URLs |
| `ItemMessage` / `ItemMessageTranslation` / `ItemMessageGrower` | Item notices, their translations, and their targeting |

### 6.7 Schema conventions

- Every table carries `createdBy` / `createdAt` / `updatedBy` / `updatedAt`. The actor
  columns are plain integers rather than foreign keys, to avoid dozens of back-relations
  on `User`; relationships that carry meaning (submitter, requester, audit actor) are
  modelled explicitly.
- Status and type columns are strings, with permitted values centralised in
  `lib/constants.ts` and enforced by zod at every write.
- Quantity columns are `Decimal`, never floating point.
- `User.entraObjectId` uniqueness is a **filtered** unique index rather than a plain
  one: SQL Server treats all `NULL`s as equal in a `UNIQUE` constraint, which would
  permit only one user without an Entra ID.

---

## 7. Security model

### 7.1 Two front doors, one session

Internal staff and external partners authenticate by completely different means, and both
converge on the same signed session cookie. Nothing downstream — roles, capabilities,
data isolation — knows or cares which door a user came through.

**Internal staff — Microsoft Entra ID.** Standard authorisation-code flow via MSAL. On
first sign-in the user's Entra object ID is matched to their pre-provisioned record and
stored. **Entra never creates users.** An account that is not already provisioned by an
administrator is refused, so directory membership alone grants nothing.

**Growers and vendors — passwordless email link.** The user enters their email; if it
matches an active user, a signed, single-use link valid for **15 minutes** is emailed.
Following it establishes the session.

Three properties of the link flow are worth a security reviewer's attention:

1. **Only a SHA-256 hash of the token nonce is stored.** A database compromise yields
   nothing that can be replayed as a sign-in.
2. **The response is neutral.** Requesting a link returns the same result whether or not
   the address exists, so the endpoint cannot be used to enumerate users.
3. **The link secret is separate from the session secret.** A 15-minute single-use
   sign-in token and a 7-day session cookie must never be interchangeable.

A credential-free user picker exists for demonstration and local development. It is
double-gated: it appears only when explicitly enabled **and** only outside production, so
a production image cannot expose it regardless of configuration.

### 7.2 Sessions

- Signed **JWT (HS256, jose)** in an `httpOnly`, `SameSite=Lax` cookie, `Secure` in
  production. The cookie holds a user id and nothing else.
- **7-day absolute lifetime**, with **sliding renewal**: past the halfway mark, a still-
  valid cookie is re-minted. Regular users are never logged out mid-week; idle sessions
  still lapse roughly seven days after the last visit.
- The cookie is never trusted on its own. Every protected render re-loads the user from
  the database, so deactivating a user takes effect on their next request rather than
  when their cookie happens to expire.

### 7.3 Authorisation

Capability checks (`requireCapability`) run **server-side, at the entry point of every
protected page and action**. Navigation is derived from the same capability model, so the
menu and the enforcement can never drift apart — but the menu is a convenience, and
removing an item from it is never the control.

### 7.4 Data isolation

This is the property the client's partners depend on most, so it is worth stating
precisely.

A grower or vendor user's scope is **read from their session, never from the request**.
Every query on their behalf is filtered by the `growerId` or `vendorId` on their user
record. There is no code path in which a grower supplies an identifier that selects whose
data is returned — tampering with a form field, a URL or a request body cannot widen
scope, because the identifier in the request is not the one used.

Because pages render on the server, another partner's rows are never sent to the browser
at all.

### 7.5 Secrets

- No secret is exposed to the browser. The framework's `NEXT_PUBLIC_` prefix — which
  inlines a value into the client bundle — is used **nowhere** in this codebase, and no
  client component reads environment variables.
- In Azure, every secret lives in **Key Vault**. The Container App references them by
  name through a **managed identity**; the deployment pipeline handles secret *names*
  only. No secret value reaches the build agent, the pipeline logs, or the container's
  revision template.
- The scheduled-job endpoints authenticate with a shared secret header. An **unset**
  secret denies rather than allows — missing configuration closes the door rather than
  removing it.

### 7.6 Auditing

Create, update, delete and export operations write an `AuditLog` row: who, what entity,
when, and a JSON before/after diff. Administrators can browse and filter this in-app. The
email outbox provides the parallel record for outbound communication: every message, its
status, retries and errors.

### 7.7 Transport and runtime

TLS terminates at Container Apps ingress; the container listens on an internal port only.
The database connection uses encryption with certificate-chain verification (the image
ships the CA bundle explicitly for this reason). The container runs as a **non-root**
user.

---

## 8. Notifications and scheduled jobs

### 8.1 What triggers email

| Trigger | Recipient |
|---|---|
| Sign-in link requested | The requesting user |
| Inventory submission received | Internal administrators |
| Missing-item request raised | Internal administrators |
| Request reviewed | The requesting grower |
| Low-inventory flag raised | Internal administrators |
| Low-inventory flag reviewed | The flagging grower |
| Order placed | The vendor |
| Submission overdue | The grower |

Every message is rendered as localised HTML **and** plaintext, in the **recipient's**
stored language — not the sender's, and not a browser cookie's, because most of these are
produced by background jobs that have no browser context.

### 8.2 Why email is queued

The mail provider caps how fast you can send, and the cap is low. The application's worst
burst is the daily reminder run — roughly one message per active grower, produced in one
go. Sent inline, one after another, that burst crosses the limit within the first handful
of growers; the provider starts rejecting, and a naive sender records those as failed and
moves on.

That is not slowness. **It is silent data loss** — which is what the queue exists to
prevent.

### 8.3 The outbox

Bulk and transactional mail never talks to the provider directly. It writes a `Queued`
row to `NotificationLog` and returns. A separate dispatcher claims rows and sends them.

Each dispatcher pass:

1. **Reclaims** rows a crashed pass left claimed — `Sending`, untouched for five minutes.
2. **Computes a budget** — how many sends the provider will still accept this minute and
   this hour. Counted from *attempts*, not successes: a rejected request spends the
   provider's allowance exactly like an accepted one.
3. **Claims a batch atomically**, ordered by priority then age, using a single
   `UPDATE … OUTPUT` under `ROWLOCK, UPDLOCK, READPAST`. Any number of replicas, cron
   hits and administrator button presses can overlap without sending anything twice.
4. **Sends**, recording each outcome.
5. On a throttle response, requeues honouring the provider's `Retry-After`, does **not**
   spend one of that message's retries — being throttled is not that message's fault —
   and ends the pass rather than pushing harder.

Failures retry after 1, 5, 15 and 60 minutes and stop at five attempts, with the reason
recorded and shown in the Outbox. Permanent rejections — a malformed address — fail
immediately rather than burning the budget four more times.

Two things drain the outbox: an in-process loop started when the server boots (interval
configurable, or disabled entirely), and a scheduled job as a safety net.

### 8.4 Sign-in links bypass the queue

Sign-in links are the one exception: they are sent **inline**, not queued. A link valid
for 15 minutes that leaves the building 20 minutes later is worthless, so it cannot wait
behind a hundred reminders.

That has a consequence worth understanding, because it is what one configuration setting
exists to manage. An inline send still spends the provider's allowance, so sign-in links
and the dispatcher compete for the same per-minute capacity. `EMAIL_INTERACTIVE_RESERVE`
holds back slots the bulk dispatcher will not spend, so a grower staring at a "check your
inbox" screen during the morning reminder run is not throttled behind it. With the
defaults, reminders drain at 3/minute and 2/minute stay free for people signing in.

Queued messages also carry a priority — auth 1, transactional 3, bulk 7, lower first — so
that ordering within the queue matches urgency.

### 8.5 Scheduled jobs

Two Container Apps Jobs authenticate to the application with the shared cron secret:

| Job | Endpoint | Cadence | Does |
|---|---|---|---|
| Reminders | `POST /api/cron/reminders` | Daily | Finds growers who are overdue against their cadence and **enqueues** one reminder each |
| Email dispatch | `POST /api/cron/email-dispatch` | Frequent | Drains the outbox; a safety net if the in-process loop is not running |

The reminder check enqueues only, so it returns in milliseconds however many growers are
overdue and never approaches a job timeout. Overdue growers receive **at most one
reminder per day**, enforced by checking what was already sent.

The same reminder logic is reachable from an administrator button in-app and from a
command-line script, so it can be exercised without waiting for a schedule.

---

## 9. Reporting, analytics and export

### 9.1 In-app reports

| Report | Shows |
|---|---|
| **Grower stock** | Current on-hand per grower/item/location, from the ledger |
| **Orders** | Orders across the network, filterable by status, grower, vendor, item and date |
| **Vendor stock** | Vendor-reported quantities with their per-grower allocations |
| **Currently low** | Every (grower, item) below its effective threshold, computed live |

"Currently low" is a genuinely non-trivial query and is written as raw SQL for two
reasons: current stock is the **latest ledger row per (grower, item, location)** summed
across locations — a naive "latest row per item" would silently report only whichever
location was written last — and the effective threshold is the grower-specific one when
present, otherwise the global default, resolved per row. Doing this in the ORM would mean
pulling the entire ledger into memory.

### 9.2 Excel export

Any filtered admin view exports to `.xlsx` with the filters applied — items, growers,
vendors, users, authorisations, master data, and the three reports above. Multi-sheet
workbooks with frozen, bold headers. Exports are audit-logged.

### 9.3 Business intelligence

`InventoryLedger` is deliberately shaped as a BI fact table (see [§6.5](#65-analytics)),
so an external tool can be pointed at the database directly.

In-app, a registry of report definitions (`PowerBiReport`) is maintained by
administrators, and the reports page renders **links to registered reports plus a live
14-day ledger trend chart**. Full in-page embedding with server-generated embed tokens is
the prepared next step — the data model, the access control (`view_reports` is admin-only
for exactly this reason) and the registry are in place; the embedding itself is not yet
wired.

---

## 10. Internationalisation

- **English and Spanish** ship today. Adding a language is a dictionary file plus one
  entry in a config module; nothing else in the application enumerates languages.
- Language is a **per-user preference** stored on the user record and mirrored into a
  cookie at sign-in, so a returning user gets their language even in a fresh browser.
- **Emails are localised to the recipient**, from stored data — correct even when the
  message originates in a background job. Where several administrators must be notified
  at once, they are grouped by language into one message per language.
- **Item message notes** are free text, so they cannot be pre-translated. When Azure AI
  Translator is enabled they are machine-translated **once, on save** — never per page
  view, so the translation API is called a handful of times a year rather than on every
  grower's page load. Machine output is flagged as unreviewed until an administrator
  edits it, because these notes drive real behaviour ("clear inventory") and a bad
  translation costs more than a missing one. With translation disabled, growers see the
  authored text.

---

## 11. Environments and deployment

### 11.1 Environments

| Environment | Purpose | Sign-in | Email |
|---|---|---|---|
| **Local** | Development and demonstration | Optional user picker, or real providers | Recorded to the in-app Outbox, nothing sent |
| **Staging** | Client acceptance, production-shaped | Entra + magic link | Live, to a restricted audience |
| **Production** | Live | Entra + magic link | Live |

Every integration has an offline fallback, so the complete application runs on a laptop
with no cloud account — a property that matters for onboarding developers and for
demonstrating without a network.

### 11.2 Azure footprint

| Resource | Role |
|---|---|
| Azure Container Apps | Hosts the web application (HTTPS ingress, autoscaling) |
| Azure Container Apps Jobs ×2 | Reminder cron and email-dispatch safety net |
| Azure Container Registry | Built images, shared between environments |
| Azure SQL Database | Application database |
| Azure Key Vault | All secrets |
| Azure Communication Services | Outbound email |
| Azure AI Translator | Optional, for item-message notes |
| Log Analytics + Application Insights | Logs, metrics, traces |

[Appendix B](#appendix-b--provisioning-inventory) has the full provisioning inventory:
sizing notes, the Key Vault secrets that must exist before the first deploy, the identity
and role assignments, and a pre-cutover checklist.

### 11.3 Container image

A multi-stage build producing a minimal runtime image:

1. **deps** — `npm ci` from the committed lockfile.
2. **builder** — generate the Prisma client, then build the application in standalone
   mode (a self-contained server with only the code actually reached).
3. **runner** — the standalone server, static assets and the Prisma engine, running as a
   **non-root** user on port 3000.

Build and runtime share the same Debian-slim base so the Prisma query engine compiled at
build time matches the runtime OS, and the image installs `ca-certificates` explicitly so
the engine can verify Azure SQL's certificate chain — a failure that would otherwise
surface only at runtime, because nothing in a build ever opens a database connection.

### 11.4 CI/CD

Azure DevOps, with a branch model of `dev` → `staging` → `master`:

| Stage | Runs on | Does |
|---|---|---|
| **Validate** | Every push and PR | `npm ci`, `prisma generate`, typecheck, lint, build |
| **Build** | Merge to `staging` | Builds the image in ACR, tagged by commit SHA and `:staging` |
| **Deploy → staging** | After Build | `prisma migrate deploy`, idempotent bootstrap, re-declare config, roll a new revision, smoke check |
| **Promote → production** | Merge to `master`, with approval | Resolves the tested image to its immutable digest and deploys **that**, then the same migrate/config/roll/smoke sequence |

Two properties are worth calling out:

**Build once, promote by digest.** The `master` merge commit is a different commit from
the `staging` one, so rebuilding on `master` would ship an image nobody tested —
different dependency resolution, different base-image patch level. Production instead
resolves the `:staging` tag to its `sha256` digest and deploys the digest. Provably the
same bytes that passed acceptance.

**Configuration is declared in the pipeline; values live in Key Vault.** Each deploy
re-declares the application's secrets as Key Vault *references* and maps environment
variables onto them. The pipeline handles names, never values.

---

## 12. Database change management

Schema changes are **migration files, committed to the repository** and applied by
`prisma migrate deploy` in the deployment pipeline. Migrations are reviewed like code.

Two rules govern them:

**Never mix workflows.** `prisma db push` (schema sync, no history) is for local
experiments only. Shared and production databases only ever see `migrate deploy`.

**Migrations are not rollback-safe — use expand/contract.** Deploy the additive change
first (add the column, backfill, ship code that writes both), and only remove the old
shape in a later release once nothing reads it. A migration that drops a column cannot be
undone by redeploying the previous image.

Renames deserve particular care on SQL Server: a naive rename is emitted as
drop-and-create, which destroys data. The correct pattern uses `sp_rename` with the right
object class, and hand-written migrations of this kind are **replayed against a throwaway
database loaded with representative data** before they are considered done.

`MIGRATIONS.md` covers the workflow, safe renames, and recovering from drift.

---

## 13. Configuration reference

All configuration is environment variables. In Azure they are Key Vault references; the
container never holds a literal secret in its revision template.

### 13.1 Required

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQL Server connection string |
| `APP_URL` | Public origin. Used to build absolute links and images in email — emails have no page context, so a relative path resolves to nothing in an inbox |
| `SESSION_SECRET` | Signs session cookies |
| `MAGIC_LINK_SECRET` | Signs sign-in links. **Must differ from `SESSION_SECRET`** |
| `CRON_SECRET` | Shared secret for the scheduled-job endpoints |

### 13.2 Provider switches

| Variable | Values | Effect |
|---|---|---|
| `AUTH_PROVIDER` | `local` \| `entra` | `local` additionally shows the demo user picker — non-production only |
| `EMAIL_PROVIDER` | `local` \| `acs` | `local` records to the Outbox without sending |
| `TRANSLATION_PROVIDER` | `local` \| `azure` | `local` stores notes exactly as authored |

### 13.3 Integrations

| Variable | Required when |
|---|---|
| `AZURE_AD_TENANT_ID`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_REDIRECT_URI` | Entra sign-in. Leave the redirect URI unset to derive it from `APP_URL` |
| `ACS_CONNECTION_STRING`, `ACS_SENDER_ADDRESS` | `EMAIL_PROVIDER=acs` |
| `AZURE_TRANSLATOR_KEY`, `AZURE_TRANSLATOR_REGION`, `AZURE_TRANSLATOR_ENDPOINT` | `TRANSLATION_PROVIDER=azure` |

### 13.4 Email throughput

Read only when `EMAIL_PROVIDER=acs`. Defaults are the conservative figures for an
Azure-managed sender domain.

| Variable | Default | Meaning |
|---|---|---|
| `EMAIL_RATE_PER_MINUTE` | 5 | Provider's per-minute allowance for your sender domain |
| `EMAIL_RATE_PER_HOUR` | 100 | Per-hour allowance |
| `EMAIL_INTERACTIVE_RESERVE` | 2 | Per-minute slots bulk dispatch will not spend |
| `EMAIL_DISPATCH_BATCH` | 25 | Ceiling on messages claimed per pass |
| `EMAIL_DISPATCH_INTERVAL_MS` | 30000 | In-process drain interval; `0` disables it |

Set these to what the provider **actually allows**, not to what you wish it allowed. They
are how the application knows when to stop; setting them too high just moves the failure
back into the provider.

#### Raising throughput

The limits depend on your sender domain, and the provider has revised them more than
once — **confirm the current figures in the Azure Communication Services resource before
go-live** rather than trusting this table:

| Sender domain | Per minute | Per hour |
|---|---|---|
| Azure-managed (`*.azurecomm.net`) | ~5 | ~30–100 |
| Verified custom domain | ~30 | ~300–500 |

Worked example — 100 growers on an Azure-managed domain with the defaults: 5 − 2 reserved
= 3/minute, so the reminder run drains in about 33 minutes. The per-hour cap of ~100 is
the binding constraint: 100 growers sits exactly at the ceiling, and anything more spills
into the next hour — correctly, via backoff, but late.

Two levers, most leverage first:

1. **Verify a custom sender domain.** Roughly six times the headroom on both limits, and
   — the part that matters more — mail from `@*.azurecomm.net` is routinely spam-foldered.
   For growers receiving sign-in links, **deliverability is the bigger problem of the
   two**: a link that lands in junk is a support call, whereas a rate limit is only a
   delay. This is DNS work on your own domain (SPF, DKIM, DMARC), not a code change, and
   it gates nothing else — so start it early and run on the managed domain meanwhile.
2. **File a quota-increase request.** The send limits are soft and are raised through an
   Azure support quota request. It is free and takes days, so file it early rather than
   discovering the ceiling on go-live morning.

Neither requires a code change. Once the new limits are live, raise `EMAIL_RATE_PER_*`
to match and redeploy.

### 13.5 First-run bootstrap

| Variable | Purpose |
|---|---|
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_FIRST_NAME`, `BOOTSTRAP_ADMIN_LAST_NAME` | Creates reference roles, lookups and the **first administrator** on an empty database. Idempotent, and run by the pipeline on every deploy |

---

## 14. Operations

### 14.1 Routine tasks

| Task | How |
|---|---|
| Check email delivery | Admin → Settings → **Outbox**. Filter on `Failed`; `lastError` carries the provider's message |
| Force a reminder run | Admin → Settings → **Schedulers** → *Run reminder check now* |
| Drain the outbox now | Admin → Settings → **Outbox** → dispatch button |
| Review who changed what | Admin → Settings → **Audit logs**, filtered by entity or user |
| Deactivate a user | Admin → **Users** → set inactive. Takes effect on their next request |
| Add an item | Admin → **Items** → new. The ID is generated; set authorisations and vendor mappings on the same form |
| Raise email throughput | Verify a custom sender domain, then raise `EMAIL_RATE_PER_*` |

### 14.2 Monitoring

Application Insights collects request telemetry, dependency calls, exceptions and traces;
Container Apps surfaces revision health and scale. Worth alerting on:

- Container App revision unhealthy or restart loop
- `NotificationLog` rows in `Failed` status trending upward
- Azure SQL DTU/vCore saturation
- Reminder job non-zero exit
- Certificate and Entra client-secret expiry dates

### 14.3 Troubleshooting

| Symptom | Likely cause |
|---|---|
| Sign-in links not arriving | `EMAIL_PROVIDER` still `local`; missing ACS connection string; check the Outbox for `Failed` rows |
| "Microsoft sign-in isn't configured" | Entra variables absent. The magic-link box keeps working regardless |
| Entra login rejected for a real employee | The user is not provisioned. Entra never creates users — add them under Admin → Users |
| Cron endpoints return 401 | `CRON_SECRET` mismatch between the job and the app, or unset (which denies by design) |
| "Drift detected" on deploy | Schema changed outside migrations. See `MIGRATIONS.md` |
| Prisma TLS failure at runtime only | CA certificates missing from the image — nothing in a build opens a DB connection, so this only surfaces live |
| Email throttled or delayed | Expected under provider limits. The queue paces itself; check the Outbox rather than assuming loss |

### 14.4 Backup and recovery

Azure SQL provides automated backups with point-in-time restore inside the configured
retention window; configure retention and geo-redundancy to the client's RPO/RTO. The
application holds **no state outside the database** — no uploaded files, no local disk,
no in-memory session store — so restoring the database restores the system. Redeploying
the container image is sufficient to rebuild the application tier.

---

## 15. Non-functional characteristics

**Performance.** Pages are server-rendered and query only what they display. The heavy
cross-network queries are set-based SQL rather than in-memory aggregation, and the ledger
is indexed for exactly the access patterns the reports use.

**Scalability.** The application server is stateless — sessions are signed cookies, the
outbox is a table — so Container Apps can scale replicas horizontally without sticky
sessions. The outbox claim query is written so that concurrent dispatchers do not send
the same message twice, and a dispatcher that crashes mid-pass has its claim expire
rather than stranding messages.

**Availability.** Container Apps rolls a new revision and health-checks it before shifting
traffic; a failed deployment leaves the previous revision serving. Scheduled jobs are
idempotent and safe to re-run.

**Data integrity.** Foreign keys are enforced in the database; multi-table writes run in
transactions; quantities are decimal; the ledger is rebuilt from its submission so the
two cannot diverge.

**Accessibility.** Built on Radix primitives with keyboard navigation and ARIA semantics;
light and dark themes; external-facing screens are mobile-first, which is where growers
actually use them.

**Maintainability.** Strict TypeScript with typecheck and lint enforced in CI; validation
schemas shared between form and server; a permission model small enough to audit by
reading one file.

---

## 16. Onboarding procedures

### 16.1 Initial master-data load

Master data is loaded once from a structured Excel workbook. Generate the blank template —
which carries the same rules as column notes and dropdowns, so it can mostly be filled in
from the file alone — with:

```bash
npx tsx scripts/generate-master-data-template.ts   # -> master-data-template.xlsx
```

**[Appendix A](#appendix-a--master-data-workbook-specification) is the full
specification**: every sheet, every column, the load order, validation rules, the item ID
format, and what each location type gates.

### 16.2 Adding a grower

1. **Admin → Growers** — create the grower with its primary email, status and language.
2. **Admin → Locations** and **Mappings → Growers** — record the grower's sites.
3. **Mappings → Growers** — authorise the items this grower may count.
4. *(Optional)* **Settings → Thresholds** — per-grower threshold overrides.
5. *(Optional)* **Settings → Schedulers** — a per-grower reminder cadence. Remember that
   a grower row replaces the global one wholesale, so it must be complete on its own.
6. **Admin → Users** — create the user with role `GrowerUser`, mapped to this grower.

The user signs in immediately via a passwordless link; no password is ever issued.

### 16.3 Adding a vendor

1. **Admin → Vendors** — create the vendor with contact details, home country, lead time
   and payment terms.
2. **Mappings → Vendors** — items supplied, material categories, supply countries,
   locations served.
3. *(Optional)* **Admin → Packaging** — pack ratios for the vendor's item mappings.
4. **Admin → Users** — create the user with role `VendorUser`, mapped to this vendor.

### 16.4 Adding an internal user

**Admin → Users** — create with role `SuperAdmin`, `InternalAdmin` or `Editor`, using
their **organisational email**. They sign in with Microsoft. The record must exist first;
Entra membership alone grants no access.

---

## 17. Extending the system

Where to make the most common kinds of change:

| Change | Where |
|---|---|
| New status or type value | `lib/constants.ts` (the single source), plus the zod schema that validates it |
| New permission or role | `lib/rbac.ts` for the capability, `lib/nav.ts` for the navigation it unlocks |
| New business operation | A server action in `lib/actions/`, following the existing pattern |
| New email | A helper in `lib/email/notify.ts` and a template in `lib/email/templates/` |
| New language | A dictionary in `lib/i18n/dictionaries/` and an entry in `lib/i18n/config.ts` |
| New report | A query module in `lib/admin/`, a page under `app/(app)/admin/reports/`, and a sheet in the export module |
| Schema change | Edit `prisma/schema.prisma`, generate a migration, review the SQL, follow expand/contract |

The consistent shape of a server action is the important convention: **authenticate,
authorise, validate, write, audit, notify, revalidate**. Skipping the first two steps
because "the page already checks" is exactly the mistake the pattern exists to prevent —
an action is independently reachable.

---

## 18. Repository layout

```
app/
  (auth)/login              sign-in: Microsoft, magic link, optional demo picker
  (app)/admin               internal screens — master data, mappings, users,
                            queues, reports, settings, export
  (app)/grower              submit, on-order, history, requests, dashboard
  (app)/vendor              submit with allocations, history, dashboard
  api/auth                  Entra login/callback, magic-link request/consume
  api/cron                  secret-protected reminder + email-dispatch endpoints

lib/
  actions/                  server actions, one module per domain, zod-validated
  auth/                     session, Entra, magic link, sliding renewal
  admin/                    shared list filters, reports, Excel export
  email/                    notify() enqueues · dispatch paces and sends · acs/ is the wire
  scheduler/                reminder logic, shared by job, button and CLI
  i18n/                     dictionaries, server/client helpers, machine translation
  packaging/                pure packaging arithmetic
  rbac.ts                   the entire permission model
  constants.ts              every enum-like value in the system

components/                 UI components (shadcn/ui + application components)
prisma/                     schema, migrations, seed, production bootstrap
scripts/                    reminder runner, master-data template generator

README.md                   what this is, and how to run it locally
TECHNICAL-DOCUMENTATION.md  this document
MIGRATIONS.md               schema-change workflow
schema.dbml                 ER diagram source (renders at dbdiagram.io)
.env.example                every configuration variable, documented inline
Dockerfile                  multi-stage container build
azure-pipelines.yml         CI/CD definition
master-data-template.xlsx   the blank master-data workbook (Appendix A)
```

---

## 19. Glossary

| Term | Meaning |
|---|---|
| **Grower** | An organisation that holds and consumes inventory and submits on-hand counts |
| **Vendor** | An organisation that supplies items and reports the stock it holds |
| **Item** | A trackable material or packaging product, identified as `CC-MM-NNNNN` |
| **Material category** | The item's class — and its unit of count. An item in "Boxes" is counted in boxes |
| **Authorisation** | A grower's permission to count a specific item |
| **Mapping** | A vendor's association with an item, category, country or location |
| **Submission** | One grower's counts for one location on one day |
| **Ledger** | The append-only fact table of final quantities, built for BI |
| **Threshold** | The quantity below which an item counts as low, globally or per grower |
| **Flag** | A grower-raised shortage marker awaiting internal review |
| **Packaging chain** | The container hierarchy an ordered quantity occupies in transit — descriptive only |
| **Outbox** | The `NotificationLog` table, used as a real send queue |
| **Item message** | An administrator-authored notice shown to growers against an item |
| **Capability** | A named permission held by a role and demanded by a page or action |

---

## 20. Related documents

The documentation set is three files. Everything else a reviewer needs is in the code
itself, at the paths given below.

| Document | Covers |
|---|---|
| `README.md` | What the application is, and how to run it locally from a clean machine |
| **This document** | Architecture, data model, security, deployment, operations, and the appendices below |
| `MIGRATIONS.md` | Migration workflow, safe renames on SQL Server, resolving drift |

Authoritative in-repository references:

| File | Is the source of truth for |
|---|---|
| `.env.example` | Every configuration variable, documented inline |
| `prisma/schema.prisma` | The database schema |
| `schema.dbml` | ER diagram source — paste into [dbdiagram.io](https://dbdiagram.io) |
| `lib/rbac.ts` | The complete permission model |
| `lib/constants.ts` | Every enum-like value in the system |
| `azure-pipelines.yml` | The CI/CD definition, commented throughout |
| `Dockerfile` | The container build |

---

# Appendix A — Master-data workbook specification

The format for the **one-time** master-data load: items, growers, vendors, users, the
lookups those depend on, and the mappings between them.

```bash
npx tsx scripts/generate-master-data-template.ts   # -> master-data-template.xlsx
```

The workbook carries the same rules as column notes and dropdowns, so it can mostly be
filled in from the file alone. This appendix is the reference.

**Not in scope.** Thresholds, scheduler settings, item messages, packaging chains and any
transactional data (submissions, orders, the ledger) are configured in the application
after go-live, not uploaded.

## A.1 How to fill it in

One sheet per entity, one row per record. **Row 1 is the header — do not rename, reorder
or delete columns.** Extra columns are ignored; missing ones fail the import. Leave
optional cells blank rather than writing "N/A" or "-", except where a literal `N/A` is a
listed option.

Sheets reference each other **by name** — grower name, location name, category code — not
by database id. The one exception is items, referenced by their ID. Every name used in a
mapping sheet must exist in the sheet that defines it, spelled identically. Leading and
trailing spaces are trimmed; everything else must match exactly, **including case**.

## A.2 Load order

Sheets are processed in this order, because each depends on the ones above it. The whole
load runs in a single transaction, so a failure rolls everything back — nothing is ever
left half-loaded.

```
1  Regions
2  Countries
3  Commodities
4  MaterialCategories
5  SubCategories          -> MaterialCategories
6  Locations              -> Regions, Countries
7  Items                  -> Commodities, MaterialCategories, SubCategories, Countries
8  Growers
9  Vendors                -> Countries
10 Users                  -> Growers, Vendors
11 GrowerLocations        -> Growers, Locations
12 GrowerItems            -> Growers, Items
13 VendorItems            -> Vendors, Items
14 VendorCategories       -> Vendors, MaterialCategories
15 VendorSupplyCountries  -> Vendors, Countries
16 VendorLocations        -> Vendors, Locations
```

## A.3 Sheets

### 1. Regions

Geographic grouping. Used by locations only.

| Column | Required | Type | Rules |
|---|---|---|---|
| `RegionName` | ✅ | text | Unique. e.g. `West`, `Central`, `East` |

### 2. Countries

Shared lookup: an item's country of origin, a location's country, a vendor's
headquarters, and vendor supply-to lists.

| Column | Required | Type | Rules |
|---|---|---|---|
| `CountryName` | ✅ | text | Unique. e.g. `USA`, `Mexico` |
| `SelectableAsRealCountry` | | `Yes` / `No` | Default `Yes`. Set `No` for placeholders like `N/A` — they stay valid as an item's origin but are hidden from location, vendor and supply-to pickers |

Include an `N/A` row with `No` if any item has no meaningful origin.

### 3. Commodities

The crop or product family. **The code becomes the first segment of every item ID**, so
choose carefully — item IDs are permanent.

| Column | Required | Type | Rules |
|---|---|---|---|
| `CommodityCode` | ✅ | text | Exactly 2 characters, A–Z uppercase. Unique. e.g. `AP` |
| `CommodityName` | ✅ | text | e.g. `Asparagus` |

### 4. MaterialCategories

The packaging material family. **The code becomes the second segment of every item ID.**

| Column | Required | Type | Rules |
|---|---|---|---|
| `MaterialCategoryCode` | ✅ | text | Exactly 2 characters, A–Z uppercase. Unique. e.g. `BX` |
| `MaterialCategoryName` | ✅ | text | e.g. `Boxes` |

### 5. SubCategories

| Column | Required | Type | Rules |
|---|---|---|---|
| `MaterialCategoryCode` | ✅ | text | Must exist in **MaterialCategories** |
| `SubCategoryName` | ✅ | text | Unique within its category. e.g. `Cardboard Boxes` |

### 6. Locations

Physical sites. **A grower cannot submit inventory without at least one location**, so
this sheet is not optional in practice.

| Column | Required | Type | Rules |
|---|---|---|---|
| `LocationName` | ✅ | text | Unique |
| `LocationType` | ✅ | list | See below |
| `RegionName` | | text | Must exist in **Regions** |
| `CountryName` | | text | Must exist in **Countries**, and be selectable |
| `CommodityFocus` | | text | Free text, e.g. `Asparagus` |
| `KeyPersonnel` | | text | Free text |
| `Notes` | | text | |

**Location types decide which side may use the site.** A grower-side type cannot be
mapped to a vendor and vice versa.

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

> ⚠️ **Confirm this list before filling in the workbook.** Adding, renaming or re-siding a
> type is a one-line change in `LOCATION_TYPES` in `lib/constants.ts` — but only before
> data is loaded against it.

### 7. Items

**Item IDs are supplied by the client and used verbatim.** They are the primary key,
referenced by every count, order and ledger row, and can never be changed afterwards.

| Column | Required | Type | Rules |
|---|---|---|---|
| `ItemID` | ✅ | text | Format `CC-MM-NNNNN` — see below |
| `ItemName` | ✅ | text | e.g. `Corrugated Box 40x30` |
| `CommodityCode` | ✅ | text | Must exist in **Commodities** |
| `MaterialCategoryCode` | ✅ | text | Must exist in **MaterialCategories** |
| `SubCategoryName` | ✅ | text | Must exist in **SubCategories** *under this MaterialCategoryCode* |
| `CountryOfOrigin` | ✅ | text | Must exist in **Countries** |
| `ApplicationMethod` | | list | `Machine`, `Hand`, `Machine/Hand`, `N/A` |
| `Status` | ✅ | list | `Active`, `Inactive`, `Review` |
| `LegacyItemRef` | | text | Your own identifier from the previous system. Carried through for reconciliation; not used as a key |
| `Notes` | | text | |

#### The ItemID format

```
AP  -  BX  -  00001
│      │      │
│      │      └─ 5-digit sequence, zero-padded, 00001–99999
│      └──────── MaterialCategoryCode, must match this row's column
└─────────────── CommodityCode, must match this row's column
```

The importer enforces:

1. Matches `^[A-Z]{2}-[A-Z]{2}-\d{5}$` exactly.
2. The first segment equals this row's `CommodityCode`.
3. The second equals this row's `MaterialCategoryCode`.
4. The full ID is unique across the sheet.

Rules 2 and 3 exist because the ID would otherwise lie about the item — an ID reading
`AP-BX-` on a row whose category is `BG` misleads every human who reads it, and the
application has no way to detect it later.

> **The sequence need not be contiguous**, and gaps are fine. Items created in the
> application afterwards continue from the highest number in use, across all
> commodity/category combinations — so importing up to `AP-BX-00250` means the next item
> created in the UI is `00251`, whatever its category. Numbers are never reused.

#### There is no unit column — the category *is* the unit

An item's quantities are counted in its **material category**. An item in a category
named `Boxes` is counted in boxes everywhere: the grower's daily count, the vendor's
report, every order, and its low-stock threshold. That is why there is no
`UnitOfMeasure` column — a second, independently chosen unit could only ever contradict
the category.

**So name categories after the thing you count.** If you count rolls of labels, the
category should be `Rolls`, not `Labels`. Renaming a category later relabels every
quantity ever recorded against its items — it does not convert them — so a rename after
go-live changes what the history *reads as*, while the numbers stay exactly as entered.

### 8. Growers

| Column | Required | Type | Rules |
|---|---|---|---|
| `GrowerName` | ✅ | text | Unique. Used as the key in mapping sheets |
| `PrimaryEmail` | | email | Where submission and reminder emails go |
| `Status` | ✅ | list | `Active`, `Inactive`, `Pending` |
| `PreferredLocale` | ✅ | list | `en` or `es` — language for emails to `PrimaryEmail` |

### 9. Vendors

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

A vendor's sites live in **VendorLocations**, not here — a vendor can operate several.

### 10. Users

People who sign in. **No passwords** — internal staff authenticate through Microsoft
(Entra), growers and vendors through an emailed sign-in link. The email is therefore the
identity and must be exact.

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

> A `GrowerUser` sees **only** the grower named in `GrowerName` — that is the
> data-isolation boundary ([§7.4](#74-data-isolation)). Two people at the same grower get
> two rows with the same `GrowerName`. Someone who genuinely covers two growers needs two
> accounts with different email addresses; one row cannot span both.

### 11. GrowerLocations

Which sites each grower counts inventory at. **A grower with no row here cannot submit
anything**, so every active grower needs at least one.

| Column | Required | Type | Rules |
|---|---|---|---|
| `GrowerName` | ✅ | text | Must exist in **Growers** |
| `LocationName` | ✅ | text | Must exist in **Locations** and be a **grower-usable type** |

One row per pair. Repeat the grower name for each of its sites.

### 12. GrowerItems

Which items each grower is authorised to count. A grower only ever sees items listed
here.

| Column | Required | Type | Rules |
|---|---|---|---|
| `GrowerName` | ✅ | text | Must exist in **Growers** |
| `ItemID` | ✅ | text | Must exist in **Items** |

### 13. VendorItems

Which items each vendor can supply. Drives what a vendor reports on, and which vendors a
grower can order an item from.

| Column | Required | Type | Rules |
|---|---|---|---|
| `VendorName` | ✅ | text | Must exist in **Vendors** |
| `ItemID` | ✅ | text | Must exist in **Items** |

### 14. VendorCategories

Which material categories each vendor supplies. Narrows the item list when an
administrator edits a vendor.

| Column | Required | Type | Rules |
|---|---|---|---|
| `VendorName` | ✅ | text | Must exist in **Vendors** |
| `MaterialCategoryCode` | ✅ | text | Must exist in **MaterialCategories** |

> Keep this consistent with **VendorItems** — if a vendor supplies item `AP-BX-00001` its
> categories should include `BX`. The importer warns on a mismatch rather than failing,
> because the two are edited separately later.

### 15. VendorSupplyCountries

Which countries each vendor can ship **to**. Distinct from `HeadquartersCountry`, which
is where they are based.

| Column | Required | Type | Rules |
|---|---|---|---|
| `VendorName` | ✅ | text | Must exist in **Vendors** |
| `CountryName` | ✅ | text | Must exist in **Countries**, and be selectable |

### 16. VendorLocations

Which sites each vendor operates from. A vendor's **region(s)** are read from here; there
is no region column on the vendor sheet.

| Column | Required | Type | Rules |
|---|---|---|---|
| `VendorName` | ✅ | text | Must exist in **Vendors** |
| `LocationName` | ✅ | text | Must exist in **Locations** and be a **vendor-usable type** |

> Unlike **GrowerLocations**, a vendor with no row here still works — they simply show no
> location and no region. Vendors report one figure per item per day regardless of how
> many sites they run.

## A.4 Validation summary

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

**Advisory** (warn, do not fail)
- an active grower with no `GrowerLocations` row — they cannot submit
- an active grower with no `GrowerItems` rows — they will see an empty form
- a vendor supplying items outside its declared categories
- an item no grower is authorised for

## A.5 After the upload

Configured in the application, not the workbook:

| What | Where |
|---|---|
| **Thresholds** | `/admin/settings/thresholds` — a quantity only, in the item's category |
| **Reminder schedules** | `/admin/settings/schedulers` — a Global row is created by the bootstrap |
| **Packaging chains and pack ratios** | `/admin/packaging`, then per vendor-item on `/admin/mappings/vendors` |
| **Item messages** | `/admin/item-messages` |

Reference data the bootstrap creates by itself, whether or not it appears in the
workbook: the five **roles**, and the first administrator from `BOOTSTRAP_ADMIN_EMAIL`
(see `prisma/bootstrap.ts`).

---

# Appendix B — Provisioning inventory

What has to exist in Azure before the application can be deployed, and what each piece is
for. This is the contract between the infrastructure and the application; the
click-by-click for any one resource is standard Azure documentation.

## B.1 Resources, per environment

Staging and production are separate resource groups with the same shape, with one
deliberate exception noted below.

| Resource | Sizing note |
|---|---|
| **Container Apps Environment** | One per environment; hosts the web app and both jobs |
| **Container App** (web) | External HTTPS ingress, target port 3000. Min 1 replica in production |
| **Container Apps Job** — reminders | Scheduled daily, at the hour the client wants growers nudged |
| **Container Apps Job** — email dispatch | Scheduled frequently; a safety net for the in-process loop |
| **Azure SQL Database** | Basic tier is adequate for staging; size production to the grower count |
| **Key Vault** | Holds every secret in B.2 |
| **Azure Communication Services** + Email Communication Service | With a sender domain — see B.4 |
| **Log Analytics workspace** + **Application Insights** | Shared by both jobs and the app |
| **Azure AI Translator** | Only if `TRANSLATION_PROVIDER=azure` |

**The Container Registry is deliberately shared** between staging and production, in the
staging resource group. That is what makes promotion a retag rather than a cross-registry
copy, and it is what lets production deploy the exact image digest staging tested
([§11.4](#114-cicd)).

## B.2 Key Vault secrets

Every one of these must exist before the first deploy, because the Container App declares
them as Key Vault references at deploy time and a missing reference fails the revision.

| Secret | Notes |
|---|---|
| `DATABASE-URL` | Also needed by the pipeline agent, for `prisma migrate deploy` |
| `SESSION-SECRET` | Long random string |
| `MAGIC-LINK-SECRET` | Long random string, **different from the session secret** |
| `CRON-SECRET` | Shared with both Container Apps Jobs |
| `AZURE-AD-TENANT-ID` | |
| `AZURE-AD-CLIENT-ID` | |
| `AZURE-AD-CLIENT-SECRET` | **Has an expiry — calendar it** |
| `ACS-CONNECTION-STRING` | |
| `ACS-SENDER-ADDRESS` | |
| `AZURE-TRANSLATOR-KEY` | Only if translation is enabled |

Generate the two signing secrets with a CSPRNG, not by hand:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## B.3 Identity and access

- The **Container App** needs a system-assigned managed identity with **Key Vault Secrets
  User** on the vault. This is what lets it resolve secret references without any secret
  value passing through the pipeline.
- The **deployment service principal** needs rights to update the Container App and its
  jobs, and to read from the registry. Note that Contributor alone is not sufficient if
  the pipeline also assigns roles — that requires User Access Administrator or an
  equivalent.
- The **SQL firewall** must admit the Container Apps environment's outbound IPs and the
  build agent (for migrations).

## B.4 Email sender domain

The application will run against an Azure-managed domain (`*.azurecomm.net`) out of the
box, which is the right way to start. Before external users depend on it, verify a custom
domain on the client's own DNS — see [§13.4](#134-email-throughput) for why
deliverability, not the rate limit, is the reason that matters.

## B.5 Pre-cutover checklist

Before production traffic:

- [ ] All ten secrets present in the production Key Vault
- [ ] `APP_URL` set to the real public origin — email links and logos resolve against it,
      so a stale value sends recipients to the wrong host
- [ ] `AUTH_PROVIDER` **not** `local` (the demo picker is also blocked by the production
      build, but do not rely on two things when one is free)
- [ ] `EMAIL_PROVIDER=acs`, with the sender address verified and a test message received
- [ ] Entra app registration's redirect URI matches the production origin exactly
- [ ] Both Container Apps Jobs created, scheduled, and carrying the same `CRON_SECRET` as
      the app — **the pipeline does not create or update the jobs**
- [ ] `EMAIL_RATE_PER_MINUTE` / `_HOUR` set to what the provider actually allows
- [ ] Azure SQL backup retention and geo-redundancy set to the client's RPO/RTO
- [ ] First administrator bootstrapped and able to sign in via Entra
- [ ] Master data loaded ([Appendix A](#appendix-a--master-data-workbook-specification))
- [ ] Alerts configured per [§14.2](#142-monitoring)
- [ ] Entra client secret expiry recorded in a calendar
