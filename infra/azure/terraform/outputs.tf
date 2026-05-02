# ─────────────────────────────────────────────────────────────────────────────
#  Outputs — everything you'll paste into GitHub or your shell after apply.
#
#  Run `terraform output` to print them, or `terraform output -raw <name>` to
#  pipe a single value (e.g. into `gh secret set`).
# ─────────────────────────────────────────────────────────────────────────────

output "resource_group_name" {
  description = "RG name. Use with `az aks get-credentials -g <this> -n <cluster>`."
  value       = azurerm_resource_group.this.name
}

output "cluster_name" {
  description = "AKS cluster name. Set as GitHub Variable `AKS_CLUSTER_NAME`."
  value       = azurerm_kubernetes_cluster.this.name
}

output "cluster_oidc_issuer_url" {
  description = "Public OIDC issuer URL for the cluster. Useful for sanity-checking workload identity setup. Should resolve to a JSON discovery doc."
  value       = azurerm_kubernetes_cluster.this.oidc_issuer_url
}

output "kubeconfig_command" {
  description = "Copy-paste this into your shell after apply to point kubectl at the new cluster."
  value       = "az aks get-credentials --resource-group ${azurerm_resource_group.this.name} --name ${azurerm_kubernetes_cluster.this.name} --overwrite-existing"
}

# ── GitHub Actions wiring ────────────────────────────────────────────────────

output "github_variables" {
  description = "Paste these into GitHub → Settings → Secrets and variables → Actions → Variables tab."
  value = {
    AKS_CLUSTER_NAME      = azurerm_kubernetes_cluster.this.name
    AKS_RESOURCE_GROUP    = azurerm_resource_group.this.name
    AZURE_TENANT_ID       = data.azurerm_client_config.current.tenant_id
    AZURE_SUBSCRIPTION_ID = data.azurerm_client_config.current.subscription_id
  }
}

output "github_secrets" {
  description = "Paste these into GitHub → Settings → Secrets and variables → Actions → Secrets tab. (AZURE_CLIENT_ID is technically not a secret but storing it as one keeps it out of forks.)"
  value = {
    AZURE_CLIENT_ID = azuread_application.ci.client_id
  }
  # Marking the whole map sensitive so Terraform doesn't print client_id
  # in plain-text on every plan/apply diff.
  sensitive = true
}

output "ci_service_principal_object_id" {
  description = "Object ID of the SP. Useful if you want to grant additional Azure RBAC roles by hand (e.g. AcrPush on an ACR)."
  value       = azuread_service_principal.ci.object_id
}

output "federated_credential_subjects" {
  description = "All subjects this App will accept from GitHub OIDC tokens. Compare against the `sub` claim in a failing run if you hit AADSTS70021."
  value       = [for c in azuread_application_federated_identity_credential.ci : c.subject]
}

# ── Key Vault outputs (only meaningful when var.enable_key_vault = true) ─────

output "keyvault_name" {
  description = "Key Vault name. Plug into the SecretProviderClass YAML in azure-guide.md Phase 9.4 (`keyvaultName`)."
  value       = try(azurerm_key_vault.this[0].name, null)
}

output "keyvault_uri" {
  description = "Key Vault dataplane URI. Useful for `az keyvault secret set --id <uri>/secrets/<name>`."
  value       = try(azurerm_key_vault.this[0].vault_uri, null)
}

output "app_identity_client_id" {
  description = "User-Assigned Managed Identity client ID. Plug into the SecretProviderClass `clientID` AND the ServiceAccount's `azure.workload.identity/client-id` annotation in azure-guide.md Phase 9.4."
  value       = try(azurerm_user_assigned_identity.app[0].client_id, null)
}

output "app_identity_principal_id" {
  description = "Object ID of the UAMI. Use to grant additional Azure RBAC roles by hand if you want the Pods to talk to other Azure services (Storage, Service Bus, etc.)."
  value       = try(azurerm_user_assigned_identity.app[0].principal_id, null)
}

output "secret_seeding_commands" {
  description = "Copy-paste commands to seed Key Vault with the four app secrets (matches Phase 9.2). Run AFTER `terraform apply`. Replace the placeholder URLs."
  value = var.enable_key_vault ? join("\n", [
    "az keyvault secret set --vault-name ${try(azurerm_key_vault.this[0].name, "")} --name DATABASE-URL --value 'postgresql://USER:PASS@HOST.neon.tech/neondb?sslmode=require'",
    "az keyvault secret set --vault-name ${try(azurerm_key_vault.this[0].name, "")} --name MONGO-URI    --value 'mongodb+srv://USER:PASS@HOST.mongodb.net/shop?retryWrites=true&w=majority'",
    "az keyvault secret set --vault-name ${try(azurerm_key_vault.this[0].name, "")} --name REDIS-URL    --value 'rediss://default:PASS@HOST.upstash.io:6379'",
    "az keyvault secret set --vault-name ${try(azurerm_key_vault.this[0].name, "")} --name JWT-SECRET   --value \"$(openssl rand -base64 48)\"",
  ]) : null
}
