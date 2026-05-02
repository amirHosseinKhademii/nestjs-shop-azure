# ─────────────────────────────────────────────────────────────────────────────
#  CI/CD wiring — Workload Identity Federation for GitHub Actions
#
#  Mirrors `Phase 6` of azure-guide.md — the equivalent of:
#
#    az ad app create --display-name $APP_NAME
#    az ad sp create  --id $APP_ID
#    az ad app federated-credential create --id $APP_ID ...    (×N)
#    az role assignment create --assignee-object-id ...
#
#  The end result: GitHub Actions trades its short-lived OIDC token for an
#  Azure access token tied to a Service Principal that has just enough RBAC
#  to fetch the kubeconfig + run `kubectl apply`. No client secret, no key
#  rotation, no long-lived credentials anywhere.
# ─────────────────────────────────────────────────────────────────────────────

# 1. App Registration. Think of it as the "identity definition" — the SP
#    below is the "instance" of that identity in this tenant.
resource "azuread_application" "ci" {
  display_name = var.ci_app_name

  # We don't need any API permissions, identifier_uris, or redirect URIs —
  # this app exists purely to be federated against by GitHub OIDC.
}

# 2. Service Principal — this is what role assignments target. Created
#    automatically by `az ad sp create`, but Terraform makes it explicit.
resource "azuread_service_principal" "ci" {
  client_id = azuread_application.ci.client_id
  # owners = [data.azuread_client_config.current.object_id]   # uncomment for prod
}

# 3. Federated credentials — one per branch, one per environment.
#
#    The `subject` field is what Entra checks against the OIDC token's
#    `sub` claim. The format MUST match exactly:
#       repo:OWNER/REPO:ref:refs/heads/<branch>
#       repo:OWNER/REPO:environment:<env-name>
#       repo:OWNER/REPO:ref:refs/tags/<tag>
#       repo:OWNER/REPO:pull_request                         (PR runs)
#
#    Mismatches manifest as the GitHub Actions error:
#      AADSTS70021: No matching federated identity record found for
#      presented assertion.
locals {
  branch_creds = {
    for b in var.github_branches :
    "branch-${b}" => {
      name    = "${var.ci_app_name}-branch-${b}"
      subject = "repo:${var.github_repo}:ref:refs/heads/${b}"
      desc    = "GitHub Actions: ${b} branch"
    }
  }

  env_creds = {
    for e in var.github_environments :
    "env-${e}" => {
      name    = "${var.ci_app_name}-env-${e}"
      subject = "repo:${var.github_repo}:environment:${e}"
      desc    = "GitHub Actions: ${e} environment"
    }
  }

  all_creds = merge(local.branch_creds, local.env_creds)
}

resource "azuread_application_federated_identity_credential" "ci" {
  for_each = local.all_creds

  application_id = azuread_application.ci.id
  display_name   = each.value.name
  description    = each.value.desc
  audiences      = ["api://AzureADTokenExchange"] # constant — required by GitHub OIDC
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = each.value.subject
}

# 4. RBAC assignments scoped to the AKS cluster.
#
#    Two roles, doing two different things:
#      a. "Azure Kubernetes Service Cluster User Role" → lets the SP run
#         `az aks get-credentials` to fetch the kubeconfig.
#      b. "Azure Kubernetes Service RBAC Cluster Admin" → lets that
#         kubeconfig's identity actually run `kubectl apply`.
#
#    For prod, swap (b) for "Azure Kubernetes Service RBAC Writer" scoped
#    to a single namespace (e.g. /providers/Microsoft.ContainerService/.../namespaces/shop).

resource "azurerm_role_assignment" "aks_cluster_user" {
  principal_id         = azuread_service_principal.ci.object_id
  scope                = azurerm_kubernetes_cluster.this.id
  role_definition_name = "Azure Kubernetes Service Cluster User Role"
}

resource "azurerm_role_assignment" "aks_rbac_admin" {
  principal_id         = azuread_service_principal.ci.object_id
  scope                = azurerm_kubernetes_cluster.this.id
  role_definition_name = "Azure Kubernetes Service RBAC Cluster Admin"
}

# 5. (Lookup helpers, used by outputs.tf to print the values you'll paste
#    into GitHub Secrets.)
data "azurerm_client_config" "current" {}
