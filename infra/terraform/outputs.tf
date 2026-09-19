output "client_url" {
  value = "https://${var.client_host}.${var.dns_zone_name}"
}

output "game_url" {
  description = "Colyseus server; the browser connects with wss:// on this host."
  value       = "https://${var.game_host}.${var.dns_zone_name}"
}

output "deploy_client_id" {
  description = "AZURE_CLIENT_ID for the GitHub `production` environment."
  value       = azuread_application.deploy.client_id
}

output "tenant_id" {
  description = "AZURE_TENANT_ID for the GitHub `production` environment."
  value       = var.tenant_id
}

output "subscription_id" {
  description = "AZURE_SUBSCRIPTION_ID for the GitHub `production` environment."
  value       = var.subscription_id
}
