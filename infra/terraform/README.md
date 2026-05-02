# Terraform — Azure skeleton

Creates a minimal footprint suitable for demos:

- Resource group
- Azure Container Registry (ACR)
- AKS cluster with Log Analytics / Container Insights agent
- Azure Cache for Redis (Basic)
- Azure Service Bus (Standard) + topic `checkout-events` + subscription `order-svc`
- Role assignment so AKS kubelet can pull from ACR
- **PostgreSQL Flexible Server** (Burstable `B_Standard_B1ms`) + database `user_app` + optional firewall rule for your public IP

Before `terraform apply`, copy `terraform.tfvars.example` → `terraform.tfvars` and set `pg_admin_password` and `pg_allowed_ip` (`curl -s ifconfig.me`). After apply, use outputs `postgres_fqdn`, `postgres_admin_login`, and set `PGSSL=true` for **user-svc** (TLS required by Azure).

Stop the server when idle to save compute: `az postgres flexible-server stop -g <rg> -n <server-name>`.

## MongoDB hosting (`mongo_choice`)

The shop service expects MongoDB (`MONGO_URI`). Typical options:

| Option | When to use |
|--------|----------------|
| **MongoDB Atlas** | Fastest managed choice for a portfolio app |
| **Azure Cosmos DB for Mongo API** | Stay fully on Azure; watch RU cost |
| **Docker Mongo** | Local / lab only — **not** for production |

Wire the connection string via Kubernetes Secret or Key Vault + CSI.

## State backend

For teams, configure remote state (Azure Storage account + container) before sharing environments.

## Apply

```bash
cd infra/terraform
terraform init
terraform apply
```

Authenticate with Azure CLI (`az login`) and select subscription first.
