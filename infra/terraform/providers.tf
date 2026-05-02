# ─────────────────────────────────────────────────────────────────────────────
# providers.tf
#
# Tells Terraform WHICH external providers (Azure, random, etc.) to download
# into `.terraform/` on `terraform init`, and HOW to authenticate against them.
# Nothing in this file creates Azure resources — it just configures the engine.
#
# When to touch this file:
#   - bumping a provider version (e.g. azurerm from 3.x → 4.x)
#   - adding a new provider (e.g. `helm`, `kubernetes`, `mongodbatlas`)
#   - switching to a remote state backend (uncomment the `backend` block)
# ─────────────────────────────────────────────────────────────────────────────

# `terraform { ... }` is the meta-config block. It pins the Terraform CLI
# version every contributor must use and locks each provider to a compatible
# release range so a `terraform init` six months from now still produces the
# same plan output.
terraform {
  # Anything older than 1.5.0 lacks the optional-attribute syntax we rely on.
  required_version = ">= 1.5.0"

  # `required_providers` declares the third-party plugins the module imports.
  # `~> 3.114` means ">= 3.114, < 4.0" — accept patch + minor bumps inside the
  # 3.x line, but never silently jump to 4.x (which would reshape resource
  # schemas and likely break this configuration).
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.114"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

# `provider "azurerm"` configures the Azure provider instance.
# `features {}` is mandatory but left empty — every default behaviour is fine
# for a demo workspace. Real-world tenants typically toggle things like
# `key_vault { purge_soft_delete_on_destroy = true }` here.
#
# Authentication is picked up implicitly from whichever of these is present
# (in priority order):
#   1. `ARM_*` environment variables (CI / service principal)
#   2. The Azure CLI session (`az login`) — what we use locally
#   3. Managed Identity if Terraform itself runs on Azure
provider "azurerm" {
  features {}
}
