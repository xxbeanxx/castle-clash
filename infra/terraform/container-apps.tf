locals {
  # Both apps start life on Microsoft's placeholder image; the deploy workflow
  # (.github/workflows/deploy-environment.yml) then owns everything that changes
  # per release: image, cpu/memory, scale, env vars, revision suffix, the ingress
  # target port, and the runtime secrets (whose values Terraform can never read
  # back). The lifecycle block below hands those to the workflow. Terraform owns
  # the shape: environment, ingress exposure, custom domains, DNS, identity.
  apps = {
    server = {
      name = "ca-castle-clash-server"
      host = var.game_host
    }
    client = {
      name = "ca-castle-clash-client"
      host = var.client_host
    }
  }
}

resource "azurerm_container_app" "app" {
  for_each = local.apps

  name                         = each.value.name
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  workload_profile_name        = "Consumption"
  revision_mode                = "Single"
  max_inactive_revisions       = 100

  ingress {
    external_enabled = true
    target_port      = 80

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 0
    max_replicas = 1

    container {
      name   = each.value.name
      image  = "mcr.microsoft.com/k8se/quickstart:latest"
      cpu    = 0.5
      memory = "1Gi"
    }
  }

  lifecycle {
    ignore_changes = [
      template,
      secret,
      # Set by `az containerapp ingress update` at deploy time (2567 / 8080).
      ingress[0].target_port,
    ]
  }
}
