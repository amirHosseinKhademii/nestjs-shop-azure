# ─────────────────────────────────────────────────────────────────────────────
# variables.tf
#
# All INPUTS the module accepts. Set them at apply-time via:
#   • terraform.tfvars (gitignored — see terraform.tfvars.example for the
#     template). This is the normal local-dev path.
#   • -var "key=value" CLI flags (one-off override).
#   • TF_VAR_<name> environment variables (CI / pipelines).
#
# A variable with no `default` is REQUIRED — Terraform will refuse to plan
# until it's supplied somehow. A `default` makes the variable optional.
# `sensitive = true` redacts the value from `terraform plan / apply` output
# (still stored unencrypted in state, so always use a remote state backend
# with encryption-at-rest in production).
# ─────────────────────────────────────────────────────────────────────────────

# Azure region every resource is created in. `westeurope` is closest to most
# European demos and has the full feature set. Change to e.g. `eastus` /
# `northeurope` to match a different audience.
variable "location" {
  type        = string
  description = "Azure region"
  default     = "westeurope"
}

# String inserted into every resource name (e.g. "shopdemo-rg", "shopdemo-aks").
# Keep it short and lowercase — Azure has 24-character limits on several
# services (ACR, Storage). The ACR name strips dashes from this prefix.
variable "prefix" {
  type        = string
  description = "Prefix for resource names"
  default     = "shopdemo"
}

# Number of AKS user-pool nodes (`Standard_B2s`, ~$30/mo each). Two is the
# bare minimum for a multi-replica deployment surviving a node restart.
variable "aks_node_count" {
  type        = number
  description = "Initial AKS user node pool size (demo)"
  default     = 2
}

# Documentation-only choice — Terraform doesn't actually create a Mongo
# instance here (Atlas isn't an Azure resource, Cosmos has wildly different
# pricing, dev-only Docker isn't IaaC). The value is echoed in an output so
# you remember which path the deployment was sized for.
variable "mongo_choice" {
  type        = string
  description = "Document how you host MongoDB: atlas | cosmos | dev-only"
  default     = "atlas"
}

# Postgres Flexible Server admin login. `pgadmin` is a sensible default; the
# value lands in connection strings only, never in URLs that need URL-encoding.
variable "pg_admin_login" {
  type        = string
  description = "Azure PostgreSQL Flexible Server admin login"
  default     = "pgadmin"
}

# Postgres admin password — REQUIRED. Set it in `terraform.tfvars` (gitignored)
# or via `TF_VAR_pg_admin_password` in CI. Marked `sensitive` so it doesn't
# appear in plan/apply logs. Min 8 chars, mix of upper/lower/digit per Azure
# password policy.
variable "pg_admin_password" {
  type        = string
  description = "Azure PostgreSQL Flexible Server admin password (set in terraform.tfvars, never commit)"
  sensitive   = true
}

# Single public IP allowed through the Postgres firewall (for local
# psql / dev workloads). Empty disables the firewall rule entirely — useful
# when ALL your dev traffic comes from inside AKS and you don't want a
# laptop punch-through. Find your IP with `curl -s ifconfig.me`.
variable "pg_allowed_ip" {
  type        = string
  description = "Your public IP so local dev can connect (curl -s ifconfig.me). Leave empty and add a firewall rule in Portal later."
  default     = ""
}
