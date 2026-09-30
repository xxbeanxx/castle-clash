resource "azuread_application" "deploy" {
  # The identity GitHub Actions signs in as (azure/login with OIDC; no client secret
  # exists). Federated to the repo's `production` environment only.

  display_name     = "castle-clash-deploy-prod"
  sign_in_audience = "AzureADMyOrg"
}

resource "azuread_service_principal" "deploy" {
  client_id = azuread_application.deploy.client_id
}

resource "azuread_application_federated_identity_credential" "github_production" {
  application_id = azuread_application.deploy.id
  display_name   = "github-environment-production"
  issuer         = "https://token.actions.githubusercontent.com"
  audiences      = ["api://AzureADTokenExchange"]
  subject        = "${var.github_oidc_subject_prefix}:environment:production"
}

resource "azurerm_role_assignment" "deploy" {
  # Scoped to this resource group only. `Container Apps Contributor` covers
  # `az containerapp update` / `ingress update` / `secret set`.

  scope                = azurerm_resource_group.main.id
  role_definition_name = "Container Apps Contributor"
  principal_id         = azuread_service_principal.deploy.object_id
}

# backend.tf's state storage account (bootstrapped by hand, per its own
# comment - not managed here, only read).
data "azurerm_storage_account" "tfstate" {
  name                = "stcastleclashtfstate"
  resource_group_name = "DefaultResourceGroup-CCAN"
}

resource "azurerm_role_assignment" "deploy_tfstate" {
  # The deploy workflow's own `terraform apply` (deploy-environment.yaml)
  # needs to read and write the state blob directly, same as a human
  # operator running it locally (infra/terraform/README.md's "Using it").
  scope                = data.azurerm_storage_account.tfstate.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azuread_service_principal.deploy.object_id
}
