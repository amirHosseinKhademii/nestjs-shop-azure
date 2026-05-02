# Azure (AKS) deployment guide — from zero to live

A first-time-on-Azure walkthrough that takes the **`web` + `api-gateway`
+ `user-svc` + `shop-svc` + `order-svc`** stack from "I just signed up
to Azure" to "my browser is showing the deployed app" — with proper
secrets, network isolation, and a CI/CD pipeline.

This is the Azure mirror of the AWS walkthrough in
[`infra/aws/eks-overlay/Readme.md`](../../aws/eks-overlay/Readme.md).
Same topology, same security model, same `kubectl apply -k` flow — only
the cloud-specific bits change.

```
browser
   │  (1) DNS → Azure LB public IP
   ▼
Azure Standard Load Balancer        ← only thing public
   │
   ▼
ingress-nginx (in cluster)
   ├── /            ──▶ web         (static SPA, ClusterIP)
   └── /graphql     ──▶ api-gateway (NestJS,    ClusterIP)
                              │
                              ├──▶ user-svc  :3001  (ClusterIP, no Ingress)
                              ├──▶ shop-svc  :3002  (ClusterIP, no Ingress)
                              └──▶ order-svc :3003  (ClusterIP, no Ingress)

{user,shop,order}-svc ──▶ public internet
                          (Neon Postgres / Mongo Atlas / Upstash Redis)
```

You will need:

- An email + a credit/debit card Azure will accept (some prepaid /
  Revolut-style cards get rejected — use a real Visa/Mastercard).
- A Docker Hub account (or any container registry — ACR works too, see
  Phase 5b).
- A GitHub repo containing this monorepo (or a fork).
- A laptop with bash / zsh.
- ~30–45 minutes end-to-end.

Total cost while running: **~$0.10/hr** (2 × `Standard_B2s` nodes + 1
public IP + LB rules). Cluster shutdown = $0. Teardown is one
`az group delete` at the end.

> **Prefer infrastructure-as-code?** Phases 3 + 6 (resource group,
> AKS cluster, App Registration, federated credentials, RBAC) — and
> optionally Phase 9 (Key Vault) — are also available as Terraform in
> [`infra/azure/terraform/`](../terraform/). Run
> `terraform apply` there instead of the `az` commands in those phases.

### Roadmap

| Phase | What you do | Time |
| --- | --- | --- |
| 1 | Sign up for Azure | 5 min |
| 2 | Install `az` / `kubectl` / `helm`, log in | 5 min |
| 3 | Provision the AKS cluster | ~7 min |
| 4 | Install `ingress-nginx` and grab the public IP | ~3 min |
| 5 | Pick a container registry (Docker Hub or ACR) | 0–2 min |
| 6 | Wire CI auth — **GitHub Actions Workload Identity Federation** + optional **Azure DevOps Service Connection** | ~10 min |
| 7 | Deploy the app | ~5 min |
| 8 | Verify pods, ingress, NetworkPolicy isolation | ~2 min |
| 9 | *(Optional)* Upgrade secret management to **Azure Key Vault + CSI driver** | ~10 min |
| 10 | Troubleshooting reference | as needed |
| 11 | Teardown | ~3 min |

---

## Phase 1 — Azure account (5 min)

