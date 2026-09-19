# Every secret the deploy pipeline uses is generated or read here, so its value is
# in Terraform state and each consumer is wired to the one source. Nothing is typed
# into a dashboard or `gh secret set`.
#
#   secret                 source                            consumers
#   ---------------------  --------------------------------  ---------------------------------------
#   SMOKE_TOKEN            random_password.smoke_token       GitHub `production` env + Container App
#   supabase-secret-key    supabase_apikey.server            Container App (server)
#   SUPABASE_DB_URL        supabase_project + random pw      GitHub `production` env
#   AZURE_* ids            azuread_application / variables   GitHub `production` env (not credentials)
#
# The one credential outside Terraform is RELEASE_PLEASE_TOKEN, an optional
# personal access token: GitHub offers no API to mint one.

# Presented by the deploy smoke to POST /smoke/record-match. Rotate with
# `terraform apply -replace=random_password.smoke_token`.
resource "random_password" "smoke_token" {
  length  = 64
  special = false
}

locals {
  server_secrets = {
    "supabase-secret-key" = supabase_apikey.server.api_key
    "smoke-token"         = random_password.smoke_token.result
  }

  # The names are static on purpose: `for_each` cannot iterate a collection that
  # holds sensitive values, but it can iterate names and look the values up.
  server_secret_names = toset(["supabase-secret-key", "smoke-token"])
}
