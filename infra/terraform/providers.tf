provider "azurerm" {
  subscription_id = var.subscription_id
  features {}
}

provider "azuread" {
  tenant_id = var.tenant_id
}

# Authenticates from the GITHUB_TOKEN environment variable (a token with `repo`
# scope and admin on the repository; `gh auth token` works).
provider "github" {
  owner = var.github_owner
}

# Authenticates from the SUPABASE_ACCESS_TOKEN environment variable.
provider "supabase" {}
