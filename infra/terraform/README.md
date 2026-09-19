# Terraform: castle-clash cloud environment

Manages `rg-castle-clash` and everything the game runs on, the
`castle-clash[-game].atomic-nucleus.com` DNS records, the GitHub deploy identity, the hosted
Supabase project, the GitHub repository itself (settings, branch and tag rules, the `production`
environment), and every secret the pipeline uses. Terraform >= 1.9; providers `azurerm ~> 4.0`,
`azuread ~> 3.0`, `integrations/github ~> 6.0`, `supabase/supabase ~> 1.0`, `hashicorp/random ~> 3.0`.

| File | Owns |
| --- | --- |
| `main.tf` | resource group, Log Analytics workspace, Container Apps environment |
| `container-apps.tf` | `ca-castle-clash-server` / `-client` (shape only, see below) |
| `dns.tf` | CNAME + `asuid` TXT records in the `atomic-nucleus.com` zone, managed certificates, custom domains |
| `identity.tf` | `castle-clash-deploy-prod` app registration, service principal, GitHub OIDC federated credential, RG-scoped `Container Apps Contributor` |
| `github.tf` | the repository and its settings, the `main` and release-tag rulesets, Actions permissions, the `production` environment (reviewer, `main`-only deploys), its variables and secrets |
| `supabase.tf` | the Supabase project, the server's secret API key, and the URLs/keys derived from them |
| `secrets.tf` | the generated secrets and where each one goes |
| `backend.tf` | remote state (below) |

## Using it

```sh
az login
export GITHUB_TOKEN="$(gh auth token)"        # for the GitHub provider
export SUPABASE_ACCESS_TOKEN=sbp_...          # dashboard -> Account -> Access Tokens
terraform -chdir=infra/terraform init
terraform -chdir=infra/terraform plan
```

You need `Storage Blob Data Contributor` on the state account (auth is Entra ID; shared-key
access is disabled on it), `Owner`/`Contributor` on the subscription for `apply`, rights to edit the
DNS zone and app registrations, a GitHub token with `repo` scope and admin on the repository, and a
Supabase personal access token.

## State backend

Storage account `stcastleclashtfstate` in `DefaultResourceGroup-CCAN`, container `tfstate`, blob
`castle-clash.tfstate`. Created by hand (a backend cannot create itself):

```sh
az storage account create -n stcastleclashtfstate -g DefaultResourceGroup-CCAN -l canadacentral \
  --sku Standard_LRS --kind StorageV2 --min-tls-version TLS1_2 --allow-blob-public-access false
az storage account blob-service-properties update --account-name stcastleclashtfstate \
  -g DefaultResourceGroup-CCAN --enable-versioning true --enable-delete-retention true \
  --delete-retention-days 30 --enable-container-delete-retention true --container-delete-retention-days 30
az role assignment create --assignee <you> --role "Storage Blob Data Contributor" --scope <account id>
az storage container create -n tfstate --account-name stcastleclashtfstate --auth-mode login
az storage account update -n stcastleclashtfstate -g DefaultResourceGroup-CCAN --allow-shared-key-access false
```

Versioning and 30-day soft delete are on so a bad write can be rolled back. **The state is
sensitive**: it holds the Container App secret values (`supabase-secret-key`, `smoke-token`) and the
`AZURE_*` values written to GitHub. Keep the account's access list short.

## Secrets

Every secret is generated (or minted) by Terraform, so its value is in state and every consumer is
wired to that one source. Nothing is typed into a dashboard or `gh secret set`.

| Secret | Source | Consumers |
| --- | --- | --- |
| `SMOKE_TOKEN` | `random_password.smoke_token` | GitHub `production` env, server Container App (`smoke-token`) |
| `supabase-secret-key` | `supabase_apikey.server` | server Container App |
| `SUPABASE_DB_URL` | `supabase_project` + `random_password.supabase_db` + the pooler host | GitHub `production` env |
| `AZURE_CLIENT_ID` / `_TENANT_ID` / `_SUBSCRIPTION_ID` | the Entra app / variables | GitHub `production` env (identifiers, not credentials) |

Read one back with `terraform output -raw smoke_token | supabase_secret_key | supabase_db_url`.
Rotate with `terraform apply -replace=random_password.smoke_token` (likewise
`-replace=supabase_apikey.server`); the new value propagates to every consumer in the same apply.
The one credential outside Terraform is the optional `RELEASE_PLEASE_TOKEN` personal access token
(GitHub has no API to mint one).

Because Container App secrets are only read at container start, a rotated value reaches the running
server on its next revision (the next deploy, or `az containerapp revision restart`).

