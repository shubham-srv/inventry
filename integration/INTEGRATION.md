# Azure Integrations (drop-in)

Everything in `integration/` is **excluded from the app build** (see `tsconfig.json`
`exclude`) and does nothing until you wire it in. The app ships with pluggable
providers so the local demo runs fully offline; these are the production paths.

The guiding principle: **swap one layer, leave the rest untouched.**

| Concern | Local (default) | Production | Switch |
|---|---|---|---|
| Auth (internal) | user-picker + signed cookie | Entra ID (MSAL) → same cookie | wire routes; single-tenant app reg |
| Auth (external) | user-picker + signed cookie | Magic-link email → same cookie | wire routes; `MagicToken` + `MAGIC_LINK_SECRET` |
| Email | `NotificationLog` rows (Outbox) | Azure Communication Services | `EMAIL_PROVIDER=acs` |
| Scheduler | "Run reminder check now" button / `npm run reminders` | Azure Container Apps **Cron Job** → `npm run reminders` (or `POST /api/cron/reminders`) | schedule the ACA Job |

---

## 1. Entra ID authentication

The session layer (`lib/auth/session.ts`: signed cookie + `getCurrentUser`) stays
the same. Entra only changes **how a user proves identity**; on callback we match
the Entra email to a provisioned `User` row and call the existing
`createSession(user.id)`.

Steps:
1. `npm i @azure/msal-node`
2. Set in `.env`:
   ```
   AUTH_PROVIDER=entra
   AZURE_AD_TENANT_ID=...
   AZURE_AD_CLIENT_ID=...
   AZURE_AD_CLIENT_SECRET=...
   AZURE_AD_REDIRECT_URI=https://your-app/api/auth/callback
   ```
3. Create route handlers that re-export the reference functions in
   [`entra/auth-routes.ts`](entra/auth-routes.ts):
   - `app/api/auth/login/route.ts` → `export { login as GET } from "@/integration/entra/auth-routes"`
   - `app/api/auth/callback/route.ts` → `export { callback as GET } from "..."`
   - `app/api/auth/logout/route.ts` → `export { logout as POST } from "..."`
   (or copy the file into `lib/auth/entra/` and import from there)
4. Replace the `/login` user-picker with a single "Sign in with Microsoft" link to
   `/api/auth/login`. Admins still provision users (email must match the Entra UPN).

> Authorization/data-isolation is unchanged — it's already driven by the `User`
> row's role + grower/vendor mapping, not by how the user logged in.

## 2. ACS email

The sender already exists at [`lib/email/acs/sender.ts`](../lib/email/acs/sender.ts)
and is selected by `EMAIL_PROVIDER=acs`.

1. `npm i @azure/communication-email`
2. Set in `.env`:
   ```
   EMAIL_PROVIDER=acs
   ACS_CONNECTION_STRING=endpoint=https://...;accesskey=...
   ACS_SENDER_ADDRESS=DoNotReply@your-verified-domain.azurecomm.net
   ```
3. Set `APP_URL=https://your-app.example` so the email button links resolve — a
   scheduled send has no request origin to derive it from.

Every `notify(...)` call sends a real email and still records a `NotificationLog`
row (status `Sent`/`Failed`) so the Outbox stays accurate. Emails are rendered with
**React Email** (HTML part + plaintext fallback), localized to the **recipient's**
stored language (`Grower.preferredLocale` / `Vendor.preferredLocale`; each admin's
`User.preferredLocale` for the item-request fan-out) — never a request cookie, so
scheduled sends are localized correctly.

## 3. Scheduler — Azure Container Apps Cron Job

Reminder logic lives in [`lib/scheduler/reminders.ts`](../lib/scheduler/reminders.ts).
It's **headless by design** (no request/cookie context) and reads each recipient's
language from the DB, which is exactly what a scheduled job needs.

**Primary path (Container Apps):** run it as an ACA **Job** on a cron schedule
(`--cron-expression`). Two equivalent options:

- **Reuse the app image**, set the job command to `npm run reminders` — this runs
  [`scripts/run-reminders.ts`](../scripts/run-reminders.ts) → `runReminderCheck()`
  directly against the DB (needs `DATABASE_URL`, `EMAIL_PROVIDER=acs`, `ACS_*`,
  `APP_URL`). No HTTP hop.
- **Or** keep the app container running and have the job `curl` the secret-protected
  endpoint `POST /api/cron/reminders` (header `x-cron-secret: $CRON_SECRET`).

The per-grower/global cadence *rules* stay configured in-app under Settings →
Schedulers; the ACA cron only decides how often the check *runs*.

Local test of the endpoint:
```bash
curl -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/reminders
```

> **Legacy alternative (Azure Functions Timer):** the Function in
> [`azure-functions/`](azure-functions) calls the same endpoint on a timer — kept
> for reference if you run on App Service instead of Container Apps.

## 4. Magic-link authentication (external users)

Passwordless email sign-in for growers & vendors. Internal staff use Entra (§1); both
converge on the **same** session cookie, so authorization is unchanged. Reference code:
[`magic-link/magic-link-routes.ts`](magic-link/magic-link-routes.ts) (request/consume) and
[`magic-link/sliding-session.ts`](magic-link/sliding-session.ts) (rolling 7-day session).

Two tokens — don't confuse them: a **15-min single-use LINK token** (emailed) vs. the
**7-day SESSION cookie** (`createSession`). Different secrets + a `purpose` claim keep them
non-interchangeable.

To activate:
1. **Add the `MagicToken` model** to `prisma/schema.prisma` (snippet is in the header of
   `magic-link-routes.ts`), add `magicTokens MagicToken[]` to `model User`, then
   `npm run db:migrate`.
2. **Install ACS email** (shared with §2): `npm i @azure/communication-email`.
3. **Set env** (secrets → Key Vault in prod — docs/azure-staging-setup.md §8/§10c):
   ```
   MAGIC_LINK_SECRET=<long random string, distinct from SESSION_SECRET>
   APP_URL=https://your-app            # used to build the link
   ACS_CONNECTION_STRING=...           # already set for §2
   ACS_SENDER_ADDRESS=DoNotReply@...   # already set for §2
   ```
4. **Wire route handlers**:
   - `app/api/auth/magic/request/route.ts` → `export { requestLink as POST } from "@/integration/magic-link/magic-link-routes"`
   - `app/api/auth/magic/consume/route.ts` → `export { consumeLink as GET } from "..."`
   (or copy the file into `lib/auth/` and import from there)
5. **Add the email form** to `/login` (an email input that POSTs to
   `/api/auth/magic/request`), alongside the "Sign in with Microsoft" button.
6. **(Recommended) sliding session** so daily users aren't logged out every 7 days: copy
   `sliding-session.ts` into `lib/auth/` and either export its `middleware` from root
   `middleware.ts`, or call `slideSession(req, res)` from your existing middleware. Keep
   `SESSION_COOKIE`/`MAX_AGE`/secret in sync with `lib/auth/session.ts`.

Security baked into the reference: single-use (burned on consume), prior links invalidated
on new request, neutral response (no email enumeration), only a token **hash** stored, and
external-only (internal roles are refused — they use Entra).
