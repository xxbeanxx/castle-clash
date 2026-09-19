# The hosted Supabase project (auth + Postgres). Authenticates from the
# SUPABASE_ACCESS_TOKEN environment variable: a personal access token from the
# dashboard (Account -> Access Tokens).
#
# Adopted with `terraform import supabase_project.main <project ref>`.
resource "supabase_project" "main" {
  organization_id   = var.supabase_organization_id
  name              = var.supabase_project_name
  region            = var.supabase_region
  database_password = random_password.supabase_db.result

  # Deleting the project deletes the database. Never let a plan do that quietly.
  lifecycle {
    prevent_destroy = true
  }
}

# Alphanumeric only, so it can sit in a connection URI without percent-encoding.
# 32 characters of [A-Za-z0-9] is ~190 bits.
resource "random_password" "supabase_db" {
  length  = 32
  special = false
}

# The key the game server uses to write matches and read profiles. Terraform mints
# it, so its value is in state and flows to the Container App secret; rotate it by
# tainting this resource. (The project's original default secret key is unused
# after the switch and can be revoked in the dashboard.)
resource "supabase_apikey" "server" {
  project_ref = supabase_project.main.id
  name        = "castle_clash_server"

  # No `description`: provider v1.11 accepts it but reads back null, which fails
  # the apply with "inconsistent result".
}

data "supabase_apikeys" "main" {
  project_ref = supabase_project.main.id

  depends_on = [supabase_apikey.server]
}

# Map of pooler mode -> connection string. Only the host is taken from it (the
# session pooler on 5432 is what GitHub's IPv4-only runners need for
# `supabase db push`); the credentials in the URI are assembled below.
data "supabase_pooler" "main" {
  project_ref = supabase_project.main.id
}

# Auth/API settings are deliberately NOT managed here. `supabase_settings` imports
# the project's entire config (mail templates, dozens of provider flags, hashed
# secrets) and compares it whole, so a partial `auth` block shows a permanent diff.
# They stay in the dashboard. The game needs, and the project has (checked
# 2026-09-19): anonymous sign-ins ON (`MatchRoom.onAuth` accepts only anonymous
# guests), site_url and the redirect allow-list set to the client origin.

locals {
  supabase_url = "https://${supabase_project.main.id}.supabase.co"

  supabase_pooler_host = regex("@([^:/]+)", values(data.supabase_pooler.main.url)[0])[0]

  supabase_db_url = "postgresql://postgres.${supabase_project.main.id}:${random_password.supabase_db.result}@${local.supabase_pooler_host}:5432/postgres"
}
