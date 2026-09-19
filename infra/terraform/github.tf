resource "github_repository" "main" {
  name       = var.github_repository_name
  visibility = "public"

  has_issues   = true
  has_projects = true
  has_wiki     = true

  allow_merge_commit = true
  allow_squash_merge = true
  allow_rebase_merge = true
  allow_auto_merge   = false

  squash_merge_commit_title   = "COMMIT_OR_PR_TITLE"
  squash_merge_commit_message = "COMMIT_MESSAGES"
  merge_commit_title          = "MERGE_MESSAGE"
  merge_commit_message        = "PR_TITLE"

  security_and_analysis {
    secret_scanning {
      status = "enabled"
    }
    secret_scanning_push_protection {
      status = "enabled"
    }
  }

  # Deleting the repository would take every issue, PR and workflow run with it.
  lifecycle {
    prevent_destroy = true
  }
}

# release-please opens PRs with the workflow token, so Actions must be allowed to
# create them; everything else stays read-only.
resource "github_workflow_repository_permissions" "main" {
  repository = github_repository.main.name

  default_workflow_permissions     = "read"
  can_approve_pull_request_reviews = true
}

resource "github_actions_repository_permissions" "main" {
  repository      = github_repository.main.name
  enabled         = true
  allowed_actions = "all"
}

# The Azure federated credential trusts the environment name alone, so deployments
# to it are limited to `main` and gated on a reviewer: a workflow on any other
# branch cannot request it and receive an Azure token.
resource "github_repository_environment" "production" {
  repository  = github_repository.main.name
  environment = "production"

  prevent_self_review = false

  reviewers {
    users = [var.github_reviewer_user_id]
  }

  deployment_branch_policy {
    protected_branches     = false
    custom_branch_policies = true
  }
}

resource "github_repository_environment_deployment_policy" "main_branch" {
  repository     = github_repository.main.name
  environment    = github_repository_environment.production.environment
  branch_pattern = "main"
}

locals {
  # Read by .github/workflows/deploy-environment.yml. Derived from the resources
  # above where possible so a rename cannot leave the workflow pointing at the old name.
  production_variables = {
    AZURE_RESOURCE_GROUP     = azurerm_resource_group.main.name
    SERVER_APP               = azurerm_container_app.app["server"].name
    CLIENT_APP               = azurerm_container_app.app["client"].name
    GAME_SERVER_URL          = "wss://${var.game_host}.${var.dns_zone_name}"
    CLIENT_URL               = "https://${var.client_host}.${var.dns_zone_name}"
    SERVER_CPU               = var.server_cpu
    SERVER_MEMORY            = var.server_memory
    CLIENT_MIN_REPLICAS      = tostring(var.client_min_replicas)
    SUPABASE_URL             = var.supabase_url
    SUPABASE_PUBLISHABLE_KEY = var.supabase_publishable_key
  }

  # Not credentials (OIDC has no client secret), but the workflow reads them as
  # secrets so they stay out of logs.
  production_secrets = {
    AZURE_CLIENT_ID       = azuread_application.deploy.client_id
    AZURE_TENANT_ID       = var.tenant_id
    AZURE_SUBSCRIPTION_ID = var.subscription_id
  }
}

resource "github_actions_environment_variable" "production" {
  for_each = local.production_variables

  repository    = github_repository.main.name
  environment   = github_repository_environment.production.environment
  variable_name = each.key
  value         = each.value
}

resource "github_actions_environment_secret" "production" {
  for_each = local.production_secrets

  repository  = github_repository.main.name
  environment = github_repository_environment.production.environment
  secret_name = each.key
  value       = each.value
}
