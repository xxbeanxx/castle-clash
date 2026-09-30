# Every secret the deploy pipeline uses is generated or read here, so its value is
# in Terraform state and each consumer is wired to the one source. Nothing is typed
# into a dashboard or `gh secret set`.
#
#   secret                 source                            consumers
#   ---------------------  --------------------------------  ---------------------------------------
#   SMOKE_TOKEN            random_password.smoke_token       GitHub `production` env + Render (server)
#   supabase-secret-key    supabase_apikey.server            Render (server)
#   SUPABASE_DB_URL        supabase_project + random pw      GitHub `production` env
#   AZURE_* ids            azuread_application / variables   GitHub `production` env (not credentials)
#
# Two credentials Terraform cannot mint, since they're issued by services with
# no Terraform resource for that: RENDER_API_KEY and SUPABASE_ACCESS_TOKEN
# (variables.tf). Both are passed only as TF_VAR_* when setting or rotating
# them, never stored in a file, same as supabase_google_client_secret below -
# see those variables' descriptions. RELEASE_PLEASE_TOKEN is the one secret
# outside Terraform entirely: an optional personal access token, since GitHub
# offers no API to mint one.

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
