# Azure DevOps setup — build, migrate, deploy

Click-by-click setup for the pipeline in [`azure-pipelines.yml`](../azure-pipelines.yml).

This is the **CI/CD half**. The Azure resources it deploys *into* are created in
[azure-staging-setup.md](azure-staging-setup.md) — do that first, or at least
§1–§9, because several steps here need names and secrets that come from it.
[§13 of that guide](azure-staging-setup.md) summarises the pipeline design and
the reasoning (build-once-promote-by-digest, expand/contract migrations); this
file is the mechanical "where do I click" companion.

---

## 0. What you are building

```
push to dev                 ->  Validate only (no deploy)
PR dev -> staging   (merge) ->  Validate -> Build image -> Deploy STAGING
PR staging -> master (merge)->  Validate -> [approval] -> Promote SAME image to PROD
```

Four stages, and the pipeline will not run at all until **six** things exist in
Azure DevOps. That is the whole of this document:

| # | Thing | Why the pipeline needs it |
|---|---|---|
| 1 | Project + repo | somewhere to run |
| 2 | Three branches (`dev`, `staging`, `master`) | the triggers key off them |
| 3 | ARM service connection | authenticates `AzureCLI@2` tasks to your subscription |
| 4 | Variable group linked to Key Vault | supplies `DATABASE_URL` and the bootstrap admin vars |
| 5 | Environments (`inventory-staging`, `inventory-production`) | where the production **approval** lives |
| 6 | Branch policies | makes Validate actually block a bad merge |

