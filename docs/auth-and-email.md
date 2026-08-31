# Authentication & email — how it works

This replaces the old `integration/INTEGRATION.md`, which described these as
drop-in reference files waiting to be wired up. They are wired up. This is what
is actually running.

| Concern | Local default | Production | Controlled by |
|---|---|---|---|
| Auth — internal staff | demo user-picker | Entra ID (MSAL) | always live; picker needs `AUTH_PROVIDER=local` **and** non-production |
| Auth — growers & vendors | magic link (link printed to console) | magic link over email | always live; needs `MAGIC_LINK_SECRET` |
| Email | `NotificationLog` rows, status `Mocked` | queued, then sent by the dispatcher | `EMAIL_PROVIDER` |
| Reminder schedule | admin button / `npm run reminders` | daily Container Apps job → `POST /api/cron/reminders` | the job's cron expression |
| Email sending | in-app loop every 30s | same, plus a 15-minute Container Apps job as a safety net | `EMAIL_DISPATCH_INTERVAL_MS` |

The organising idea: **every sign-in path ends at the same
`createSession(user.id)`**. Roles, capabilities and grower/vendor data isolation
are driven by the `User` row, never by how someone logged in — so adding or
changing an auth method touches only the door, not the building.

---

## 1. Two audiences, two doors, one session

```
                        /login
              ┌───────────┴────────────┐
  internal staff                    growers & vendors
  "Sign in with Microsoft"          email box
        │                                 │
  /api/auth/login                  /api/auth/magic/request
        │  (state + PKCE)                 │  (15-min single-use link)
  Entra ID                         /api/auth/magic/consume
        │                                 │
  /api/auth/callback                      │
        └───────────┬─────────────────────┘
                    ▼
        createSession(user.id)      lib/auth/session.ts
                    ▼
        role + grower/vendor mapping decides everything else
```

Both doors reject anyone without an active `User` row. **Authenticating is not
the same as having access** — admins provision users in the users page, and that
is the gate, on any Entra tier.

### Internal staff — Entra ID (`lib/auth/entra.ts`)

`/api/auth/login` mints a random `state` and a PKCE verifier, keeps both in a
signed 10-minute `entra_tx` cookie, and redirects to Microsoft with only the
derived challenge. The callback will not proceed unless the returned `state`
matches that cookie — without it the endpoint would accept any authorization
code anyone posted to it.

On callback we match Entra's immutable object id (`oid`) first, falling back to
the admin-provisioned email and **backfilling `User.entraObjectId`**, so a later
email or UPN change cannot lock someone out.

Signing out sends internal users on to the tenant's `end_session_endpoint`.
Dropping our own cookie is not enough: the tenant SSO session survives it, and
the next "Sign in with Microsoft" click would silently sign the same person
straight back in.

