# Terraform: castle-clash cloud environment

Manages `rg-castle-clash` and everything the game runs on, the
`castle-clash[-game].atomic-nucleus.com` DNS records, the GitHub deploy identity, and the GitHub
repository itself (settings, the `production` environment, and what the deploy workflow reads
from it). Terraform >= 1.9; providers `azurerm ~> 4.0`, `azuread ~> 3.0`, `integrations/github ~> 6.0`.

| File | Owns |
| --- | --- |
| `main.tf` | resource group, Log Analytics workspace, Container Apps environment |
| `container-apps.tf` | `ca-castle-clash-server` / `-client` (shape only, see below) |
| `dns.tf` | CNAME + `asuid` TXT records in the `atomic-nucleus.com` zone, managed certificates, custom domains |
| `identity.tf` | `castle-clash-deploy-prod` app registration, service principal, GitHub OIDC federated credential, RG-scoped `Container Apps Contributor` |
| `github.tf` | the repository and its settings, Actions permissions, the `production` environment (reviewer, `main`-only deploys), its variables and the `AZURE_*` secrets |
| `backend.tf` | remote state (below) |

## Using it

```sh
az login
export GITHUB_TOKEN="$(gh auth token)"   # for the GitHub provider
terraform -chdir=infra/terraform init
terraform -chdir=infra/terraform plan
```

You need `Storage Blob Data Contributor` on the state account (auth is Entra ID; shared-key
access is disabled on it), `Owner`/`Contributor` on the subscription for `apply`, rights to edit the
DNS zone and app registrations, and a GitHub token with `repo` scope and admin on the repository.

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

## What Terraform does *not* own

The deploy workflow (`.github/workflows/deploy-environment.yml`) changes these on every
release, so `azurerm_container_app` ignores them (`lifecycle.ignore_changes`) rather than
fight it:

- `template` (image, cpu/memory, replicas, env vars, revision suffix, termination grace period)
- `secret` (values are unreadable; set by `infra/set-runtime-secrets.sh`)
- `ingress[0].target_port` (2567 / 8080, set with `az containerapp ingress update`)

Secret *values* are kept out of Terraform on purpose: `SUPABASE_DB_URL` (GitHub environment
secret; `gh secret set SUPABASE_DB_URL --env production`) and `SMOKE_TOKEN` plus the server's
`supabase-secret-key` (`infra/set-runtime-secrets.sh`). Nor does it manage `RELEASE_PLEASE_TOKEN`,
the `atomic-nucleus.com` zone itself (another repo's Terraform; read via a `data` source), the
DefaultResourceGroup-CCAN resource group, the Supabase project, or GHCR package visibility (no API).

`github_repository.main` has `prevent_destroy`: removing it from config, or a rename that forces
replacement, fails the plan instead of deleting the repository.

There is deliberately no branch protection or ruleset, because none existed when the repository
was imported. Adding one is a behaviour change (it would gate merges to `main`), so it is a
separate decision, not part of the adoption.

## Import history

The environment was created by hand, then adopted with `terraform import` (17 Azure/Entra
resources and 17 GitHub resources) and the `.tf` files adjusted until `terraform plan` was clean.
Known consequences:

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
