resource "azurerm_resource_group" "main" {
  name     = var.resource_group_name
  location = var.location
}

resource "azurerm_log_analytics_workspace" "main" {
  name                = "log-castle-clash"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "PerGB2018"
  retention_in_days   = 30

  local_authentication_enabled = true
}

resource "azurerm_container_app_environment" "main" {
  name                       = "cae-castle-clash"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  # The only profile: serverless Consumption. Its per-app ceiling (2 vCPU / 4 GiB)
  # is why the server runs at 1 vCPU / 2 GiB, see var.server_cpu / var.server_memory.

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }
}