1. Open <https://azure.microsoft.com/free> and click **Start free**.
2. Sign in with a Microsoft account (use your work email if you'd
   rather not link a personal one — they're independent).
3. Fill in:
   - Country / region (this is for billing, **not** the cluster region).
   - Phone number → SMS / call verification.
   - Card details. The free tier preauthorizes ~$1 then refunds it. If
     it rejects your card, retry with a different one — Azure is
     stricter than AWS about prepaid / virtual cards.
4. After the wizard finishes you land on the **Azure Portal**
   (<https://portal.azure.com>). Click **Subscriptions** in the search
   bar at the top to confirm you have a `Free Trial` (or
   `Pay-As-You-Go`) subscription with **Active** status.
5. Copy the **Subscription ID** — you'll need it in Phase 2.

> The free trial gives you $200 credit for 30 days. Even at full burn
> the cluster in this guide costs ~$70/month, so a full demo cycle
> (deploy → verify → teardown) costs $1–2 of credit.

---

## Phase 2 — Local tools (5 min)

You can run everything from your laptop. The Azure Portal *can* do
most of this through the UI, but the CLI is faster and reproducible.

### 2.1 Install the Azure CLI (`az`)

```bash
# macOS
brew install azure-cli

# Linux (Debian / Ubuntu / WSL)
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Windows (PowerShell as admin)
winget install -e --id Microsoft.AzureCLI
```

### 2.2 Install `kubectl` and `helm`

```bash
# macOS
brew install kubectl helm

# Linux
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl && sudo mv kubectl /usr/local/bin/
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

`az` can also fetch `kubectl` for you with `az aks install-cli`, but
having a system-wide install is handier.

Sanity check everything is on PATH:

```bash
az version
kubectl version --client
helm version
```

### 2.3 Sign in + pick the subscription

```bash
az login                    # opens a browser for auth
az account list --output table
az account set --subscription "<SUBSCRIPTION_ID_OR_NAME>"
az account show             # confirms tenantId, subscriptionId, your user
```

Copy two values from `az account show` — you'll paste them into
GitHub later:

| Field             | Where you'll use it    |
| ----------------- | ---------------------- |
| `id`              | `AZURE_SUBSCRIPTION_ID` |
| `tenantId`        | `AZURE_TENANT_ID`       |

---

## Phase 3 — Provision the AKS cluster (~7 min)

### 3.1 Pick variables (paste into your shell)

```bash
RG=shop-demo-rg              # resource group (logical bucket for billing)
LOC=westeurope               # closest region to you (az account list-locations -o table)
CLUSTER=shop-demo            # cluster name
NODE_SIZE=Standard_B2s       # ~$0.04/hr per node (2 vCPU, 4 GiB)
NODE_COUNT=2
```

### 3.2 Create the resource group

```bash
az group create --name "$RG" --location "$LOC"
```

### 3.3 Create the cluster

```bash
az aks create \
  --resource-group "$RG" \
  --name "$CLUSTER" \
  --location "$LOC" \
  --node-count "$NODE_COUNT" \
  --node-vm-size "$NODE_SIZE" \
  --enable-managed-identity \
  --enable-oidc-issuer \
  --enable-workload-identity \
  --network-plugin azure \
  --generate-ssh-keys
```

Why each flag matters:

| Flag | What it does | Why we need it |
| --- | --- | --- |
| `--enable-managed-identity` | Cluster uses an Azure-managed identity instead of a service principal with a password | Required for OIDC issuer below; no secret rotation |
| `--enable-oidc-issuer` | AKS publishes a public OIDC discovery document | Required for Workload Identity Federation in Phase 6 |
| `--enable-workload-identity` | Installs the workload identity webhook in the cluster | Lets Pods (and via federation, GitHub Actions) auth to Azure with no secrets |
| `--network-plugin azure` | Each Pod gets a real VNet IP | Required for Azure Network Policies; aligns with `infra/k8s/network-policies.yaml` |
| `--generate-ssh-keys` | Creates `~/.ssh/id_rsa` if missing | AKS needs an SSH key for node debugging |

Provisioning takes ~5–7 min — significantly faster than EKS because
there's no separate control-plane CloudFormation stack.

### 3.4 Pull the kubeconfig

```bash
az aks get-credentials --resource-group "$RG" --name "$CLUSTER"
kubectl get nodes
```

You should see two nodes in `Ready` status. Your `kubectl` is now
pointed at AKS.

> If `kubectl get nodes` returns `Unauthorized`, run
> `az aks get-credentials … --overwrite-existing`. Old kubeconfigs from
> a previous cluster with the same name can clash.

---

## Phase 4 — Make the cluster reachable from the internet (~3 min)

We install **ingress-nginx** as the single public entrypoint. Azure
auto-provisions a Standard Load Balancer with a public IPv4 in front
of it.

### 4.1 Install with Helm

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.type=LoadBalancer
```

### 4.2 Wait for the public IP (~2 min)

```bash
kubectl -n ingress-nginx get svc ingress-nginx-controller -w
# Ctrl-C once EXTERNAL-IP shows an actual IP (not <pending>)
```

Grab it for use later:

```bash
LB_IP=$(kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "Public IP: $LB_IP"
echo "Open: http://${LB_IP}.nip.io"
```

`nip.io` is a free DNS service that resolves `<anything>.<ip>.nip.io`
to that IP — saves you typing the bare IP into the browser, and lets
TLS / ingress host rules match without a real domain.

---

## Phase 5 — Where the container images live

The CD pipeline already builds & pushes 5 images
(`amir2575/shop-{api-gateway,web,user-svc,shop-svc,order-svc}`) on
every push to `main`. You have two options for **where** to store them.

### 5a. Keep using Docker Hub (default — simplest)

Nothing to do. The cluster pulls anonymously from `docker.io/`. The
images need to be **public** (the CD pipeline already publishes them
public).

### 5b. Use Azure Container Registry (ACR) instead

If you want everything inside Azure:

```bash
ACR_NAME=shopdemo$RANDOM   # must be globally unique, lowercase, 5–50 chars
az acr create --resource-group "$RG" --name "$ACR_NAME" --sku Basic

# Let AKS pull from ACR without secrets (uses managed identity).
az aks update -g "$RG" -n "$CLUSTER" --attach-acr "$ACR_NAME"
```

Then in CI, swap the Docker Hub login step for:

```yaml
- name: Login to ACR
  uses: azure/docker-login@v2
  with:
    login-server: ${{ vars.ACR_NAME }}.azurecr.io
    username: ${{ secrets.AZURE_CLIENT_ID }}
    password: ${{ secrets.AZURE_CLIENT_SECRET }}    # or use the federated credential
```

…and replace `docker.io/$DOCKERHUB_NAMESPACE/shop-…` everywhere with
`<acr_name>.azurecr.io/shop-…`. For the demo, **just stay on Docker
Hub** — fewer moving parts.

---

## Phase 6 — Wire CI/CD: GitHub Actions → AKS without secrets (~10 min)

GitHub will mint a short-lived OIDC token for each workflow run; Azure
exchanges that for an access token tied to a **Service Principal** (an
App Registration). No client secret ever exists, nothing to rotate.

### 6.1 Create the Service Principal (App Registration)

```bash
SUB=$(az account show --query id -o tsv)
TENANT=$(az account show --query tenantId -o tsv)
APP_NAME=github-actions-shop-cd
REPO=YOUR_GH_USER/YOUR_REPO        # ← edit me

# Create the App + matching Service Principal.
APP_ID=$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)
az ad sp create --id "$APP_ID"
SP_OBJECT_ID=$(az ad sp show --id "$APP_ID" --query id -o tsv)
echo "App (client) ID: $APP_ID"
```

### 6.2 Add the federated credential — trust GitHub OIDC

```bash
# 6.2a Trust the main branch
cat > /tmp/fic-main.json <<JSON
{
  "name": "${APP_NAME}-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:${REPO}:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"],
  "description": "GitHub Actions: main-branch CD"
}
JSON
az ad app federated-credential create --id "$APP_ID" --parameters @/tmp/fic-main.json

# 6.2b Trust manual workflow_dispatch runs (those use environment "production-aks")
cat > /tmp/fic-env.json <<JSON
{
  "name": "${APP_NAME}-env-prod",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:${REPO}:environment:production-aks",
  "audiences": ["api://AzureADTokenExchange"],
  "description": "GitHub Actions: production-aks environment"
}
JSON
az ad app federated-credential create --id "$APP_ID" --parameters @/tmp/fic-env.json
```

The `subject` field is what Azure validates against the OIDC token's
`sub` claim. Add one credential per branch / tag / environment you
want to deploy from.

### 6.3 Grant the Service Principal cluster access

```bash
AKS_ID=$(az aks show -g "$RG" -n "$CLUSTER" --query id -o tsv)

# Lets the SP fetch the kubeconfig (for `az aks get-credentials`).
az role assignment create \
  --assignee-object-id "$SP_OBJECT_ID" --assignee-principal-type ServicePrincipal \
  --role "Azure Kubernetes Service Cluster User Role" --scope "$AKS_ID"

# Demo only: full kubectl rights through Azure RBAC.
# For prod, create a least-privilege Role + bind via "Azure Kubernetes Service RBAC Writer Role".
az role assignment create \
  --assignee-object-id "$SP_OBJECT_ID" --assignee-principal-type ServicePrincipal \
  --role "Azure Kubernetes Service RBAC Cluster Admin" --scope "$AKS_ID"
```

### 6.4 Print everything you need for GitHub

```bash
cat <<EOF

──────────── PASTE THESE INTO GITHUB ────────────
Variables (Settings → Secrets and variables → Actions → Variables tab):
  AKS_CLUSTER_NAME       = $CLUSTER
  AKS_RESOURCE_GROUP     = $RG
  AZURE_TENANT_ID        = $TENANT
  AZURE_SUBSCRIPTION_ID  = $SUB
  AZURE_CLIENT_ID        = $APP_ID

Secrets (same page → Secrets tab):
  JWT_SECRET     = $(openssl rand -base64 48)
  DATABASE_URL   = postgresql://USER:PASS@HOST.neon.tech/neondb?sslmode=require
  MONGO_URI      = mongodb+srv://USER:PASS@HOST.mongodb.net/shop?retryWrites=true&w=majority
  REDIS_URL      = rediss://default:PASS@HOST.upstash.io:6379
  DOCKERHUB_USERNAME = <your dockerhub username>
  DOCKERHUB_TOKEN    = <dockerhub access token>
─────────────────────────────────────────────────
EOF
```

> `AZURE_CLIENT_ID` is technically not a secret (it's a public
> identifier — only the federated trust + RBAC assignments make it
> *useful*), but storing it as a Secret keeps it out of forks.

### 6.5 The AKS jobs in `.github/workflows/cd.yml` (already there)

The CD pipeline already ships with the `seed-secrets-aks` and
`deploy-aks` jobs you need — both gated on `vars.AKS_CLUSTER_NAME` so
they auto-skip when the variable is unset (keeps the workflow green
for EKS-only / image-only contributors).

The full job graph after `update-manifests`:

```
                                       ┌─► seed-secrets     ─► deploy      (EKS)
docker (matrix×5) ─► update-manifests ─┤
                                       └─► seed-secrets-aks ─► deploy-aks  (AKS)
```

Set the GitHub Variables and Secrets you collected in 6.4, push to
`main`, and the AKS branch lights up automatically. The
`deploy-aks` job posts a clickable `http://<azure-public-ip>.nip.io`
URL to its run summary via the **`production-aks`** GitHub Environment.

Both jobs reuse the composite action at
[`.github/actions/azure-aks-kubectl/`](../../../.github/actions/azure-aks-kubectl/action.yml)
which does `azure/login@v2` (federated, no secret) +
`az aks get-credentials` + `kubectl get nodes` verification. Symmetrical
to the AWS twin at
[`.github/actions/aws-eks-kubectl/`](../../../.github/actions/aws-eks-kubectl/action.yml).

> Want to peek at the exact YAML? Open
> [`.github/workflows/cd.yml`](../../../.github/workflows/cd.yml)
> and look for the `seed-secrets-aks` + `deploy-aks` jobs near the
> bottom of the file.

### 6.6 Create the GitHub Environment

GitHub → repo Settings → **Environments** → **New environment** →
name it `production-aks`. Optionally add **Required reviewers** so
deploys need an explicit approval click. The federated credential
created in 6.2b matches this environment name exactly.

### 6.7 Alternative — Azure DevOps Service Connection (instead of GitHub OIDC)

If you'd rather use Azure DevOps (`azure-pipelines-cd.yml`) instead of
or *alongside* GitHub Actions, the auth model is the same idea but
plumbed through a different Azure construct: a **Service Connection**.

#### What a Service Connection actually is

It's an Azure DevOps-side credential object that wraps **either** a
Service Principal with a client secret/cert, **or** — preferred since
2024 — a **Workload Identity Federation** principal that ADO mints
on the fly. Pipelines reference it by name (e.g.
`$(AZURE_SUBSCRIPTION)`), and tasks like `AzureCLI@2` /
`AzureKeyVault@2` use it to call Azure APIs without ever seeing a
secret.

```
GitHub Actions                    Azure DevOps
──────────────                    ────────────
azure/login@v2                    AzureCLI@2 task
       │                                 │
       │ presents OIDC JWT               │ presents WIF JWT
       ▼                                 ▼
App Registration in Entra         Service Connection in ADO
       │                                 │
       │ federated trust                 │ federated trust
       │ ("repo:OWNER/REPO:ref:…")       │ ("sc://org/project/<sc-name>")
       ▼                                 ▼
─────────────── Microsoft Entra ID (same tenant) ──────────────
                       │
                       │ assume Service Principal
                       ▼
              Azure RBAC role assignments
                       │
                       ▼
              AKS / Key Vault / etc.
```

Same SP, same RBAC, same target resources — only the federation
trust subject differs. You can wire **both** to the same App
Registration if you want the GitHub and ADO pipelines to share an
identity.

#### Create it the easy way (UI, recommended)

1. Open <https://dev.azure.com> → your **organization** → your
   **project** → **Project settings** (bottom-left gear).
2. **Service connections** → **New service connection** →
   **Azure Resource Manager** → **Next**.
3. Identity type → **Workload Identity federation (automatic)** →
   **Next**.
4. **Scope level: Subscription** → pick your subscription → optionally
   pick the resource group `shop-demo-rg` (recommended — narrower
   blast radius).
5. **Service connection name**: `shop-aks-sc` (this is the value you
   reference as `$(AZURE_SUBSCRIPTION)` in the pipeline YAML).
6. ✅ **Grant access permission to all pipelines** (or leave off and
   approve per pipeline).
7. **Save**.

ADO creates the App Registration + Service Principal + federated
credential for you, and binds the subject correctly to that specific
service connection. The SP's object ID is in the connection details
page (Manage → Manage Service Principal → Object ID).

#### Or pre-create one with the CLI (script-friendly)

```bash
SUB=$(az account show --query id -o tsv)
AKS_ID=$(az aks show -g "$RG" -n "$CLUSTER" --query id -o tsv)

# Creates an SP and binds it to a role+scope in one shot.
az ad sp create-for-rbac \
  --name "shop-aks-sc" \
  --role "Azure Kubernetes Service RBAC Cluster Admin" \
  --scopes "$AKS_ID" \
  --json-auth                          # JSON output ADO accepts as creds

# (also grant the SP access to fetch kubeconfig, same as 6.3)
SP_ID=$(az ad sp list --display-name "shop-aks-sc" --query '[0].id' -o tsv)
az role assignment create \
  --assignee-object-id "$SP_ID" --assignee-principal-type ServicePrincipal \
  --role "Azure Kubernetes Service Cluster User Role" --scope "$AKS_ID"
```

Then in ADO: **Service connections → New → Azure Resource Manager →
Service principal (manual)** → paste the JSON. Less convenient than
WIF but unavoidable in environments that block ADO's federated
credential creation.

#### Set the pipeline variables

ADO has the same Variables / Secrets distinction as GitHub. Open the
CD pipeline → **Edit** → **Variables**:

| Variable | Value | Marked secret? |
| --- | --- | --- |
| `AZURE_SUBSCRIPTION` | `shop-aks-sc` *(the service connection name)* | no |
| `AKS_CLUSTER_NAME` | `shop-demo` | no |
| `AKS_RESOURCE_GROUP` | `shop-demo-rg` | no |
| `DOCKERHUB_NAMESPACE` | your Docker Hub username | no |
| `DOCKER_REGISTRY_CONNECTION` | the Docker Registry service connection name | no |
| `JWT_SECRET` | `openssl rand -base64 48` | **yes** |
| `DATABASE_URL` | Neon connection string | **yes** |
| `MONGO_URI` | Atlas connection string | **yes** |
| `REDIS_URL` | Upstash connection string | **yes** |

The secrets become `$(JWT_SECRET)` etc. in YAML — note ADO won't
expand secret variables into env vars unless you do it explicitly:

```yaml
- script: |
    kubectl create secret generic shop-app-secrets -n shop \
      --from-literal=JWT_SECRET="$JWT_SECRET" \
      ...
  env:
    JWT_SECRET: $(JWT_SECRET)        # ← required, otherwise $JWT_SECRET = ""
```

This pipeline ([`azure-pipelines-cd.yml`](../../../azure-pipelines-cd.yml))
already does that correctly.

#### GitHub OIDC vs ADO Service Connection — when to use which

| Question | GitHub Actions WIF | ADO Service Connection |
| --- | --- | --- |
| Where does the workflow live? | `.github/workflows/cd.yml` | Pipeline imported into ADO from `azure-pipelines-cd.yml` |
| Who hosts the runners? | GitHub-hosted (free tier) | Microsoft-hosted (free tier on private repos limited) |
| Needs an Azure AD App Reg? | Yes — created by you | Yes — auto-created by ADO when using WIF |
| Federated credential `subject` format | `repo:OWNER/REPO:ref:refs/heads/main` etc. | Auto-managed by ADO ("don't touch") |
| Where to add per-environment approvals | GitHub Environments | ADO Environment + Approvals & checks |
| Best for | Open-source / GitHub-native teams | Enterprises already on Azure DevOps boards |

You can run **both** pipelines pointed at the same cluster — the
deploy is idempotent (`kubectl apply -k`), and federated credentials
of different subjects can coexist on the same App Registration.

---

## Phase 7 — Deploy

### 7.1 Trigger via CI/CD (recommended)

```bash
git commit --allow-empty -m "ci: deploy to AKS"
git push origin main
```

Watch it on the **Actions** tab — `CI` runs first (~3 min), then `CD`
auto-triggers and runs the matrix Docker build → manifest bump →
seed-secrets-aks → deploy-aks chain (~5–8 min). The `Deploy to AKS`
job posts the URL on the run page.

### 7.2 Or deploy manually from your laptop

```bash
# Make sure your kubeconfig still points at AKS
kubectl config current-context        # should contain "shop-demo"

# Seed the Secret (gitignored copy with real values)
cp infra/k8s/secrets.example.yaml infra/k8s/secrets.yaml
$EDITOR infra/k8s/secrets.yaml
kubectl apply -f infra/k8s/secrets.yaml

# Apply the AKS overlay (drops TLS / cert-manager / host rule from base)
kubectl apply -k infra/azure/aks-overlay/

# Watch
kubectl -n shop get pods -w
```

### 7.3 Open the app

```bash
LB_IP=$(kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
open "http://${LB_IP}.nip.io"        # macOS — use xdg-open / start on Linux/Win
```

The SPA loads at `/`, the GraphQL endpoint at `/graphql`.

---

## Phase 8 — Verify everything is wired up

```bash
# 1. All Pods Running, no CrashLoops
kubectl -n shop get pods

# 2. ingress-nginx routes are wired
kubectl -n shop get ingress
kubectl -n shop describe ingress shop

# 3. Health probes
curl -sS "http://${LB_IP}.nip.io/health"        || true
curl -sS "http://${LB_IP}.nip.io/graphql"       \
     -H 'content-type: application/json'        \
     -d '{"query":"{ __typename }"}'

# 4. NetworkPolicy isolation works:
#    a. Backend services should NOT have an external IP
kubectl -n shop get svc

#    b. From inside namespace, gateway can reach a backend
kubectl -n shop run ngcheck --rm -it --restart=Never \
  --image=curlimages/curl --labels app=api-gateway \
  -- curl -sS http://user-svc:3001/health/live

#    c. But web cannot — NetworkPolicy denies it (expect timeout)
kubectl -n shop run ngcheck --rm -it --restart=Never \
  --image=curlimages/curl --labels app=web \
  -- curl --max-time 3 -sS http://user-svc:3001/health/live ; echo "exit=$?"
```

---

## Phase 9 — Upgrade to Azure Key Vault for runtime secrets (optional)

The deploy you just shipped works, but secrets live as plaintext in
GitHub Repository Secrets and get pushed straight into a Kubernetes
`Secret` (which itself is just base64 — not encryption). For a
portfolio demo that's fine. For anything that touches a real customer
this is the standard upgrade.

### What this changes (and what it doesn't)

```
                          BEFORE (Phase 6 flow)
                          ─────────────────────
                       ┌─────────────────────┐
                       │   GitHub Secrets    │  ← human-edited UI
                       │  (DATABASE_URL,...) │     no audit trail
                       └──────────┬──────────┘     no rotation policy
                                  │ seed-secrets job
                                  ▼
                       ┌─────────────────────┐
                       │ K8s Secret in shop  │  ← base64 only
                       │  shop-app-secrets   │
                       └──────────┬──────────┘
                                  │ envFrom: secretRef
                                  ▼
                       ┌─────────────────────┐
                       │  Pod: process.env   │  ← apps unchanged
                       │  DATABASE_URL=...   │
                       └─────────────────────┘


                          AFTER (Phase 9 flow)
                          ────────────────────
                       ┌─────────────────────┐
                       │   Azure Key Vault   │  ← single source of truth
                       │  (DATABASE_URL,...) │     full audit log
                       └──────────┬──────────┘     versioning + soft-delete
                                  │                rotation via Event Grid
                                  │ Secrets Store CSI Driver
                                  │ + Workload Identity binding
                                  ▼
              ┌──────────────────────────────────────┐
              │ K8s Secret in shop                   │  ← auto-synced by CSI
              │ shop-app-secrets                     │     (still base64,
              │ (created+kept in sync from KV)       │      but contents
              └─────────────────┬────────────────────┘     come from KV)
                                │ envFrom: secretRef
                                ▼
                       ┌─────────────────────┐
                       │  Pod: process.env   │  ← apps still unchanged
                       │  DATABASE_URL=...   │     (process.env.X reads
                       └─────────────────────┘      the same way)
```

**The Docker image never changes.** The `app.module.ts` `ConfigModule`
still reads `process.env.DATABASE_URL`. The `Deployment` still uses
the same `envFrom: secretRef: name: shop-app-secrets`. What changes
is **where the bytes inside that K8s Secret originated** — Key Vault
instead of a `kubectl create secret` from CI.

### 9.1 Enable the CSI driver add-on (~1 min)

```bash
az aks enable-addons \
  --resource-group "$RG" \
  --name "$CLUSTER" \
  --addons azure-keyvault-secrets-provider
```

This installs:

- The **Secrets Store CSI Driver** (upstream Kubernetes sub-project).
- The **Azure Key Vault Provider** (Microsoft's plugin that knows how
  to talk to KV).

Verify the DaemonSet is running on every node:

```bash
kubectl get pods -n kube-system -l 'app in (secrets-store-csi-driver,secrets-store-provider-azure)'
```

### 9.2 Create the Key Vault + put your secrets in it

Key Vault names are **globally unique** across all of Azure (like S3
buckets). Append `$RANDOM` to dodge collisions on the demo run.

```bash
KV_NAME=shop-kv-$RANDOM       # 3–24 chars, lowercase + digits + dashes
az keyvault create \
  --name "$KV_NAME" \
  --resource-group "$RG" \
  --location "$LOC" \
  --enable-rbac-authorization true       # ← important; we use Azure RBAC,
                                          #    not legacy access policies

# You (the human) need data-plane perms once to seed initial values.
ME_OBJ=$(az ad signed-in-user show --query id -o tsv)
az role assignment create \
  --assignee-object-id "$ME_OBJ" --assignee-principal-type User \
  --role "Key Vault Secrets Officer" \
  --scope "$(az keyvault show -n $KV_NAME --query id -o tsv)"

# Put each secret in.
az keyvault secret set --vault-name "$KV_NAME" --name DATABASE-URL --value 'postgresql://USER:PASS@HOST.neon.tech/neondb?sslmode=require'
az keyvault secret set --vault-name "$KV_NAME" --name MONGO-URI    --value 'mongodb+srv://USER:PASS@HOST.mongodb.net/shop?retryWrites=true&w=majority'
az keyvault secret set --vault-name "$KV_NAME" --name REDIS-URL    --value 'rediss://default:PASS@HOST.upstash.io:6379'
az keyvault secret set --vault-name "$KV_NAME" --name JWT-SECRET   --value "$(openssl rand -base64 48)"
```

> Key Vault secret names allow `[0-9a-zA-Z-]` only — no underscores.
> So `DATABASE_URL` becomes `DATABASE-URL` in KV. The CSI driver maps
> back to whatever env var name you choose in step 9.4.

### 9.3 Bind a User-Assigned Managed Identity to the Pods (Workload Identity)

The Pods need an Azure identity to authenticate to Key Vault. We use
the same Workload Identity model as Phase 6 — but instead of GitHub
federating into the App Registration, the **Kubernetes ServiceAccount**
federates into a User-Assigned Managed Identity.

```bash
UAMI_NAME=shop-app-identity

# 1. Create the managed identity in the same RG as the cluster.
az identity create -g "$RG" -n "$UAMI_NAME" -l "$LOC"
UAMI_CLIENT_ID=$(az identity show -g "$RG" -n "$UAMI_NAME" --query clientId -o tsv)
UAMI_OBJECT_ID=$(az identity show -g "$RG" -n "$UAMI_NAME" --query principalId -o tsv)

# 2. Grant it read access to KV secrets.
az role assignment create \
  --assignee-object-id "$UAMI_OBJECT_ID" --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" \
  --scope "$(az keyvault show -n $KV_NAME --query id -o tsv)"

# 3. Federate the K8s ServiceAccount into this UAMI.
#    AKS publishes an OIDC issuer per cluster; we already enabled it
#    with --enable-oidc-issuer in Phase 3.
OIDC_URL=$(az aks show -g "$RG" -n "$CLUSTER" --query oidcIssuerProfile.issuerUrl -o tsv)
az identity federated-credential create \
  --name shop-app-fc \
  --identity-name "$UAMI_NAME" \
  --resource-group "$RG" \
  --issuer "$OIDC_URL" \
  --subject "system:serviceaccount:shop:shop-app" \
  --audience api://AzureADTokenExchange

echo "Paste into your overlay's ServiceAccount annotation:"
echo "  azure.workload.identity/client-id: $UAMI_CLIENT_ID"
```

The federation `subject` is the standard Kubernetes
`system:serviceaccount:<namespace>:<sa-name>` form. Anything else in
the cluster trying to auth as this identity gets rejected.

### 9.4 Tell the cluster which secrets to mount where

Two new Kubernetes objects: a `ServiceAccount` annotated with the
UAMI client ID, and a `SecretProviderClass` that lists which KV
secrets to fetch.

```yaml
# infra/k8s/keyvault.yaml  (or in your overlay)
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: shop-app
  namespace: shop
  annotations:
    azure.workload.identity/client-id: <UAMI_CLIENT_ID-from-9.3>
  labels:
    azure.workload.identity/use: "true"     # ← tells the webhook to inject the projected token
---
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: shop-app-secrets
  namespace: shop
spec:
  provider: azure
  parameters:
    usePodIdentity: "false"
    useVMManagedIdentity: "false"
    clientID: <UAMI_CLIENT_ID-from-9.3>
    keyvaultName: <KV_NAME-from-9.2>
    tenantId: <AZURE_TENANT_ID>
    objects: |
      array:
        - |
          objectName: DATABASE-URL
          objectType: secret
        - |
          objectName: MONGO-URI
          objectType: secret
        - |
          objectName: REDIS-URL
          objectType: secret
        - |
          objectName: JWT-SECRET
          objectType: secret
  # The magic that keeps a regular K8s Secret in sync with KV — apps
  # consuming envFrom don't need to change.
  secretObjects:
    - secretName: shop-app-secrets       # ← matches the existing secret name
      type: Opaque
      data:
        - objectName: DATABASE-URL
          key: DATABASE_URL              # ← the env var name your app reads
        - objectName: MONGO-URI
          key: MONGO_URI
        - objectName: REDIS-URL
          key: REDIS_URL
        - objectName: JWT-SECRET
          key: JWT_SECRET
```

Two important details in the YAML above:

- **`labels: azure.workload.identity/use: "true"`** on the
  ServiceAccount tells the workload-identity admission webhook to
  inject a projected service account token into Pods that use this
  SA. Without it, KV calls fail with `unauthorized`.
- **`secretObjects:`** is what makes the existing
  `envFrom: secretRef: shop-app-secrets` keep working. The CSI driver
  creates and updates a regular K8s Secret with the same name — your
  Deployments don't change a single line.

### 9.5 Update the Deployments to use the SA + mount the volume

Each Deployment that needs secrets gets two tweaks:

```yaml
spec:
  template:
    spec:
      serviceAccountName: shop-app          # ← was "default"
      containers:
        - name: api-gateway
          envFrom:
            - secretRef:
                name: shop-app-secrets      # unchanged from before
          # The CSI driver only syncs to a K8s Secret IF at least one
          # Pod actually mounts the SecretProviderClass. Mount it once,
          # read-only, on whatever Pod owns the lifecycle.
          volumeMounts:
            - name: shop-secrets
              mountPath: /mnt/secrets       # contents not used by app, but mount triggers sync
              readOnly: true
      volumes:
        - name: shop-secrets
          csi:
            driver: secrets-store.csi.k8s.io
            readOnly: true
            volumeAttributes:
              secretProviderClass: shop-app-secrets
```

Apply, restart the Deployments, and the app keeps reading
`process.env.DATABASE_URL` exactly as before — the bytes just travel
a different route to get there.

```bash
kubectl apply -f infra/k8s/keyvault.yaml
kubectl rollout restart deployment -n shop
kubectl get secret -n shop shop-app-secrets -o yaml      # should now exist + auto-managed
```

### 9.6 Drop the GitHub Secret + the seed-secrets job

Once Key Vault is the source of truth, the `seed-secrets-aks` job
becomes redundant — and dangerous, since two writers will fight over
the K8s Secret. Either:

- Delete the `seed-secrets-aks` job from `cd.yml`, OR
- Gate it on a separate `vars.SEED_FROM_GH_SECRETS` toggle so it only
  runs when KV isn't the chosen path.

You can also remove `DATABASE_URL` / `MONGO_URI` / `REDIS_URL` /
`JWT_SECRET` from GitHub Secrets entirely. CI never sees them again.

### 9.7 The full secret journey, explained end-to-end

```
            ┌────────────────────────────────────────────────┐
            │         BUILD TIME — CI on GitHub              │
            │                                                │
            │   docker build:                                │
            │     COPY apps/api-gateway .                    │
            │     # NO secrets baked in                      │
            │     # NO build args containing secrets         │
            │                                                │
            │   docker push amir2575/shop-api-gateway:sha-…  │
            └─────────────────────┬──────────────────────────┘
                                  │ image is cacheable, sharable, public
                                  ▼
            ┌────────────────────────────────────────────────┐
            │         DEPLOY TIME — CD on GitHub             │
            │                                                │
            │   kubectl apply -k infra/azure/aks-overlay/    │
            │     ↑ this only changes:                       │
            │       1. image tags (manifest bump)            │
            │       2. SecretProviderClass + SA annotations  │
            │     ↑ NEVER pushes secret values               │
            └─────────────────────┬──────────────────────────┘
                                  │
                                  ▼
            ┌────────────────────────────────────────────────┐
            │         POD START — kubelet on the node        │
            │                                                │
            │   1. Workload-identity webhook injects a       │
            │      short-lived projected SA token            │
            │   2. CSI driver reads that token               │
            │   3. CSI driver federates into the UAMI        │
            │   4. UAMI calls Key Vault dataplane            │
            │   5. CSI driver writes K8s Secret              │
            │      shop-app-secrets (base64-of-real-values)  │
            │   6. kubelet expands envFrom into env vars     │
            │   7. Container starts; process.env is set      │
            └─────────────────────┬──────────────────────────┘
                                  ▼
            ┌────────────────────────────────────────────────┐
            │         RUNTIME — your NestJS code             │
            │                                                │
            │   ConfigModule.forRoot({ isGlobal: true })     │
            │   configService.get<string>('DATABASE_URL')    │
            │     → reads process.env.DATABASE_URL           │
            │     → unchanged from before KV                 │
            └────────────────────────────────────────────────┘
```

What lives where in the final state:

| Thing | Lives in | Who can read it |
| --- | --- | --- |
| Secret value | Azure Key Vault | KV "Secrets User" role assignees only |
| Audit log of every read | KV diagnostic logs → Log Analytics | RG "Reader" + "Log Analytics Reader" |
| Auth token Pods use | K8s projected SA token (60 min lifetime, in Pod's `/var/run/secrets/...`) | Pod itself only |
| Cached secret bytes | K8s Secret `shop-app-secrets` in `shop` ns | RBAC `get secrets in shop` only |
| Mounted file | `/mnt/secrets/<name>` inside the Pod | Container's `runAsUser` only |
| Env var | `process.env.X` inside the Pod | Container only |
| Docker image | Docker Hub | World-readable, contains zero secrets |

The Docker image and the Kubernetes Deployment are both still
**publishable / committable** — neither has a secret in it. The only
place the actual values exist is Key Vault, the running Pod's
process memory, and a transient base64 K8s Secret that's automatically
GC'd if the Pod stops mounting it.

---

## Phase 10 — Things that go wrong (and fixes)

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `kubectl get nodes` → `error: You must be logged in to the server` | Stale kubeconfig from a previous AKS cluster with the same name | `az aks get-credentials … --overwrite-existing` |
| `EXTERNAL-IP` for `ingress-nginx-controller` stuck on `<pending>` | Region quota for public IPs (default = 10 per region) | Either delete an unused IP, or `az network public-ip list -o table` to confirm |
| Pods stuck in `ContainerCreating`, `kubectl describe` shows `failed to pull image: unauthorized` | Using ACR but `--attach-acr` was never run | `az aks update -g $RG -n $CLUSTER --attach-acr $ACR_NAME` |
| `seed-secrets-aks` job: `AADSTS70021: No matching federated identity record found` | The federated credential subject doesn't match the workflow's actual `sub` claim | Run a workflow once, copy the exact `sub` from the failure log into a new federated credential |
| `deploy-aks` job: `Error from server (Forbidden)` on `kubectl apply` | RBAC binding missing on the SP | Re-run the `az role assignment create … "Azure Kubernetes Service RBAC Cluster Admin"` from 6.3 |
| Browser shows blank page / 502 | `web` Pod not Ready, or `ingress.yaml` host doesn't match | `kubectl -n shop logs -l app=web` and `kubectl -n shop describe ingress` |
| `api-gateway` `CrashLoopBackOff` with no logs | `bufferLogs: true` swallowing startup errors — image is older than the fix | Trigger a fresh build: `git commit --allow-empty -m "rebuild" && git push` |

---

## Phase 11 — Teardown (do this when you're done)

Azure bills by the second. Cluster + LB + IP idle = ~$2.50/day.

```bash
# 1. Remove the app + ingress (releases the public IP).
kubectl delete -k infra/azure/aks-overlay/  --ignore-not-found
helm uninstall ingress-nginx -n ingress-nginx
kubectl delete namespace ingress-nginx       --ignore-not-found

# 2. Delete the entire resource group — kills cluster, NICs, disks,
#    LB, public IP, route tables in a single transaction.
az group delete --name "$RG" --yes --no-wait

# 3. (Optional) drop the CI App Registration if you're done with the demo.
az ad app delete --id "$APP_ID"

# 4. Sanity check the resource group is gone.
az group exists --name "$RG"           # → false
az resource list -g "$RG" -o table     # → "ResourceGroupNotFound"
```

`az group delete` is much cleaner than its AWS counterpart — there's
no NAT-GW-stuck-behind situation because Azure routes egress through
the same Standard LB.

---

## What just happened — the full picture

```
                        ┌─────────────────────────────┐
                        │     Azure Subscription      │
                        │     (your billing scope)    │
                        └──────────────┬──────────────┘
                                       │
                        ┌──────────────▼──────────────┐
                        │  Resource Group: shop-demo  │
                        │  (logical bucket; teardown  │
                        │   in one az group delete)   │
                        └──────────────┬──────────────┘
                                       │
                ┌──────────────────────┼─────────────────────┐
                │                      │                     │
                ▼                      ▼                     ▼
        ┌───────────────┐     ┌────────────────┐     ┌─────────────┐
        │  AKS cluster  │     │  Standard LB + │     │  App Reg    │
        │  (control     │     │  public IPv4   │     │  + Federated│
        │  plane free,  │     │  (provisioned  │     │  credential │
        │  2 × B2s nodes│     │  by ingress-   │     │  (CI auth,  │
        │  in your VNet)│     │  nginx)        │     │  no secret) │
        └───────┬───────┘     └────────┬───────┘     └──────┬──────┘
                │                      │                    │
                └──────────┬───────────┘                    │
                           ▼                                │
                ┌────────────────────┐                      │
                │  Pods in `shop`    │◄─── kubectl ─────────┘
                │  ns + ingress-nginx│       (federated OIDC)
                │  in own ns         │
                └────────────────────┘
                           ▲
                           │  pulls images from
                           │
                ┌────────────────────┐
                │  Docker Hub (or    │
                │  attached ACR)     │
                └────────────────────┘
```

---

## Where each piece lives in this repo

| Piece | File | Purpose |
| --- | --- | --- |
| Production base manifests | [`infra/k8s/`](../../k8s/) | Real-prod manifests (TLS, host rule, cert-manager) |
| AKS overlay | [`infra/azure/aks-overlay/`](./) | Drops TLS / cert-manager / host so the raw LB IP works |
| AKS overlay README | [`infra/azure/aks-overlay/Readme.md`](./Readme.md) | Quick reference (assumes you've read this guide) |
| **AKS Terraform** | [`infra/azure/terraform/`](../terraform/) | IaC alternative to the `az` commands in Phases 3 + 6 |
| EKS overlay (AWS twin) | [`infra/aws/eks-overlay/`](../../aws/eks-overlay/) | Same pattern for AWS |
| GitHub Actions CI | [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) | Lint / typecheck / test / build |
| GitHub Actions CD | [`.github/workflows/cd.yml`](../../../.github/workflows/cd.yml) | docker → bump → {seed-secrets, seed-secrets-aks} → {deploy, deploy-aks} — AKS jobs already wired |
| Azure-AKS composite action | [`.github/actions/azure-aks-kubectl/`](../../../.github/actions/azure-aks-kubectl/action.yml) | Federated `azure/login@v2` + `az aks get-credentials`, reused by both AKS jobs |
| Azure DevOps CD | [`azure-pipelines-cd.yml`](../../../azure-pipelines-cd.yml) | Equivalent pipeline if you'd rather use ADO (auth model in Phase 6.7) |
| Load-balancing deep dive | [`infra/k8s/README.md`](../../k8s/README.md#load-balancing--whats-actually-happening-between-the-browser-and-a-pod) | How traffic flows from the browser to a Pod (3 LB layers explained) |
| Secret-flow deep dive | [Phase 9.7 in this file](#97-the-full-secret-journey-explained-end-to-end) | How secrets travel from Key Vault → Pod env vars (Docker / K8s / app, end-to-end) |

---

## Cost cheat sheet

| Item | Hourly | Monthly (idle) |
| --- | --- | --- |
| AKS control plane | **free** (Free tier) | $0 |
| 2 × `Standard_B2s` nodes | $0.0832 | ~$60 |
| Standard LB (5 LB rules + 1 IP) | $0.025 + $0.005 | ~$22 |
| Key Vault (Phase 9, optional) | **~free** at <10K secret reads/month | <$0.05 |
| **Total** | **~$0.10/hr** | **~$80** |

`az group delete` releases all of the above. The App Registration
itself is free and survives teardown — keep it for the next deploy or
delete it with `az ad app delete --id $APP_ID`.
