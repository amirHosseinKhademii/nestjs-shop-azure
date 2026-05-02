# ─────────────────────────────────────────────────────────────────────────────
#  Resource group + AKS cluster
#
#  Mirrors `Phase 3` of azure-guide.md — the equivalent of:
#
#    az group create --name $RG --location $LOC
#    az aks create  --resource-group $RG --name $CLUSTER ... \
#       --enable-managed-identity --enable-oidc-issuer \
#       --enable-workload-identity --network-plugin azure
# ─────────────────────────────────────────────────────────────────────────────

# 1. Resource group — the billing + lifecycle boundary. Deleting this RG
#    nukes everything below it in one shot (`az group delete --name $RG`).
resource "azurerm_resource_group" "this" {
  name     = var.resource_group_name
  location = var.location
  tags     = var.tags
}

# 2. AKS cluster.
#    The chosen flags MUST match the guide for the rest of the setup to work:
#      identity { type = "SystemAssigned" }   →  --enable-managed-identity
#      oidc_issuer_enabled       = true       →  --enable-oidc-issuer
#      workload_identity_enabled = true       →  --enable-workload-identity
#      network_profile.network_plugin = "azure"  →  --network-plugin azure
resource "azurerm_kubernetes_cluster" "this" {
  name                = var.cluster_name
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  dns_prefix          = var.cluster_name       # part of the API server FQDN
  kubernetes_version  = var.kubernetes_version # null = AKS default
  tags                = var.tags

  # Public API server. For prod, set api_server_access_profile to lock it
  # down to your CI runners' egress IPs (or use a private cluster).
  # private_cluster_enabled = false  # default

  # Default (system) node pool — runs CoreDNS, metrics-server, etc.
  # 2 × Standard_B2s is the cheapest combo that fits the whole stack.
  default_node_pool {
    name       = "default"
    node_count = var.node_count
    vm_size    = var.node_vm_size

    # Required when network_plugin = "azure" — we'd add VNet CIDR sizing
    # here for prod. Defaults are fine for a demo subnet.
    # vnet_subnet_id = azurerm_subnet.aks.id
  }

  # SystemAssigned managed identity on the cluster control plane —
  # the kubelet identity (separate, also system-managed) is what nodes
  # use to pull images, talk to ACR, etc.
  identity {
    type = "SystemAssigned"
  }

  # Required to mint OIDC tokens that GitHub Actions can federate against.
  # Without it, the App Registration trust we create later has nothing to
  # validate Pod identities against.
  oidc_issuer_enabled       = true
  workload_identity_enabled = true

  # Azure CNI (each Pod gets a real VNet IP). Required for:
  #   * Azure Network Policy (matches infra/k8s/network-policies.yaml)
  #   * Workload identity (kubelet needs Pod IPs to be routable in the VNet)
  network_profile {
    network_plugin    = "azure"
    network_policy    = "azure" # alternatives: "calico", "cilium"
    load_balancer_sku = "standard"
  }

  # Enable Azure RBAC for Kubernetes Authorization — lets us grant cluster
  # access via Azure role assignments below, instead of fiddling with
  # ClusterRoleBindings + kubeconfig users.
  role_based_access_control_enabled = true

  azure_active_directory_role_based_access_control {
    azure_rbac_enabled = true
    # Tenant the cluster trusts for AAD identities. We pull it from the
    # current az login context — same tenant as your subscription, so the
    # role assignments below work without any cross-tenant gymnastics.
    tenant_id = data.azurerm_client_config.current.tenant_id
  }

  lifecycle {
    # Don't recreate the cluster just because Azure rolls a new patch
    # version on `kubernetes_version = null`. Bump it intentionally instead.
    ignore_changes = [
      kubernetes_version,
      default_node_pool[0].node_count, # Allow autoscaler / `az aks scale` later
    ]
  }
}
