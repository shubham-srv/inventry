# Production checklist

Everything staging has, **except ACR**. Assumes staging is working and you hold
**User Access Administrator** on the subscription, so role assignments are not a
blocker. Full concepts live in [azure-staging-setup.md](azure-staging-setup.md) —
this file is only the delta.

---

## Start these first (they depend on other people)

1. **Entra app registration** `inventory-app-production` — client's IT or an
   Application Administrator. Single-tenant; redirect URI
   `https://<prod-fqdn>/api/auth/callback`. Separate from staging so a staging
   secret leak or misconfig cannot reach production sign-in, and so testers can
   have staging without production.
2. **ACS custom sender domain** — needs SPF/DKIM/TXT records from whoever owns
   the client's DNS. The free `*.azurecomm.net` domain is fine for staging;
   production email should come from the client's own domain or it lands in spam.

Everything below is an afternoon of clicking you control. These two are not.

---

## Share with staging — do NOT duplicate

| Resource                      | Why                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **ACR** `acrinventorystaging` | Promotion is a retag of the same registry. A second registry would mean a rebuild, which breaks the byte-identical guarantee. |
| **Log Analytics workspace**   | Optional. Cheaper and allows cross-env queries. Split it only if "nobody outside ops reads prod logs" becomes a requirement.  |

> The ACR is named `...staging` but is now shared infrastructure living in the
> staging RG. Registries cannot be renamed. If that bothers you, or if you want
> prod to not depend on a resource in the staging RG, `az resource move` it to
> `rg-inventory-shared` — the login server is derived from the registry _name_,
> so nothing breaks and no image is re-pushed. Cheapest to do before go-live.

---

## Duplicate for production

| Resource                       | Suggested name                                                 |
| ------------------------------ | -------------------------------------------------------------- |
| Resource group                 | `rg-inventory-production`                                      |
| Key Vault (RBAC mode)          | `kv-inv-prd-xxxx`                                              |
| SQL logical server + database  | `sql-inventory-production-xxxx` / `sqldb-inventory-production` |
| Communication Services + Email | `acs-inventory-production` (custom domain)                     |
| Application Insights           | `appi-inventory-production` (point at the shared workspace)    |
| Container Apps Environment     | `cae-inventory-production`                                     |
| Container App (web)            | `ca-inventory-web-production`                                  |
| Container App Job (cron)       | `caj-reminders-production`                                     |
| User-assigned managed identity | `id-inventory-production`                                      |

**SQL tier:** staging is Basic (5 DTU). Production should be **S1 or higher** —
Basic's ~30 concurrent workers will not survive the morning submission burst.
Keep `replicas × Prisma pool ≤ ~20` of whatever tier you pick.

**Backups:** staging uses locally-redundant. Production should be
geo-redundant, and confirm the point-in-time restore window with the client.

---

## Key Vault — 10 secrets, all required before the first deploy

**7 declared by the pipeline as Container App references:**

`database-url` · `session-secret` · `acs-connection-string` · `cron-secret` ·
`magic-link-secret` · `azure-ad-client-secret` · `azure-translator-key`

**3 more read by the variable group** (for `db:bootstrap` on the agent):

`bootstrap-admin-email` · `bootstrap-admin-first-name` · `bootstrap-admin-last-name`

⚠️ **If any of the 7 is missing from the vault the revision fails to start** —
the container never runs, so its log stream is empty and the real error is in
**Revisions → the failed revision → status**. Create every one, even with a
placeholder value, before the first run. This also applies to staging.

Underscores are illegal in Key Vault secret names — these are all hyphenated,
and the pipeline maps them onto the underscored env vars the app reads.

Generate fresh values for production — never copy staging's. `session-secret`
and `magic-link-secret` must differ from each other.

### Azure AI Translator

No Translator resource is created by
[azure-staging-setup.md](azure-staging-setup.md) — it is only needed when
`translationProvider` is flipped to `azure`. Until then `azure-translator-key`
can hold a placeholder: `lib/i18n/machine-translate.ts` checks both the provider
switch **and** the key before calling out, and returns `{ ok: false }` rather
than throwing, so item messages still save with the authored text.

`AZURE_TRANSLATOR_ENDPOINT` is deliberately never set — unset means the global
endpoint, which is what you want unless the client needs a regional one.

