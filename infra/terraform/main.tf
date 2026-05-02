# ─────────────────────────────────────────────────────────────────────────────
# main.tf
#
# The actual Azure footprint. Each `resource` block here turns into one ARM
# call on `terraform apply`. Resources referenced via interpolation (e.g.
# `azurerm_resource_group.this.name`) form an implicit DAG so Terraform
# creates them in the correct order and tears them down in reverse.
#
# What gets created (≈ $50-80 / month while running, kill with `terraform
# destroy` or `az group delete -n shopdemo-rg --yes --no-wait`):
#
#   1. Resource Group ............... container for everything below
#   2. Container Registry (ACR) ..... where CD pushes the 5 service images
#   3. Log Analytics workspace ...... AKS Container Insights ships logs here
#   4. AKS cluster .................. runs the workload (api-gateway, web,
#                                      user-svc, shop-svc, order-svc)
#   5. AcrPull role assignment ...... lets AKS kubelet pull from ACR with no
#                                      imagePullSecret
#   6. Redis (Basic C0) ............. shop-svc cart cache
#   7. Service Bus namespace+topic+sub  checkout event bus (alternative to
#                                       the Aiven Kafka path)
#   8. Postgres Flexible Server + db  user-svc / order-svc storage
#                                      (firewall rule for your laptop IP)
# ─────────────────────────────────────────────────────────────────────────────

# Random 5-char suffix appended to the Postgres server name. Postgres FQDNs
# are globally unique inside Azure (one tenant can't reuse another tenant's
# `*.postgres.database.azure.com` name within 7 days of deletion), so a
# suffix lets you destroy + reapply without colliding with the soft-deleted
# previous instance. `special = false` and `upper = false` keep the name
# DNS-safe.
resource "random_string" "pg_suffix" {
  length  = 5
  special = false
  upper   = false
}

# Resource Group — the "folder" every other resource lives inside. Deleting
# this RG (e.g. `az group delete`) wipes the whole demo in one shot, which
# is why we keep it dedicated to this stack.
resource "azurerm_resource_group" "this" {
  name     = "${var.prefix}-rg"
  location = var.location
}

# Azure Container Registry. ACR names must be globally unique and alphanum
# only — the `replace(..., "-", "")` strips the dash from `shopdemo-acr` to
# satisfy that. SKU `Basic` is the cheapest tier (~$5/mo); upgrade to
# `Standard` if you need geo-replication or webhooks. `admin_enabled = true`
# turns on the built-in admin user — convenient for `docker login` from CI,
# but in production prefer a Service Principal or workload identity.
resource "azurerm_container_registry" "this" {
  name                = replace("${var.prefix}acr", "-", "")
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  sku                 = "Basic"
  admin_enabled       = true
}

