# ─────────────────────────────────────────────────────────────────────────────
#  Inputs — everything tweakable lives here so `main.tf` stays readable.
#
#  Every variable has a sensible default that matches `azure-guide.md`. The
#  only one you MUST set in `terraform.tfvars` is `github_repo`.
# ─────────────────────────────────────────────────────────────────────────────

variable "location" {
  description = "Azure region for the resource group + cluster (e.g. westeurope, eastus, uksouth). `az account list-locations -o table` lists everything available to your subscription."
  type        = string
  default     = "westeurope"
}

variable "resource_group_name" {
  description = "Name of the resource group that holds everything. Mirrors RG=shop-demo-rg in the guide. Deleting the RG = full teardown."
  type        = string
  default     = "shop-demo-rg"
}

variable "cluster_name" {
  description = "AKS cluster name (matches CLUSTER=shop-demo in the guide). Becomes part of the kubeconfig context."
  type        = string
  default     = "shop-demo"
}

variable "node_count" {
  description = "Number of nodes in the default node pool. 2 is the minimum for any meaningful HA (lets you drain one for upgrades)."
  type        = number
  default     = 2
}

variable "node_vm_size" {
  description = "VM SKU for the default node pool. Standard_B2s = 2 vCPU / 4 GiB / ~$0.04/hr — cheapest size that fits the whole stack."
  type        = string
  default     = "Standard_B2s"
}

variable "kubernetes_version" {
  description = "AKS Kubernetes version. Leave null to let Azure pick the current default (recommended for demos)."
  type        = string
  default     = null
}

# ── CI/CD wiring (Workload Identity Federation) ──────────────────────────────

variable "ci_app_name" {
  description = "Display name of the App Registration GitHub Actions will federate into (matches APP_NAME in the guide)."
  type        = string
  default     = "github-actions-shop-cd"
}

variable "github_repo" {
  description = "GitHub repo in `OWNER/REPO` form. Used to scope the federated credential's `sub` claim. Anything else federating against this App will be rejected by Entra."
  type        = string
  # No default — forces you to set it. Wrong value here is the #1 cause of
  # the AADSTS70021 'No matching federated identity record found' failure.
}

variable "github_environments" {
  description = "GitHub Actions Environments allowed to federate. Each entry creates one federated credential bound to that environment, on top of the always-on `main` branch credential."
  type        = list(string)
  default     = ["production-aks"]
}

variable "github_branches" {
  description = "Git branches allowed to federate (in addition to environments above). Defaults to just `main` so PR previews can't deploy."
  type        = list(string)
  default     = ["main"]
}

# ── Key Vault for runtime secrets (Phase 9 in azure-guide.md) ────────────────
#
#  When enabled, Terraform also creates:
#    * Key Vault (RBAC mode, soft-delete on)
#    * "Key Vault Secrets Officer" role for the human running terraform
#      (so seeding secret values from your laptop just works)
#    * User-Assigned Managed Identity for Pods to authenticate as
#    * "Key Vault Secrets User" role on the UAMI
#    * Federated credential binding the K8s ServiceAccount
#      (`system:serviceaccount:<ns>:<sa>`) to the UAMI
#
#  None of these get installed if `enable_key_vault = false`. Lets you
#  bring up the cluster first, then opt into KV later with one apply.

variable "enable_key_vault" {
  description = "Provision Azure Key Vault + UAMI + workload-identity federation for the app's ServiceAccount. Set to true to enable Phase 9 of azure-guide.md."
  type        = bool
  default     = false
}

variable "keyvault_name" {
  description = "Globally unique name for the Key Vault (3–24 chars, lowercase + digits + dashes). When null, terraform appends a random suffix to the cluster name."
  type        = string
  default     = null
}

variable "app_namespace" {
  description = "Kubernetes namespace where the app Pods run. Used to scope the workload-identity federation subject."
  type        = string
  default     = "shop"
}

variable "app_service_account" {
  description = "Kubernetes ServiceAccount name the Pods use. The federated credential binds `system:serviceaccount:<app_namespace>:<app_service_account>` to the UAMI."
  type        = string
  default     = "shop-app"
}

# ── Tags everything, useful for cost reports + cleanup automation ────────────

variable "tags" {
  description = "Tags applied to every resource. Show up in Azure Cost Analysis grouped views."
  type        = map(string)
  default = {
    project     = "shop-nest-azure"
    environment = "demo"
    managed-by  = "terraform"
    purpose     = "azure-guide"
  }
}
