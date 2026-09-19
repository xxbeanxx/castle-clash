resource "github_repository" "main" {
  name       = var.github_repository_name
  visibility = "public"

  has_issues   = true
  has_projects = true
  has_wiki     = true

  # Squash-only, so `main` stays linear and every commit on it is one PR whose
  # title is a conventional commit: that is what release-please reads to cut
  # releases. The PR body becomes the commit body.
  allow_squash_merge          = true
  allow_merge_commit          = false
  allow_rebase_merge          = false
  squash_merge_commit_title   = "PR_TITLE"
  squash_merge_commit_message = "PR_BODY"

  # Auto-merge lets a green PR land itself; the rest keeps the branch list clean
  # and the "Update branch" button available.
  allow_auto_merge       = true
  allow_update_branch    = true
  delete_branch_on_merge = true

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

resource "github_repository_vulnerability_alerts" "main" {
  repository = github_repository.main.name
  enabled    = true
}

# Dependabot already opens version-update PRs (.github/dependabot.yml); this adds
# the automatic security-update PRs on top (which need the alerts above).
resource "github_repository_dependabot_security_updates" "main" {
  repository = github_repository.main.name
  enabled    = true

  # GitHub rejects this (422) until alerts are on; no attribute links the two.
  depends_on = [github_repository_vulnerability_alerts.main]
}

# `main` only changes through a pull request whose checks pass. There is one
# maintainer, so no approving review is required (it could never be satisfied);
# the checks are the gate. Repository admins can still merge a PR past a stuck
# check, but only *through a PR*, never by pushing straight to main.
resource "github_repository_ruleset" "main" {
  name        = "protect-main"
  repository  = github_repository.main.name
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["~DEFAULT_BRANCH"]
      exclude = []
    }
  }

  bypass_actors {
    actor_id    = 5 # the built-in Repository admin role
    actor_type  = "RepositoryRole"
    bypass_mode = "pull_request"
  }

  rules {
    deletion                = true
    non_fast_forward        = true
    required_linear_history = true

    pull_request {
      required_approving_review_count   = 0
      dismiss_stale_reviews_on_push     = true
      require_code_owner_review         = false
      require_last_push_approval        = false
      required_review_thread_resolution = true
      allowed_merge_methods             = ["squash"]
    }

    # Only checks that run on *every* pull request can be required: e2e and
    # integration are path-filtered, and a required check that never starts blocks
    # the PR forever. (private-match / supabase are therefore advisory.)
    required_status_checks {
      # Not "up to date with main": with no merge queue that would re-run the
      # whole suite after every unrelated merge.
      strict_required_status_checks_policy = false

      required_check {
        context        = "verify"
        integration_id = local.github_actions_app_id
      }
      required_check {
        context        = "browser"
        integration_id = local.github_actions_app_id
      }
      required_check {
        context        = "build (server)"
        integration_id = local.github_actions_app_id
      }
      required_check {
        context        = "build (client)"
        integration_id = local.github_actions_app_id
      }
      required_check {
        context        = "smoke"
        integration_id = local.github_actions_app_id
      }
    }
  }
}

# Release tags (v1.2.3) are what the deploy pipeline promotes by. They can be
# created (release-please does) but never moved or deleted.
resource "github_repository_ruleset" "release_tags" {
  name        = "protect-release-tags"
  repository  = github_repository.main.name
  target      = "tag"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["refs/tags/v*"]
      exclude = []
    }
  }

  rules {
    deletion         = true
    non_fast_forward = true
    update           = true
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
  # The id GitHub Actions check runs are reported under; a required check names it
  # so another app cannot satisfy the check by posting a status of the same name.
  github_actions_app_id = 15368

  # Read by .github/workflows/deploy-environment.yml. Derived from the resources
  # above where possible so a rename cannot leave the workflow pointing at the old name.
  production_variables = {
    AZURE_RESOURCE_GROUP = azurerm_resource_group.main.name
    SERVER_APP           = azurerm_container_app.app["server"].name
    CLIENT_APP           = azurerm_container_app.app["client"].name
    GAME_SERVER_URL      = "wss://${var.game_host}.${var.dns_zone_name}"
    CLIENT_URL           = "https://${var.client_host}.${var.dns_zone_name}"
    SERVER_CPU           = var.server_cpu
    SERVER_MEMORY        = var.server_memory
    CLIENT_MIN_REPLICAS  = tostring(var.client_min_replicas)
    SUPABASE_URL         = local.supabase_url
    # Designed to ship in every browser bundle, so it is a variable, not a secret,
    # and `nonsensitive` is honest: the provider just marks all keys sensitive.
    SUPABASE_PUBLISHABLE_KEY = nonsensitive(data.supabase_apikeys.main.publishable_key)
  }

  # Kept apart from the sensitive values below: `for_each` cannot iterate a
  # collection holding one, so the resource iterates these names and looks values up.
  production_secret_names = toset([
    "AZURE_CLIENT_ID",
    "AZURE_TENANT_ID",
    "AZURE_SUBSCRIPTION_ID",
    "SMOKE_TOKEN",
    "SUPABASE_DB_URL",
  ])

  production_secrets = {
    # Not credentials (OIDC has no client secret), but the workflow reads them as
    # secrets so they stay out of logs.
    AZURE_CLIENT_ID       = azuread_application.deploy.client_id
    AZURE_TENANT_ID       = var.tenant_id
    AZURE_SUBSCRIPTION_ID = var.subscription_id
    # Credentials: generated in secrets.tf / supabase.tf.
    SMOKE_TOKEN     = random_password.smoke_token.result
    SUPABASE_DB_URL = local.supabase_db_url
  }
}

resource "github_actions_environment_variable" "production" {
  for_each = nonsensitive(toset(keys(local.production_variables)))

  repository    = github_repository.main.name
  environment   = github_repository_environment.production.environment
  variable_name = each.key
  value         = local.production_variables[each.key]
}

resource "github_actions_environment_secret" "production" {
  for_each = local.production_secret_names

  repository  = github_repository.main.name
  environment = github_repository_environment.production.environment
  secret_name = each.key
  value       = local.production_secrets[each.key]
}
