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

# The auth settings the game depends on (v2 plan decision D2: Terraform owns them).
#
# Only the keys listed in `local.supabase_auth` are managed. An earlier version of this
# comment said a partial `auth` block shows a permanent diff; that is wrong for the locked
# provider (v1.11.0): it tracks only the keys you configure, PATCHes only those, and keeps
# hashed secrets from state (docs/research/phase12-supabase-google-oauth.md, finding 16, read
# from the provider source). Everything else (mail templates, other providers, rate limits)
# stays in the dashboard and is never read or written here.
#
# The game needs: anonymous sign-ins ON (guests), manual linking ON (a guest links Google
# with `linkIdentity`, so their progress keeps the same user id), Google enabled, `site_url`
# at the client origin, and unverified-email sign-ins OFF (they would weaken automatic
# identity linking). `MatchRoom.onAuth` accepts any valid Supabase token; `verifyToken.ts`
# only reports `isAnonymous`.
#
# Adopt with `terraform import supabase_settings.main <project ref>`, then read the first plan:
# see "Supabase auth settings" in README.md, including what the first plan is expected to show.
resource "supabase_settings" "main" {
  project_ref = supabase_project.main.id

  # A value derived from the sensitive Google secret is itself marked sensitive, so a plan that
  # sets or rotates the secret prints `(sensitive value)` instead of the JSON. Plans that do not
  # (the normal case) stay readable.
  auth = jsonencode(local.supabase_auth)
}

locals {
  client_origin = "https://${var.client_host}.${var.dns_zone_name}"

  # for-expressions, not conditionals: a conditional between two objects of different shape unifies
  # them into a map(string), which would send the booleans as the strings "true"/"false".
  #
  # Google is switched on once a client id is set (google.auto.tfvars); until then it is not managed.
  supabase_google_keys = {
    for k, v in {
      external_google_enabled   = true
      external_google_client_id = var.supabase_google_client_id
    } : k => v if var.supabase_google_client_id != ""
  }

  # The secret is only sent when passed in (TF_VAR_supabase_google_client_secret), i.e. when setting
  # or rotating it. Supabase stores it hashed, so Terraform cannot detect drift in it. `nonsensitive`
  # reveals only whether one was given, which keeps the rest of the plan readable.
  supabase_google_secret_keys = {
    for k, v in { external_google_secret = var.supabase_google_client_secret } : k => v
    if nonsensitive(var.supabase_google_client_secret != null)
  }

  supabase_auth = merge(
    {
      site_url = local.client_origin
      # The client's /auth/callback is where Google and emailed links return. The client origin
      # is `site_url`, whose origin passes for any path, so this entry matters for other origins
      # (staging). It REPLACES the dashboard's list: list everything else that must stay in
      # var.supabase_extra_redirect_urls.
      uri_allow_list                         = join(",", concat(["${local.client_origin}/auth/callback"], var.supabase_extra_redirect_urls))
      external_anonymous_users_enabled       = true
      security_manual_linking_enabled        = true
      mailer_allow_unverified_email_sign_ins = false
    },
    local.supabase_google_keys,
    local.supabase_google_secret_keys,
  )

  supabase_url = "https://${supabase_project.main.id}.supabase.co"

  supabase_pooler_host = regex("@([^:/]+)", values(data.supabase_pooler.main.url)[0])[0]

  supabase_db_url = "postgresql://postgres.${supabase_project.main.id}:${random_password.supabase_db.result}@${local.supabase_pooler_host}:5432/postgres"
}
