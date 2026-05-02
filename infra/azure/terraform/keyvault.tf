# ─────────────────────────────────────────────────────────────────────────────
#  Key Vault + Workload Identity for runtime secrets
#
#  Mirrors `Phase 9` of azure-guide.md. All resources here are conditional on
#  `var.enable_key_vault`, so the file is effectively a no-op when the flag
#  is false (its default) — this lets you opt in with a single
#  `terraform apply -var enable_key_vault=true` after the cluster is healthy.
#
#  What this *doesn't* do (still on you, post-apply):
#    * Seed actual secret values into Key Vault. The Terraform-managed RBAC
#      grants you "Key Vault Secrets Officer" so the `az keyvault secret set`
#      commands in 9.2 work without any extra permission setup. We keep the
#      values themselves out of Terraform state (terraform.tfstate is
#      plaintext on disk).
#    * Apply the SecretProviderClass / ServiceAccount YAMLs in 9.4. Those
#      live with the rest of the K8s manifests, not with the Azure infra.
# ─────────────────────────────────────────────────────────────────────────────

# 1. Random suffix for KV name uniqueness when not set explicitly.
#    KV names share a global namespace (like S3 buckets) so a fixed name
#    fails on the second person who runs this.
resource "random_string" "kv_suffix" {
  count   = var.enable_key_vault && var.keyvault_name == null ? 1 : 0
  length  = 6
  special = false
  upper   = false
  numeric = true
}

locals {
  kv_name = var.enable_key_vault ? coalesce(
    var.keyvault_name,
    # Cluster name + random — both lowercase, total < 24 chars.
    substr("${var.cluster_name}-kv-${try(random_string.kv_suffix[0].result, "")}", 0, 24)
  ) : null
}

# 2. Key Vault itself.
#    `enable_rbac_authorization = true` puts data-plane access under Azure RBAC
#    (modern, tenant-scoped) instead of legacy access policies. The CSI driver
#    only cares about RBAC.
resource "azurerm_key_vault" "this" {
  count                         = var.enable_key_vault ? 1 : 0
  name                          = local.kv_name
  location                      = azurerm_resource_group.this.location
  resource_group_name           = azurerm_resource_group.this.name
  tenant_id                     = data.azurerm_client_config.current.tenant_id
  sku_name                      = "standard"
  rbac_authorization_enabled    = true
  purge_protection_enabled      = false # demo only — flip on for prod
  soft_delete_retention_days    = 7
  public_network_access_enabled = true # demo only — set false + use private endpoint for prod
  tags                          = var.tags
}

# 3. Let the human running terraform seed initial secret values.
#    Without this, `az keyvault secret set` in 9.2 fails with "Forbidden"
#    even for the subscription owner — RBAC on the dataplane is independent
#    from RBAC on the management plane.
resource "azurerm_role_assignment" "kv_admin_for_operator" {
  count                = var.enable_key_vault ? 1 : 0
  principal_id         = data.azurerm_client_config.current.object_id
  scope                = azurerm_key_vault.this[0].id
  role_definition_name = "Key Vault Secrets Officer"
}

# 4. User-Assigned Managed Identity for the Pods.
#    A UAMI is a directory object (in Entra) backed by an Azure resource —
#    survives Pod restarts, can be referenced by multiple federations,
#    cleanly destroyed with `terraform destroy`.
resource "azurerm_user_assigned_identity" "app" {
  count               = var.enable_key_vault ? 1 : 0
  name                = "${var.cluster_name}-app-identity"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  tags                = var.tags
}

# 5. Grant the UAMI read access to KV secrets.
resource "azurerm_role_assignment" "kv_reader_for_app" {
  count                = var.enable_key_vault ? 1 : 0
  principal_id         = azurerm_user_assigned_identity.app[0].principal_id
  scope                = azurerm_key_vault.this[0].id
  role_definition_name = "Key Vault Secrets User"
}

# 6. Workload Identity Federation: bind the K8s ServiceAccount to the UAMI.
#    The `subject` format is non-negotiable — kubelet's projected token has
#    exactly this `sub` claim. Mismatches manifest as
#    `failed to get federated identity` in CSI driver logs.
resource "azurerm_federated_identity_credential" "app_sa" {
  count               = var.enable_key_vault ? 1 : 0
  name                = "${var.cluster_name}-app-sa-fc"
  resource_group_name = azurerm_resource_group.this.name
  audience            = ["api://AzureADTokenExchange"]
  issuer              = azurerm_kubernetes_cluster.this.oidc_issuer_url
  parent_id           = azurerm_user_assigned_identity.app[0].id
  subject             = "system:serviceaccount:${var.app_namespace}:${var.app_service_account}"
}
