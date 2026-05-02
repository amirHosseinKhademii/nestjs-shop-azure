# ─────────────────────────────────────────────────────────────────────────────
#  Providers + Terraform version pin
#
#  We need TWO Azure providers, each does a different thing:
#    * azurerm  → Azure resources (resource groups, AKS clusters, role
#                 assignments). This is the big one.
#    * azuread  → Microsoft Entra ID (formerly Azure AD): App Registrations,
#                 Service Principals, Federated Credentials. These are
#                 *directory* objects, not Azure subscription resources, which
#                 is why they live in a separate provider.
#
#  Auth: both providers transparently pick up `az login` credentials from
#  ~/.azure on your laptop. In CI you'd use `azure/login@v2` first (same as
#  the deploy job), and Terraform will pick up the env vars it sets.
# ─────────────────────────────────────────────────────────────────────────────
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3.0"
    }
  }

  # Optional but strongly recommended once more than one person touches this:
  # remote state in an Azure Storage Account + container with state locking
  # via Azure blob lease. Uncomment + create the storage account + container
  # by hand once, then `terraform init -migrate-state`.
  #
  # backend "azurerm" {
  #   resource_group_name  = "tfstate-rg"
  #   storage_account_name = "tfstateshopdemo"
  #   container_name       = "tfstate"
  #   key                  = "aks-guide.tfstate"
  # }
}

provider "azurerm" {
  # `features {}` is mandatory for azurerm — every sub-block inside is
  # opt-in behavior tweaks. Empty = sensible defaults.
  features {}
}

provider "azuread" {
  # Same idea — Microsoft Entra provider needs no config when you're already
  # logged in via `az login`.
}
