# Terraform: castle-clash Azure environment

Manages `rg-castle-clash` and everything the game runs on, plus the
`castle-clash[-game].atomic-nucleus.com` DNS records and the GitHub deploy identity.
Terraform >= 1.9; providers `azurerm ~> 4.0` and `azuread ~> 3.0`.

| File | Owns |
| --- | --- |
| `main.tf` | resource group, Log Analytics workspace, Container Apps environment |
| `container-apps.tf` | `ca-castle-clash-server` / `-client` (shape only, see below) |
| `dns.tf` | CNAME + `asuid` TXT records in the `atomic-nucleus.com` zone, managed certificates, custom domains |
| `identity.tf` | `castle-clash-deploy-prod` app registration, service principal, GitHub OIDC federated credential, RG-scoped `Container Apps Contributor` |
| `backend.tf` | remote state (below) |

## Using it

```sh
az login
terraform -chdir=infra/terraform init
terraform -chdir=infra/terraform plan
```

You need `Storage Blob Data Contributor` on the state account (auth is Entra ID; shared-key
access is disabled on it), `Owner`/`Contributor` on the subscription for `apply`, and rights to
edit the DNS zone and app registrations.

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
sensitive**: it holds the Container App secret values (`supabase-secret-key`, `smoke-token`).
Keep the account's access list short.

## What Terraform does *not* own

The deploy workflow (`.github/workflows/deploy-environment.yml`) changes these on every
release, so `azurerm_container_app` ignores them (`lifecycle.ignore_changes`) rather than
fight it:

- `template` (image, cpu/memory, replicas, env vars, revision suffix, termination grace period)
- `secret` (values are unreadable; set by `infra/azure/set-runtime-secrets.sh`)
- `ingress[0].target_port` (2567 / 8080, set with `az containerapp ingress update`)

Also not managed here: the `atomic-nucleus.com` zone itself (another repo's Terraform; read via
a `data` source), the DefaultResourceGroup-CCAN resource group, the Supabase project, and the
GitHub `production` environment and its secrets (`infra/github/configure-environment.sh`).

## Import history

The environment was created by `infra/azure/provision.sh`, then adopted with
`import.sh` (17 resources: run `infra/terraform/import.sh`; it is idempotent and only writes state).
After import, `.tf` files were adjusted until the plan was clean, except:

- **`azurerm_log_analytics_workspace.main` shows one in-place change**
  (`+ local_authentication_enabled = true`). The API does not return that property, so an imported
  workspace has it null in state. The change writes the value Azure already uses; the first
  `terraform apply` clears it.
- **Custom domains and managed certificates.** The provider cannot bind a *managed* certificate
  (`container_app_environment_certificate_id` rejects `.../managedCertificates/...` IDs), so
  `azurerm_container_app_custom_domain` ignores the binding arguments and Azure keeps the
  existing bindings. Managed certificate names are pinned to the ones Azure generated, because the
  name forces replacement.

## Not proven: building this environment from scratch

Everything here was validated by importing the existing environment, never by creating it. A fresh
`apply` in an empty subscription may need the two-step domain dance (create apps + DNS, then
`az containerapp hostname bind` for the managed certificates), and the app registration's
federated-credential subject depends on `var.github_oidc_subject_prefix`. Treat a from-scratch
apply as untested.
