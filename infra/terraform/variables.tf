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

variable "supabase_url" {
  description = "Hosted Supabase project URL, exposed to the deploy workflow as SUPABASE_URL."
  type        = string
  default     = "https://vrcxprhmonzpuelfnijy.supabase.co"
}

variable "supabase_publishable_key" {
  description = "Supabase publishable key. Designed to ship in every browser bundle, so it is not a secret."
  type        = string
  default     = "sb_publishable_7LPBCXfM5c1YpHHp-uAi6w_VdA4i-US"
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

variable "github_oidc_subject_prefix" {
  description = <<-EOT
    Subject prefix GitHub puts in OIDC tokens for this repo. The repo has opted in to
    immutable subjects (owner and repo ids baked in), so it is not simply `repo:<owner>/<name>`.
    Read it with: gh api repos/xxbeanxx/castle-clash/actions/oidc/customization/sub --jq .sub_claim_prefix
  EOT
  type        = string
  default     = "repo:xxbeanxx@997639/castle-clash@1370518775"
}
