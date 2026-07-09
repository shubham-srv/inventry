# Azure Integrations (drop-in)

Everything in `integration/` is **excluded from the app build** (see `tsconfig.json`
`exclude`) and does nothing until you wire it in. The app ships with pluggable
providers so the local demo runs fully offline; these are the production paths.

The guiding principle: **swap one layer, leave the rest untouched.**

| Concern | Local (default) | Production | Switch |
|---|---|---|---|
| Auth | user-picker + signed cookie | Entra ID (MSAL) → same cookie | `AUTH_PROVIDER` + wire routes |
| Email | `NotificationLog` rows (Outbox) | Azure Communication Services | `EMAIL_PROVIDER=acs` |
| Scheduler | "Run reminder check now" button / `npm run reminders` | Azure Timer Function → `/api/cron/reminders` | deploy the Function |

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
That's it — every `notify(...)` call now sends a real email and still records a
`NotificationLog` row (status `Sent`/`Failed`) so the Outbox stays accurate.

## 3. Azure Timer Function (scheduler)

Reminder logic lives in [`lib/scheduler/reminders.ts`](../lib/scheduler/reminders.ts)
and is exposed via the secret-protected `POST /api/cron/reminders`. The Function in
[`azure-functions/`](azure-functions) just calls that endpoint on a timer.

Local test of the endpoint:
```bash
curl -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/reminders
```

Deploy the Function (separate project):
```bash
cd integration/azure-functions
cp local.settings.json.example local.settings.json   # set APP_URL + CRON_SECRET
npm i && npm run build
func start                 # local
# or: func azure functionapp publish <your-function-app>
```
Adjust the cadence in `src/functions/reminders.ts` (`schedule` ncrontab). The
per-grower/global cadence *rules* are configured in-app under Settings → Schedulers.