---

## Role assignments

| Principal                 | Role                   | Scope                                           |
| ------------------------- | ---------------------- | ----------------------------------------------- |
| `id-inventory-production` | Key Vault Secrets User | production Key Vault                            |
| `id-inventory-production` | AcrPull                | `acrinventorystaging` _(cross-RG)_              |
| `azure-production-sc` SP  | Key Vault Secrets User | production Key Vault _(for the variable group)_ |

**Key Vault Secrets User**, not _Key Vault Reader_ — Reader is management-plane
and cannot read secret values. This is the most common silent failure.

Attach the identity to the app (the grant alone is not enough):

```bash
UAMI=$(az identity show -n id-inventory-production -g rg-inventory-production --query id -o tsv)
az containerapp identity assign -n ca-inventory-web-production -g rg-inventory-production --user-assigned "$UAMI"
az containerapp registry set -n ca-inventory-web-production -g rg-inventory-production \
  --server acrinventorystaging.azurecr.io --identity "$UAMI"
```

---

## The cron job is not touched by the pipeline

`caj-reminders-production` is a separate resource the pipeline never updates —
it runs `curlimages/curl`, not your image. Wire it by hand, once:

- Attach the **same** `id-inventory-production` UAMI (no extra role assignment
  needed — that is the main win of a user-assigned identity over a system one).
- Add `cron-secret` as a Key Vault reference, mapped to `CRON_SECRET`.
- **Update the curl URL to the production FQDN.** Copying the job definition
  from staging and forgetting this means production's cron silently hits
  staging — the job still exits 0, so nothing alerts you.
- **Run now** once and confirm the execution exits 0.

---

## Azure DevOps

- **Service connection** `azure-production-sc`, scoped to
  `rg-inventory-production`. Do **not** widen the staging connection to
  subscription scope instead.
- **Variable group** `inventory-production-secrets`, linked to the production
  vault, exposing `database-url` + the three `bootstrap-admin-*` values (real
  client admin, not a test account).
- **Environment** `inventory-production` with a **required approver**. The
  approval sits before the migrate step because migrations are not
  rollback-safe.

> The production stage uses **two** connections on purpose: the ACR steps stay on
> `azure-staging-sc` because the registry lives in the staging RG, while the
> deploy steps use `azure-production-sc`. Already wired in the YAML.

---

## Before go-live (app-side, not infra)

- [ ] Copy `integration/magic-link/login-page.tsx` over `app/(auth)/login/page.tsx`
- [ ] Copy `magic-link-form.tsx` to `components/auth/`
- [ ] **Delete `lib/auth/dummy.ts`** — the demo picker logs in as whoever you click
- [ ] Add the `MagicToken` model + migration; wire the 4 auth route handlers
- [ ] `npm i @azure/msal-node @azure/communication-email`
- [ ] Flip `authProvider` to `entra` in the YAML

⚠️ Until the first three are done, **any public URL of this app is wide open** —
the demo login page lets anyone sign in as any seeded user, including SuperAdmin.
That applies to the staging URL you already have.

---

## Turning it on

1. Fill in every `TODO` in the `# ---- production ----` variables block of
   [azure-pipelines.yml](../azure-pipelines.yml).
2. Set `productionEnabled` to `true`.
3. Merge through `dev → staging → master`.

---

## Checklist

- [ ] Entra app registration created; client secret in prod Key Vault
- [ ] ACS custom domain verified and connected
- [ ] All 9 production resources created
- [ ] All 10 secrets in the production Key Vault (7 app + 3 bootstrap)
- [ ] 3 role assignments made; UAMI attached to the app + registry
- [ ] `azure-production-sc` created and authorized for all pipelines
- [ ] `inventory-production-secrets` variable group resolving (padlock + "last refreshed")
- [ ] `inventory-production` environment has a required approver
- [ ] `prisma migrate deploy` run once against the prod DB
- [ ] Cron job wired: same UAMI, `cron-secret`, **production** FQDN in the curl
- [ ] Container App on the real image, **port 3000**, managed identity auth
- [ ] Demo login page removed, `lib/auth/dummy.ts` deleted
- [ ] YAML TODOs filled, `productionEnabled: true`