## GitHub rules

- **`protect-main` ruleset:** changes to `main` go through a pull request; branch deletion,
  force-pushes and merge commits are blocked (linear history, squash-only); conversations must be
  resolved; and the checks `verify`, `browser`, `build (server)`, `build (client)` and `smoke` must
  pass. No approving review is required (one maintainer could never satisfy it). Repository admins
  can merge a PR past a stuck check, but only through a PR, never by pushing to `main`.
- **Why only those five checks:** required checks must run on *every* PR. `e2e` (`private-match`) and
  `integration` (`supabase`) are path-filtered, so requiring them would block any PR that does not
  touch those paths. They are advisory until they are made unconditional (or fronted by a single
  always-running gate job).
- **`protect-release-tags`:** `v*` tags can be created (release-please does) but never moved or deleted.
- **Repository:** squash-only with the PR title/body as the commit (release-please reads the
  conventional-commit title), auto-merge and "Update branch" enabled, merged branches deleted,
  vulnerability alerts and Dependabot security updates on, secret scanning and push protection on.
- Not done, on purpose: pinning actions to SHAs (`sha_pinning_required` would break the current
  tag-pinned workflows), commit-signature enforcement, and requiring branches to be up to date
  (no merge queue, so it would re-run the full suite after every unrelated merge).

## What Terraform does *not* own

The deploy workflow (`.github/workflows/deploy-environment.yml`) changes these on every
release, so `azurerm_container_app` ignores them (`lifecycle.ignore_changes`) rather than
fight it:

- `template` (image, cpu/memory, replicas, env vars, revision suffix, termination grace period)
- `ingress[0].target_port` (2567 / 8080, set with `az containerapp ingress update`)

Also not managed here: `RELEASE_PLEASE_TOKEN`; the Supabase auth/API settings (`supabase_settings`
imports the whole config, mail templates and hashed secrets included, and compares it whole, so a partial
block shows a permanent diff. The game needs anonymous sign-ins ON, and `site_url` / the redirect
allow-list set to the client origin: keep those in the dashboard); the `atomic-nucleus.com`
zone itself (another repo's Terraform; read via a `data` source), the DefaultResourceGroup-CCAN
resource group, and GHCR package visibility (no API).

`github_repository.main` and `supabase_project.main` have `prevent_destroy`: a plan that would delete
either (including through a forced replacement) fails instead.

## Import history

The environment was created by hand, then adopted with `terraform import` (17 Azure/Entra
resources and 17 GitHub resources) and the `.tf` files adjusted until `terraform plan` was clean.
The Supabase project was adopted the same way, by project ref
(`terraform import supabase_project.main vrcxprhmonzpuelfnijy`).

Known consequences:

- **Generated secrets replaced the old values** (applied 2026-09-19). The old database password, smoke token and
  Supabase secret key were created outside Terraform; the first `apply` after adoption replaces
  them. The old default Supabase secret key is left in the dashboard, unused: revoke it once the
  server runs on the new one. A local `.env` that held the old values goes stale (see `terraform output`).
- **Supabase provider quirks (v1.11).** `supabase_apikey.description` is accepted but read back
  null, failing the apply with "inconsistent result" (and leaving the created key tainted), so it is
  not set. A changed `database_password` is applied in place through the API, but the pooler can take
  a few minutes to accept it: right after a rotation, `supabase db push` with the new URI may report
  "password authentication failed" until it propagates.
- **GitHub secrets.** GitHub never returns a secret's value, so an imported secret has none in
  state and the plan shows one in-place update per `AZURE_*` secret. Applying writes the value
  Terraform already knows (a client id, tenant id and subscription id); after that the plan is
  clean.
- **Custom domains and managed certificates.** The provider cannot bind a *managed* certificate
  (`container_app_environment_certificate_id` rejects `.../managedCertificates/...` IDs), so
  `azurerm_container_app_custom_domain` ignores the binding arguments and Azure keeps the
  existing bindings. Managed certificate names are pinned to the ones Azure generated, because the
  name forces replacement.
- **Deployment branch policy** imports by numeric policy id (`<repo>:production:<id>`), not by
  branch name.

## Not proven: building this from scratch

Everything here was validated by importing what already existed, never by creating it. A fresh
`apply` in an empty subscription may need the two-step domain dance (create apps + DNS, then
`az containerapp hostname bind` for the managed certificates), and the app registration's
federated-credential subject depends on `var.github_oidc_subject_prefix`. Treat a from-scratch
apply as untested.
