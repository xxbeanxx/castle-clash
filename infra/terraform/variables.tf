variable "subscription_id" {
  description = "Azure subscription that holds rg-castle-clash and the atomic-nucleus.com DNS zone."
  type        = string
  default     = "42bf0527-ba43-4c35-b994-ab2a570a6492"
}

variable "tenant_id" {
  description = "Entra tenant that owns the deploy identity."
  type        = string
  default     = "fc8e5e3c-506e-4cbb-a1b6-2a977c65ab46"
}

variable "location" {
  description = "Azure region for every resource in the resource group."
  type        = string
  default     = "canadacentral"
}

variable "resource_group_name" {
  type    = string
  default = "rg-castle-clash"
}

variable "dns_zone_name" {
  description = "Existing public DNS zone the app hostnames live in. Managed by another repo; only read here."
  type        = string
  default     = "atomic-nucleus.com"
}

variable "dns_zone_resource_group_name" {
  description = "Resource group holding the DNS zone."
  type        = string
  default     = "DefaultResourceGroup-CCAN"
}

variable "client_host" {
  description = "Subdomain (relative to dns_zone_name) serving the web client."
  type        = string
  default     = "castle-clash"
}

variable "game_host" {
  description = "Subdomain (relative to dns_zone_name) serving the Colyseus game server."
  type        = string
  default     = "castle-clash-game"
}

variable "github_owner" {
  description = "GitHub user or organisation that owns the repository."
  type        = string
  default     = "xxbeanxx"
}

variable "github_repository_name" {
  type    = string
  default = "castle-clash"
}

variable "github_reviewer_user_id" {
  description = "Numeric id of the GitHub user who must approve production deployments."
  type        = number
  default     = 997639
}

variable "supabase_organization_id" {
  description = "Slug of the Supabase organisation that owns the project."
  type        = string
  default     = "jbtukpsdwnmwygegogxe"
}

variable "supabase_project_name" {
  type    = string
  default = "castle-clash"
}

variable "supabase_region" {
  type    = string
  default = "ca-central-1"
}

variable "server_cpu" {
  description = "vCPU for the server app, applied by the deploy workflow. The Consumption profile allows at most 2."
  type        = string
  default     = "1.0"
}

variable "server_memory" {
  description = "Memory for the server app, applied by the deploy workflow. The Consumption profile allows at most 4Gi."
  type        = string
  default     = "2Gi"
}

variable "client_min_replicas" {
  description = "Minimum replicas for the client app, applied by the deploy workflow."
  type        = number
  default     = 1
}

variable "server_image" {
  description = <<-EOT
    Server image pinned by digest: ghcr.io/<owner>/castle-clash-server@sha256:...
    Only sets the image at create time - render.tf's `ignore_changes` means
    a later apply never updates it. The deploy workflow moves the running
    image with `render deploys create --image` instead (see render.tf's top
    comment for why).
  EOT
  type        = string
  default     = "ghcr.io/xxbeanxx/castle-clash-server@sha256:cf4600aab3bc2aae739496b8ee252a8be3dc9d0e9145dcbfa89341a66caf1a9d"
}

variable "client_image" {
  description = "Client image pinned by digest, same shape as server_image."
  type        = string
  default     = "ghcr.io/xxbeanxx/castle-clash-client@sha256:f503b49aed31a2b7ca1a81bb09f51c9b0f20f2c86eaec4c94d631ab954446ae8"
}

variable "render_owner_id" {
  description = "Render workspace/owner id (Account or Team settings page, in the URL)."
  type        = string
  default     = "tea-datonbu0tbcc73en31r0"
}

variable "render_api_key" {
  description = <<-EOT
    Render API key CI uses to deploy (Render dashboard: Account Settings ->
    API Keys). Pass it only when setting or rotating it, as
    TF_VAR_render_api_key in the environment, never in a file - Terraform
    writes it straight into the GitHub `production` environment secret. Left
    null, the existing GitHub secret (if any) is left untouched.
  EOT
  type        = string
  default     = null
  sensitive   = true
}

variable "supabase_access_token_ci" {
  description = <<-EOT
    Supabase personal access token CI uses for its own `terraform apply` and
    `supabase db push` (Supabase dashboard: Account -> Access Tokens - a
    scoped token limited to this project is enough, see infra/terraform's
    README). Pass it only when setting or rotating it, as
    TF_VAR_supabase_access_token_ci in the environment, never in a file. Left
    null, the existing GitHub secret (if any) is left untouched.
  EOT
  type        = string
  default     = null
  sensitive   = true
}

variable "github_oidc_subject_prefix" {
  description = <<-EOT
    Subject prefix GitHub puts in OIDC tokens for this repo. The repo has opted in to
    immutable subjects (owner and repo ids baked in), so it is not simply `repo:<owner>/<name>`.
    Read it with: gh api repos/xxbeanxx/castle-clash/actions/oidc/customization/sub --jq .sub_claim_prefix
  EOT
  type        = string
  default     = "repo:xxbeanxx@997639/castle-clash@1370518775"
}

variable "supabase_google_client_id" {
  description = <<-EOT
    OAuth client id of the Google Cloud web client (created by scripts/setup-google-login.sh). Not a
    secret. While empty, Terraform does not manage Google sign-in at all; once set it enables the
    provider. The wizard writes it to google.auto.tfvars, which Terraform loads automatically.
  EOT
  type        = string
  default     = ""
}

variable "supabase_google_client_secret" {
  description = <<-EOT
    OAuth client secret for the Google web client. Pass it only when setting or rotating it, as
    TF_VAR_supabase_google_client_secret in the environment, never in a file. Left null, the secret
    is not sent and Supabase keeps the one it has. Google shows a secret once, when it is created.
  EOT
  type        = string
  default     = null
  sensitive   = true
}

variable "supabase_extra_redirect_urls" {
  description = <<-EOT
    Other redirect URLs Supabase Auth must keep allowing, besides the client's /auth/callback. The
    project's allow-list is managed here as a whole, so anything set in the dashboard that is not
    listed is removed by the next apply: read the first plan's uri_allow_list line for what is there.
    Entries are glob-matched including any query string (docs/research/phase12-supabase-google-oauth.md, finding 11).
  EOT
  type        = list(string)
  default     = []
}