# Log Analytics Workspace — the data lake AKS Container Insights ships pod
# stdout/stderr, kubelet metrics, and node host metrics into. 30-day
# retention keeps cost predictable; bump for compliance scenarios.
# `PerGB2018` is the modern pay-as-you-go SKU (a few cents per GB ingested).
resource "azurerm_log_analytics_workspace" "this" {
  name                = "${var.prefix}-logs"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

# AKS cluster — managed Kubernetes. The `default_node_pool` here doubles as
# the system AND user pool (fine for a demo). For production split system
# pods onto a dedicated taint-protected pool.
#   • vm_size Standard_B2s = 2 vCPU / 4 GiB, burstable, ~$30/mo each.
#   • SystemAssigned identity => Azure auto-creates a managed identity for
#     the control plane; we grant THAT identity AcrPull below.
#   • oms_agent block enables the Container Insights extension that pipes
#     metrics + logs into the Log Analytics workspace above.
resource "azurerm_kubernetes_cluster" "this" {
  name                = "${var.prefix}-aks"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  dns_prefix          = var.prefix

  default_node_pool {
    name       = "default"
    node_count = var.aks_node_count
    vm_size    = "Standard_B2s"
  }

  identity {
    type = "SystemAssigned"
  }

  oms_agent {
    log_analytics_workspace_id = azurerm_log_analytics_workspace.this.id
  }
}

# Grants the AKS *kubelet* identity (separate from the cluster identity, used
# by individual nodes) the `AcrPull` role on our ACR. Effect: pods can
# `image: <acr>/shop-svc:tag` with NO `imagePullSecrets:` block — the kubelet
# authenticates via its managed identity automatically. Without this you'd
# get `ImagePullBackOff` even though the image exists.
resource "azurerm_role_assignment" "aks_acr_pull" {
  principal_id                     = azurerm_kubernetes_cluster.this.kubelet_identity[0].object_id
  role_definition_name             = "AcrPull"
  scope                            = azurerm_container_registry.this.id
  skip_service_principal_aad_check = true
}

# Azure Cache for Redis — Basic tier, capacity 0 = the smallest C0 instance
# (250 MB cache, ~$16/mo). Enough for the cart-state cache shop-svc uses.
# `enable_non_ssl_port = false` forces clients to connect on 6380 (TLS only).
# `minimum_tls_version = "1.2"` rules out legacy clients.
resource "azurerm_redis_cache" "this" {
  name                = "${var.prefix}-redis"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  capacity            = 0
  family              = "C"
  sku_name            = "Basic"
  enable_non_ssl_port = false
  minimum_tls_version = "1.2"
}

# Azure Service Bus namespace. `Standard` is the cheapest tier that supports
# *topics + subscriptions* (we use the pub/sub pattern, not just queues).
# Basic SKU would be ~30% cheaper but only allows queues — wouldn't work for
# our checkout-events topology.
resource "azurerm_servicebus_namespace" "this" {
  name                = "${var.prefix}-sb"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  sku                 = "Standard"
}

# The single topic shop-svc publishes `CheckoutRequested` events to.
# `enable_partitioning = false` because order-svc consumes via a single
# subscription — partitioning only pays off above ~1k msg/s.
resource "azurerm_servicebus_topic" "checkout" {
  name                = "checkout-events"
  namespace_id        = azurerm_servicebus_namespace.this.id
  enable_partitioning = false
}

# order-svc's named subscription on the checkout topic. `max_delivery_count`
# = 10 means a poison message gets retried 10 times before being moved to
# the dead-letter queue (which is enabled implicitly for filter errors via
# `dead_lettering_on_filter_evaluation_error`). Tune both for your retry
# tolerance.
resource "azurerm_servicebus_subscription" "order" {
  name                                      = "order-svc"
  topic_id                                  = azurerm_servicebus_topic.checkout.id
  max_delivery_count                        = 10
  dead_lettering_on_filter_evaluation_error = true
}

# PostgreSQL Flexible Server — cheapest Burstable tier (monthly cost while running).
#   • B_Standard_B1ms = 1 vCPU / 2 GiB, ~$13/mo if running 24/7. Stop the
#     server (`az postgres flexible-server stop`) when idle to pay only for
#     storage (~$3/mo).
#   • Postgres 16 — current LTS line.
#   • password_auth_enabled, AAD off — keeps the demo simple. Enable AAD for
#     production and ditch the admin password.
#   • backup_retention_days = 7 is the minimum; geo-redundant off saves $$.
resource "azurerm_postgresql_flexible_server" "this" {
  name                   = "${var.prefix}-pg-${random_string.pg_suffix.result}"
  resource_group_name    = azurerm_resource_group.this.name
  location               = azurerm_resource_group.this.location
  version                = "16"
  administrator_login    = var.pg_admin_login
  administrator_password = var.pg_admin_password

  storage_mb = 32768
  sku_name   = "B_Standard_B1ms"

  backup_retention_days        = 7
  geo_redundant_backup_enabled = false

  authentication {
    active_directory_auth_enabled = false
    password_auth_enabled         = true
  }
}

# Single application database `user_app` on the server. user-svc owns the
# `users` table here, order-svc owns `orders` / `order_lines` /
# `processed_events` — they don't collide so a shared DB is fine for the
# demo. Split per service for production isolation.
resource "azurerm_postgresql_flexible_server_database" "user_app" {
  name      = "user_app"
  server_id = azurerm_postgresql_flexible_server.this.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# Optional firewall rule punching a hole for your laptop's public IP so
# `psql` works from local dev. `count = var.pg_allowed_ip != "" ? 1 : 0` is
# the Terraform idiom for "create this resource only when the variable is
# non-empty" — leaving `pg_allowed_ip = ""` skips it entirely (e.g. when
# all your traffic comes from inside AKS).
resource "azurerm_postgresql_flexible_server_firewall_rule" "client" {
  count            = var.pg_allowed_ip != "" ? 1 : 0
  name             = "allow-client"
  server_id        = azurerm_postgresql_flexible_server.this.id
  start_ip_address = var.pg_allowed_ip
  end_ip_address   = var.pg_allowed_ip
}
