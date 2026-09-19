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

# Generated secrets, for refreshing a local .env (`terraform output -raw <name>`).
# They are in state regardless; these only make them easy to read back.
output "smoke_token" {
  value     = random_password.smoke_token.result
  sensitive = true
}

output "supabase_secret_key" {
  value     = supabase_apikey.server.api_key
  sensitive = true
}

output "supabase_db_password" {
  value     = random_password.supabase_db.result
  sensitive = true
}

output "supabase_db_url" {
  description = "Session-pooler URI (SUPABASE_DB_URL in the GitHub environment)."
  value       = local.supabase_db_url
  sensitive   = true
}
