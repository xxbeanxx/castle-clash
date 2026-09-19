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
