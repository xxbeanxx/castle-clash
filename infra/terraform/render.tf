# The Render counterparts of the two azurerm_container_app resources in
# container-apps.tf. `runtime_source` is `ignore_changes`d: the deploy
# workflow (.github/workflows/deploy-environment.yaml) updates the running
# image directly via `render deploys create --image`, not `terraform apply`.
# This isn't a style choice - the render-oss/render provider (as of v1.9.1)
# unconditionally sends `maintenance_mode` on every service *update*, which
# Render's API rejects outright for any free-plan service regardless of the
# field's value (confirmed upstream:
# https://github.com/render-oss/terraform-provider-render/issues/80 - a fix
# is written but unmerged as of this writing). `ignore_changes` on
# `maintenance_mode` itself doesn't help, since the provider adds the field
# regardless of what Terraform's own diff says - only *creates* work
# reliably, so Terraform's job here is the one-time setup (custom domains,
# env vars, health checks), not ongoing deploys. This bug blocks *any*
# update to either resource, not just the image: rotating SMOKE_TOKEN or
# supabase-secret-key (secrets.tf) via `terraform apply -replace=...` would
# cascade into an env_vars update here and hit the same error. Until the
# upstream fix ships, rotating either means updating the Render service's
# env vars directly (dashboard or `render services update`), then updating
# secrets.tf's state to match by hand.
#
# Both the Azure and Render resources exist side by side during the staged
# cutover to Render; the Azure resources are removed in a later, separate
# change once Render is confirmed stable and DNS has fully cut over.

resource "render_web_service" "server" {
  name   = "ca-castle-clash-server"
  plan   = "free"
  region = "ohio"

  runtime_source = {
    image = {
      image_url = split("@", var.server_image)[0]
      digest    = split("@", var.server_image)[1]
    }
  }

  env_vars = {
    PORT                = { value = "2567" }
    SUPABASE_URL        = { value = local.supabase_url }
    SUPABASE_SECRET_KEY = { value = supabase_apikey.server.api_key }
    SMOKE_TOKEN         = { value = random_password.smoke_token.result }
    # Render's free plan enforces a fixed, non-configurable 30s shutdown grace
    # period (max_shutdown_delay_seconds is rejected outright on free - paid
    # plans can raise it up to 300s). 25000 leaves a 5s margin under that fixed
    # window, versus Azure's 540000 against a 600s grace period: an in-progress
    # match now gets ~25s to wrap up on a deploy or restart, not ~9 minutes.
    DRAIN_TIMEOUT_MS = { value = "25000" }
  }

  health_check_path = "/healthz"

  custom_domains = [
    { name = "${var.game_host}.${var.dns_zone_name}" },
  ]

  lifecycle {
    # See render.tf's top comment - the deploy workflow owns the image now.
    ignore_changes = [maintenance_mode, runtime_source]
  }
}

resource "render_web_service" "client" {
  name   = "ca-castle-clash-client"
  plan   = "free"
  region = "ohio"

  runtime_source = {
    image = {
      image_url = split("@", var.client_image)[0]
      digest    = split("@", var.client_image)[1]
    }
  }

  # nginx.conf hardcodes `listen 8080`, so there is no PORT env var to set -
  # Render detects the port from the image's EXPOSE metadata instead.
  env_vars = {
    GAME_SERVER_URL          = { value = "wss://${var.game_host}.${var.dns_zone_name}" }
    SUPABASE_URL             = { value = local.supabase_url }
    SUPABASE_PUBLISHABLE_KEY = { value = nonsensitive(data.supabase_apikeys.main.publishable_key) }
  }

  custom_domains = [
    { name = "${var.client_host}.${var.dns_zone_name}" },
  ]

  lifecycle {
    # See the server resource's identical block above for why.
    ignore_changes = [maintenance_mode, runtime_source]
  }
}