> **Time:** about 45 minutes if you have the permissions. If you do not, see
> [§8 Permissions](#8-permissions-read-this-before-you-start) — that is the step
> most likely to stop you, so skim it now.

---

## 1. Project and repository

1. Go to <https://dev.azure.com> and sign in with the work account.
2. If there is no organization yet: **New organization** → name it → pick the
   region closest to your team.
3. **+ New project**
   - **Project name:** `inventory-management`
   - **Visibility:** Private
   - **Advanced → Version control:** Git
   - **Advanced → Work item process:** Agile (irrelevant to CI, pick anything)
4. **Create**.

### Pushing the existing repo

From the work laptop, in the project: **Repos → Files**. If the repo is empty
Azure shows push instructions. For an existing local repo:

```bash
git remote add azure https://dev.azure.com/<org>/inventory-management/_git/inventory-management
git push azure --all
git push azure --tags
```

If you are keeping GitHub as the origin and only mirroring to ADO, keep both
remotes and push to each — or set up **Repos → Import repository** instead and
let ADO pull from GitHub.

> **Personal laptop note.** Nothing in this file needs to run on the machine
> where you write code. The pipeline builds from the ADO repo; you only need to
> be able to push to it.

---

## 2. Branches

The pipeline's `trigger:` block watches `staging` and `master`; `dev` is
validate-only via the `pr:` trigger.

1. **Repos → Branches → New branch**
   - `dev` from `master`
   - `staging` from `master`
2. **Repos → Branches**, hover `dev` → **⋯ → Set as default branch**. Day-to-day
   work targets `dev`, and making it default stops accidental PRs into `master`.

You should now have `dev` (default), `staging`, `master`.

---

## 3. ARM service connection

This is how the pipeline's `AzureCLI@2` tasks authenticate to your subscription.
Its name must match `azureSubscription` at the top of the YAML — currently
`azure-staging-sc`.

1. **Project settings** (bottom-left gear) → **Service connections** →
   **Create service connection**.
2. **Azure Resource Manager** → **Next**.
3. **Workload Identity federation (automatic)** — preferred; no secret to rotate.
   Falls back to **Service principal (automatic)** if federation is unavailable.
4. Scope:
   - **Scope level:** Subscription
   - **Subscription:** the one holding `rg-inventory-staging`
   - **Resource group:** `rg-inventory-staging` — scope it to the RG, not the
     whole subscription. The pipeline never touches anything outside it.
5. **Service connection name:** `azure-staging-sc` (must match the YAML exactly)
6. Tick **Grant access permission to all pipelines** — otherwise the first run
   pauses waiting for someone to authorise it.
7. **Save**.

> **If "automatic" is greyed out or fails** you lack app-registration rights in
> Entra. See [§8](#8-permissions-read-this-before-you-start).

### Later: a second connection for production

When you stand up production, repeat this scoped to `rg-inventory-production`,
name it `azure-production-sc`, and either add a `prodAzureSubscription` variable
to the YAML or reuse `azure-staging-sc` scoped at subscription level. **Do not**
silently widen the staging connection to subscription scope — that is how a
staging pipeline ends up able to write to production.

---

## 4. Variable group linked to Key Vault

The deploy stage needs `DATABASE_URL` (to run `prisma migrate deploy`) and the
three `BOOTSTRAP_ADMIN_*` values (for `db:bootstrap`). These live in Key Vault
from [azure-staging-setup.md §4](azure-staging-setup.md); the variable group is
how the pipeline reads them without copying secrets into ADO.

1. **Pipelines → Library → + Variable group**
2. **Variable group name:** `inventory-staging-secrets` (must match the YAML)
3. Toggle **Link secrets from an Azure key vault as variables** → on
4. **Azure subscription:** `azure-staging-sc` → **Authorize**
5. **Key vault name:** your staging vault (e.g. `kv-inventory-staging-xxxx`)
6. **+ Add** and tick:
   - `DATABASE-URL`
   - `BOOTSTRAP-ADMIN-EMAIL`
   - `BOOTSTRAP-ADMIN-FIRST-NAME`
   - `BOOTSTRAP-ADMIN-LAST-NAME`
7. **Save**.

> ⚠️ **Key Vault secret names cannot contain underscores.** They are
> `DATABASE-URL` with hyphens; the pipeline maps them to the underscored env
> vars the app expects. If you named the vault secrets with underscores they
> will not have saved — recreate them with hyphens.

8. **Pipeline permissions** tab → **+** → grant your pipeline access (or open
   **⋯ → Security** and allow all pipelines). Without this the run fails with
   *"variable group could not be found"* — which is misleading; it exists, you
   just cannot read it.

**Verify the link works before running the pipeline:** reopen the group. Each
secret should show a padlock and *"Last refreshed"*. An error here means the
service connection's identity lacks **Key Vault Secrets User** on the vault —
[azure-staging-setup.md §8](azure-staging-setup.md) covers granting it.

---

## 5. Environments (and the production approval)

Environments are what `environment:` in the YAML deploys to, and — more
importantly — **the only place approvals can be configured.** They cannot be
expressed in YAML.

1. **Pipelines → Environments → New environment**
   - **Name:** `inventory-staging`
   - **Resource:** None
   - **Create**
2. Repeat for **`inventory-production`**.
3. Open **inventory-production** → **⋯ (top right) → Approvals and checks** →
   **+ → Approvals**:
   - **Approvers:** yourself and at least one other person
   - **Advanced → Allow approvers to approve their own runs:** leave **off** for
     a real two-person rule; turn it on if you are a team of one
   - **Timeout:** 30 days
   - **Instructions:** *"Confirm staging has been validated. Approving runs
     database migrations, which are not rollback-safe."*
   - **Create**

> **Why the approval sits before migrate.** Rolling the container image back
> does not roll the schema back. Once `migrate deploy` runs you are committed —
> see the expand/contract warning in
> [azure-staging-setup.md §13](azure-staging-setup.md).

Optionally add a **Business Hours** check on production so releases cannot land
at 2am.

---

## 6. Create the pipeline

1. **Pipelines → Pipelines → New pipeline**
2. **Azure Repos Git** → your repo
3. **Existing Azure Pipelines YAML file**
4. **Branch:** `dev` · **Path:** `/azure-pipelines.yml` → **Continue**
5. On the review screen choose **Save** (the dropdown next to Run) — **do not
   run it yet**. It would trigger a build before the branch policies exist.
6. **⋯ → Rename/move** → call it `inventory-management-ci`.

### First run

Push a trivial commit to `dev`. Only the **Validate** stage should run:
`prisma generate` → `typecheck` → `lint` → `next build`. Nothing deploys.

If Validate fails on the very first run, it is almost always one of:

| Symptom | Cause |
|---|---|
| `Could not find a required file: package.json` | wrong working directory or the repo did not push fully |
| `Environment variable not found: DATABASE_URL` | a statically analysed route touched Prisma at build time — pass a dummy `DATABASE_URL` build arg |
| `This pipeline needs permission to access a resource` | the **Authorize** button on the service connection or variable group (steps 3.6, 4.8) |

---

## 7. Branch policies

**The `pr:` trigger runs the build but does not block a merge.** Only a branch
policy does. Without this step the whole promote-by-PR model is decorative.

For **`staging`** and again for **`master`**:

1. **Repos → Branches** → hover the branch → **⋯ → Branch policies**
2. **Require a minimum number of reviewers:** on, 1 (tick *"Allow requestors to
   approve their own changes"* if you are working alone)
3. **Check for linked work items:** off
4. **Build Validation → +**
   - **Build pipeline:** `inventory-management-ci`
   - **Path filter:** blank
   - **Trigger:** Automatic
   - **Policy requirement:** **Required**
   - **Build expiration:** *Immediately when `<branch>` is updated*
   - **Display name:** `Validate`
   - **Save**
5. **Limit merge types:** allow **Squash merge** only, for a readable history on
   `master`.

---

## 8. Permissions — read this before you start

Three steps need rights beyond plain **Contributor**, and this is the most
common place to get stuck.

| Step | Needs | Why Contributor is not enough |
|---|---|---|
| §3 service connection (automatic) | app-registration rights in Entra | it creates a service principal |
| Key Vault Secrets User for that SP | `Microsoft.Authorization/roleAssignments/write` | Contributor can create resources but not grant access to them |
| AcrPull for the Container App identity | same | same |

Options, best first:

1. Ask the subscription owner for **User Access Administrator** (or RBAC
   Administrator) on `rg-inventory-staging` — narrow and time-boxed.
2. Ask them to make just those two role assignments for you.
3. Put the Key Vault on the **access-policy** model rather than RBAC. Setting
   access policies is a control-plane operation on the vault, which Contributor
   *does* have.
4. **Last resort for ACR only:** enable the registry admin user and store its
   credentials as a Container App secret. Works with Contributor alone, but it
   is a shared static credential rather than a managed identity. Do not ship
   production on this.

If the automatic service connection is blocked entirely, have an Entra admin
create the app registration and use **Service principal (manual)**, pasting the
tenant/client id and secret.

---

## 9. Turning production on

`productionEnabled: false` at the top of the YAML keeps `master` to validation
only, so merging there cannot fail on infrastructure that does not exist. To
enable it:

1. Create the production resources — the whole of
   [azure-staging-setup.md](azure-staging-setup.md) again, substituting
   `production` for `staging`. **Same ACR**: promotion is a retag, not a
   cross-registry copy, which is what makes it byte-identical.
2. Create variable group `inventory-production-secrets`, linked to the
   production Key Vault, same four secrets.
3. Confirm the environment `inventory-production` has its approval (§5).
4. Edit `azure-pipelines.yml`:
   ```yaml
   - name: productionEnabled
     value: true
   - name: prodResourceGroup
     value: rg-inventory-production      # confirm the real name
   - name: prodAcaApp
     value: ca-inventory-web-production  # confirm the real name
   ```
5. Merge that through `dev → staging → master` like any other change.

---

## 10. Two gotchas that will cost you an afternoon

**Azure SQL firewall vs Microsoft-hosted agents.** The deploy stage reaches
Azure SQL from a hosted agent whose IP is not reliably covered by *"Allow Azure
services to access this server."* If `prisma migrate deploy` hangs and then
fails to connect, you have three options:

- add the agent IP range to the SQL firewall (broad, and the ranges change),
- use a **self-hosted agent** inside the VNet (best for a locked-down network),
- or run migrate/bootstrap from an Azure-resident context — e.g. a one-off
  Container App Job — instead of from the agent.

**The placeholder image.** The Container App is created in
[azure-staging-setup.md §7](azure-staging-setup.md) with a placeholder image
because your registry is empty at that point. After the first successful build
you must **once** switch the container to
`acrinventorystaging.azurecr.io/inventory-web:latest`, set **Authentication =
Managed identity**, and set **Ingress target port = 3000**. Until you do, the
deploy stage succeeds and the app still serves the placeholder.

---

## 11. Checklist

- [ ] Project created, repo pushed, `dev` / `staging` / `master` exist
- [ ] `dev` is the default branch
- [ ] Service connection `azure-staging-sc`, scoped to `rg-inventory-staging`, authorized for all pipelines
- [ ] Variable group `inventory-staging-secrets` linked to Key Vault, four secrets resolving, pipeline permission granted
- [ ] Environments `inventory-staging` and `inventory-production` created
- [ ] Approval configured on `inventory-production`
- [ ] Pipeline `inventory-management-ci` created from `/azure-pipelines.yml`
- [ ] Branch policies on `staging` and `master` requiring **Validate**
- [ ] A push to `dev` runs Validate only
- [ ] A PR `dev → staging` builds an image and deploys staging
- [ ] Container App switched off the placeholder image, port 3000, managed identity
- [ ] `/login` on the staging URL returns 200
- [ ] `productionEnabled` still `false` until production infrastructure exists
