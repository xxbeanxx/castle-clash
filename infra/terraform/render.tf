# The Render counterparts of the two azurerm_container_app resources in
# container-apps.tf. Unlike those, nothing here is `lifecycle.ignore_changes`d:
# the deploy workflow (.github/workflows/deploy-environment.yaml) updates the
# running image by running `terraform apply -var server_image=... -var
# client_image=...` directly, so Terraform is the one thing that changes it on
# every release rather than a side-channel imperative call.
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
}