Required: `AZURE_AD_TENANT_ID`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`.
`AZURE_AD_REDIRECT_URI` is optional — it defaults to `APP_URL` +
`/api/auth/callback`; set it explicitly when it must match a registration
exactly. If none of these are set, the Microsoft button reports that it is not
configured and the magic-link box keeps working.

App-registration steps (single-tenant, `User.Read`, redirect URI, optional
assignment gate) are in [azure-staging-setup.md §10a](azure-staging-setup.md).

### Growers & vendors — magic link (`lib/auth/magic-link.ts`)

Two tokens, deliberately not interchangeable:

|  | Magic link | Session cookie |
|---|---|---|
| Lifetime | 15 minutes | 7 days, sliding |
| Uses | exactly one | many |
| Secret | `MAGIC_LINK_SECRET` | `SESSION_SECRET` |
| Claim | `purpose: "magic-link"` | `userId` only |

Security properties, all of which are load-bearing:

- **Single use** — burned on consume, and requesting a new link invalidates any
  outstanding one.
- **Only a hash is stored.** `MagicToken.tokenHash` is the SHA-256 of a nonce;
  the database never sees anything redeemable.
- **No account enumeration.** The request endpoint answers identically whether
  or not the address exists. The only different answer is a 500 when *our*
  mailer fails, which reveals nothing about the address and which the user needs
  in order to retry. Do not "improve" the login page by validating the address
  against `User` first — that hands over the customer list.
- **External roles only.** Internal staff are refused; they have Entra.
- **The link is never persisted.** See §2.

Locally, with no mail provider configured, the link is printed to the server
console — the flow is fully testable without Azure.

### Sliding sessions

`lib/auth/sliding-session.ts`, composed into `proxy.ts` (Next 16's rename of
middleware). A cookie past the halfway mark of its 7-day life is re-issued, so
regular users are never logged out mid-week while idle sessions still lapse
about a week after the last visit. It runs on the Edge runtime, so it uses
`jose` only — keep `SESSION_COOKIE`, `MAX_AGE` and the secret in sync with
`lib/auth/session.ts`.

### The demo picker

`/login` also lists every seeded user and signs in as whoever you click, with no
credential of any kind. It renders only when `AUTH_PROVIDER=local` **and**
`NODE_ENV !== "production"`, and `loginAs` in `lib/auth/dummy.ts` re-checks both
independently — hiding a form does not close a server action, which is a
reachable endpoint whether or not anything renders it. The Dockerfile bakes
`NODE_ENV=production`, so a deployed image cannot expose it even if
`AUTH_PROVIDER` were wrong.

---

## 2. Email

`lib/email/notify.ts` renders every message with React Email (HTML + plaintext)
in the **recipient's** stored language — `Grower.preferredLocale`,
`Vendor.preferredLocale`, or each admin's `User.preferredLocale` — never a
request cookie, so scheduled sends are localized correctly.

**`notify()` does not send.** It inserts a `NotificationLog` row and returns:
`Queued` when `EMAIL_PROVIDER=acs`, `Mocked` otherwise. `lib/email/dispatch.ts`
does the sending, paced to the provider's limits. Two consequences worth
knowing:

- Interactive server actions no longer block on a mail round-trip.
- A throttled message is delayed, not lost. This is the whole point — see
  [email-delivery.md](email-delivery.md).

**Sign-in links are the one exception.** `notifyMagicLink()` sends inline,
because a 15-minute link delivered from behind a queue is worthless and the
person is watching a "check your inbox" screen. Its log row keeps the subject,
recipient and outcome but **not the body** — that contains a live credential and
the Outbox page is readable by every admin. It is also not requeued on failure:
the user simply asks again, which mints a fresh link.

Layers:

```
lib/email/notify.ts        renders + enqueues (and sends sign-in links inline)
lib/email/dispatch.ts      claims, paces, retries, records outcomes
lib/email/acs/transport.ts the ACS wire call; knows nothing about the database
lib/email/dispatch-loop.ts the 30s timer, started from instrumentation.ts
```

---

## 3. Scheduling

Reminder rules — global and per-grower cadences — stay configured in-app under
**Settings → Schedulers**. The Container Apps jobs only decide how often things
*run*:

| Job | Cron | Endpoint |
|---|---|---|
| `caj-reminders-*` | `0 8 * * *` | `POST /api/cron/reminders` |
| `caj-email-dispatch-*` | `*/15 * * * *` | `POST /api/cron/email-dispatch` |

Both authenticate with the `x-cron-secret` header against `CRON_SECRET`; an
unset secret denies rather than allows. Setup is in
[azure-staging-setup.md §9](azure-staging-setup.md).

The reminder job only enqueues, so it returns in milliseconds however many
growers are overdue — its replica timeout is never in play. The dispatch job is
a safety net: the running app drains the queue every 30 seconds on its own, and
this catches the case where that process is not up.

Locally:

```bash
curl -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/reminders
curl -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/email-dispatch
```

---

## 4. Secrets

Seven app secrets live in Key Vault and reach the container as references, never
values — the pipeline handles secret *names* only. See
[azure-staging-setup.md §8](azure-staging-setup.md).

| Key Vault secret | Env var | Notes |
|---|---|---|
| `database-url` | `DATABASE_URL` | |
| `session-secret` | `SESSION_SECRET` | signs the 7-day session cookie |
| `magic-link-secret` | `MAGIC_LINK_SECRET` | **must differ** from `session-secret` |
| `azure-ad-client-secret` | `AZURE_AD_CLIENT_SECRET` | expires in 6–24 months; set a rotation reminder |
| `acs-connection-string` | `ACS_CONNECTION_STRING` | |
| `cron-secret` | `CRON_SECRET` | shared with both Container Apps jobs |
| `azure-translator-key` | `AZURE_TRANSLATOR_KEY` | only read when `TRANSLATION_PROVIDER=azure` |

`APP_URL` and `AZURE_AD_REDIRECT_URI` are derived from the Container App's
ingress FQDN by the pipeline, so they cannot drift from the real hostname.
