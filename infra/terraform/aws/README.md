# AWS / EKS demo cluster — Terraform

One-shot Terraform that provisions the **simplest production-shaped EKS** capable of running this repo's existing Kubernetes manifests + the GitHub Actions `deploy:` job in [`.github/workflows/cd.yml`](../../../.github/workflows/cd.yml).

> **Looking for a single-page reference card** instead of the 15-phase walkthrough? See [`docs/eks-cheatsheet.md`](../../../docs/eks-cheatsheet.md) — file map, 8-command bootstrap, day-2 snippets, top errors → fix, cost cheat, teardown.

> **Companion docs**
> - [`infra/aws/eks-overlay/Readme.md`](../../aws/eks-overlay/Readme.md) — what the kustomize overlay does on top of the base manifests.
> - [`infra/azure/terraform/README.md`](../../azure/terraform/README.md) — the equivalent module for AKS, same structure.

---

## What this module creates

| # | Resource | Purpose |
|---|----------|---------|
| 1 | **VPC** (`/16`) with 2 public + 2 private subnets, IGW, single NAT GW | Network the cluster lives in. Public subnets host the NAT + NLB; private host the worker EC2 + Pods. |
| 2 | **EKS control plane** (1.30, public endpoint) | The Kubernetes API server. Multi-AZ, managed by AWS. |
| 3 | **Managed node group** (2 × `t3.medium`, on-demand) | Worker EC2 instances. Auto-joined to the cluster, IAM and security groups wired automatically. |
| 4 | **EKS add-ons** — coredns, kube-proxy, vpc-cni, eks-pod-identity-agent | Mandatory for a usable cluster. AWS keeps them patched. |
| 5 | **IAM OIDC provider for GitHub Actions** | Lets the CI job present a JWT instead of long-lived AWS keys. |
| 6 | **IAM Role `<cluster>-github-oidc`** + trust policy | The role CI assumes. Locked to `repo:owner/name:ref:refs/heads/main` (and the `production-eks` environment) — no other workflow can assume it. |
| 7 | **EKS Access Entry** mapping the role above to `cluster-admin` | Authorises the IAM identity to actually `kubectl apply` once authenticated. |
| 8 | **ingress-nginx** via Helm (provisions an AWS NLB) | Public address for the apps. The deploy job reads the NLB hostname for the "Live URL" link. |

What it intentionally does **not** create:

- ECR repos — you're already on Docker Hub.
- cert-manager / external-dns — out of scope for the demo; the eks-overlay disables HTTPS host rules.
- The application Kubernetes resources themselves — those come from `kubectl apply -k infra/aws/eks-overlay/` (run by CI).
- The Grafana Cloud `grafana-cloud-credentials` Secret — seeded by the `seed-secrets-eks` job in CI from your GitHub Repository Secrets.

---

## Network topology and security groups

The module follows the **canonical AWS pattern**: public subnets for internet-facing infrastructure (NAT, NLB), private subnets for everything that runs your code. Pods get real VPC IPs from the private subnet CIDRs (via `vpc-cni`), so they're routable on the internal network but not directly reachable from the internet.

```
                      Internet
                         │
                         │ 0.0.0.0/0
                ┌────────┴────────┐
                │  Internet GW    │  (single, attached to VPC)
                └────────┬────────┘
                         │
   ┌─────────────────────┼─────────────────────┐
   │                VPC 10.42.0.0/16            │
   │                                            │
   │  ┌──────────────────────┐  ┌──────────────────────┐
   │  │ Public subnet AZ-a   │  │ Public subnet AZ-b   │
   │  │ 10.42.0.0/20         │  │ 10.42.16.0/20        │
   │  │                      │  │                      │
   │  │  • NAT Gateway       │  │                      │
   │  │  • NLB (ingress)     │  │  • NLB (ingress)     │
   │  │     ENI per AZ       │  │     ENI per AZ       │
   │  │                      │  │                      │
   │  │  tag:                │  │  tag:                │
   │  │  kubernetes.io/role/ │  │  kubernetes.io/role/ │
   │  │     elb=1            │  │     elb=1            │
   │  └──────────┬───────────┘  └──────────┬───────────┘
   │             │  NAT (egress only)      │
   │             ▼                         ▼
   │  ┌──────────────────────┐  ┌──────────────────────┐
   │  │ Private subnet AZ-a  │  │ Private subnet AZ-b  │
   │  │ 10.42.128.0/20       │  │ 10.42.144.0/20       │
   │  │                      │  │                      │
   │  │  • Worker EC2 #1     │  │  • Worker EC2 #2     │
   │  │     (t3.medium)      │  │     (t3.medium)      │
   │  │                      │  │                      │
   │  │  • EKS control-plane │  │  • EKS control-plane │
   │  │     ENI (managed     │  │     ENI (managed     │
   │  │      by AWS)         │  │      by AWS)         │
   │  │                      │  │                      │
   │  │  • Pods get IPs from │  │  • Pods get IPs from │
   │  │     this CIDR        │  │     this CIDR        │
   │  │     (vpc-cni)        │  │                      │
   │  │                      │  │                      │
   │  │  tag:                │  │  tag:                │
   │  │  kubernetes.io/role/ │  │  kubernetes.io/role/ │
   │  │     internal-elb=1   │  │     internal-elb=1   │
   │  └──────────────────────┘  └──────────────────────┘
   │                                            │
   └────────────────────────────────────────────┘
```

The two blocks in `main.tf` that produce this layout:

```81:94:infra/terraform/aws/main.tf
  enable_nat_gateway   = true
  single_nat_gateway   = true
  enable_dns_support   = true
  enable_dns_hostnames = true

  # Subnet tags AWS load balancer controllers look for. `1` means "this
  # subnet is eligible to host LB endpoints". `kubernetes.io/role/elb` ↔
  # public, `internal-elb` ↔ private.
  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
  }
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
  }
```

```133:134:infra/terraform/aws/main.tf
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets
```

`subnet_ids = module.vpc.private_subnets` is the line that puts the worker nodes into private subnets only. The two `kubernetes.io/role/*` tags are what tell the AWS LB controller which subnet to attach a Service of type `LoadBalancer` to (public subnet for `internet-facing`, private for `internal`).

### Where each thing actually runs

| Component | Subnet | Why |
|---|---|---|
| **NAT Gateway** | Public | Needs an Elastic IP and an IGW route to talk to the internet |
| **NLB** (ingress-nginx Service) | Public (annotation `aws-load-balancer-scheme: internet-facing`) | Needs to be internet-reachable so browsers can hit your app |
| **Worker EC2 instances** | **Private** | Never directly reachable from the internet; egress for image pulls goes via the NAT |
| **Pod IPs** (via vpc-cni) | **Private** (allocated from the same subnet CIDR as their node) | Pods are first-class VPC citizens with real routable IPs |
| **EKS control plane API server** | **AWS's own VPC** (you don't see it) — but EKS attaches managed ENIs into **your private subnets** so nodes can call the API | Decouples control-plane HA from your VPC |
| **EKS API public endpoint** | Reachable over public internet (`cluster_endpoint_public_access = true`) | So `kubectl` from your laptop and GitHub Actions works without a bastion / VPN |

### Security groups (auto-created — you don't need to touch them)

The `terraform-aws-modules/eks/aws` module creates **two** security groups, with all the right rules for cluster ↔ node communication wired in:

| SG (auto-created name) | What it protects | Default ingress | Default egress |
|---|---|---|---|
| **Cluster SG** (`eks-cluster-sg-<cluster>-…`) | The EKS control-plane ENIs in your private subnets | All TCP from the **node SG** | All |
| **Node SG** (`<cluster>-node-…`) | The worker EC2 instances | TCP 1025–65535 from cluster SG (kubelet ↔ apiserver), all from itself (pod-to-pod), 53 UDP/TCP for DNS | All |

The NLB created by the Helm release gets its own SG that AWS manages automatically — it allows `0.0.0.0/0:80` and `:443` inbound and forwards to the worker nodes on the NodePort range. You can audit them after apply with the verification commands in [Phase 9](#phase-9--verify-network-topology-and-security-groups).

### What about the cluster API endpoint?

By default the module sets `cluster_endpoint_public_access = true`. That means **the Kubernetes API server is reachable from the internet** — anyone on any IP can `curl https://<cluster-id>.<region>.eks.amazonaws.com` and get an authentication challenge. **Auth still has to succeed** (IAM + EKS Access Entry), but the *endpoint* itself is public.

For a demo this is correct because:

- Your laptop's IP changes every time you switch networks.
- GitHub Actions runners get a different IP per job.
- The auth surface is OIDC + EKS Access Entries, not "trust this IP range".

For production, see "Restrict the Kubernetes API to known IPs" in [Phase 13](#phase-13--day-2-operations).

### Production hardening (when you're ready)

In rough value-for-effort order, after you've outgrown the demo defaults:

1. **Per-AZ NAT gateways.** Set `single_nat_gateway = false` in `module "vpc"`. Costs +$33/mo per extra AZ but eliminates a single point of failure for egress.
2. **Restrict the Kubernetes API.** See [Phase 13](#phase-13--day-2-operations) for the `cluster_endpoint_public_access_cidrs` patch.
3. **Restrict the NLB.** Add `service.beta.kubernetes.io/load-balancer-source-ranges: "203.0.113.0/24"` to the ingress-nginx Service annotation if your app is internal-only.
4. **VPC endpoints for S3 / ECR / STS.** Saves NAT data-processing fees ($0.045/GB) on image pulls — typical clusters cut their NAT bill 60–80%. One `aws_vpc_endpoint` resource per service.
5. **Network policies.** The repo already has `infra/k8s/network-policies.yaml` enforcing pod-to-pod boundaries. With AWS VPC CNI you need to enable it explicitly: add `enable_network_policy = true` to the `vpc-cni` add-on configuration in `main.tf`.
6. **Block direct SSH on nodes.** The default node SG has no port 22 rule, but if you ever launch nodes with a key pair, double-check. Use SSM Session Manager instead of SSH.

---

## Roadmap (skip ahead with the links)

| Phase | What you do | Time |
|-------|-------------|-----:|
| [0](#phase-0--aws-account-and-billing-one-time) | AWS account + billing alarm (skip if you already have one) | 10 min |
| [1](#phase-1--install-the-tools) | Install `terraform`, `awscli`, `kubectl`, `helm`, `gh` | 5 min |
| [2](#phase-2--authenticate-to-aws-from-your-laptop) | `aws configure` or `aws sso login` | 2 min |
| [3](#phase-3--clone-the-repo-and-enter-this-module) | Get the code, `cd infra/terraform/aws` | 1 min |
| [4](#phase-4--configure-your-variables) | `cp` + edit `terraform.tfvars` (only `github_repo` is required) | 2 min |
| [5](#phase-5--terraform-init) | `terraform init` (downloads providers + community modules) | 1 min |
| [6](#phase-6--terraform-plan) | `terraform plan -out tfplan` (preview all 45–55 resources) | 1 min |
| [7](#phase-7--terraform-apply) | `terraform apply tfplan` — the slow one | 15–20 min |
| [8](#phase-8--point-your-local-kubectl-at-the-cluster) | `aws eks update-kubeconfig` + sanity checks | 2 min |
| [9](#phase-9--verify-network-topology-and-security-groups) | Confirm subnets, SGs, node placement | 3 min |
| [10](#phase-10--wire-github-actions) | Set 2 GitHub Variables + 1 Secret + create the Environment | 5 min |
| [11](#phase-11--trigger-the-first-deploy) | `git push` → CD runs end-to-end | 8 min |
| [12](#phase-12--smoke-test) | `curl` / open the live URL | 1 min |
| [13](#phase-13--day-2-operations) | Resize, restrict access, swap to spot, etc. | as needed |
| [14](#phase-14--teardown) | `terraform destroy` | 15 min |

Total time from zero to live URL: **about 50 minutes** (most of it spent waiting for `terraform apply`).

---

## Phase 0 — AWS account and billing (one-time)

Skip if you already have an AWS account.

1. Sign up at [aws.amazon.com](https://aws.amazon.com) — needs a credit card and a phone number. Free Tier is enough to bootstrap, but the demo cluster is **not** Free-Tier-eligible (EKS control plane alone is $72/mo).
2. **Create a billing alert immediately**, before doing anything else:
   - Console → **Billing → Budgets → Create budget**.
   - Type: **Cost budget**.
   - Period: monthly. Amount: **$50** (twice the daily run rate; safety net).
   - Email when actual or forecasted cost exceeds 80%.
3. (Recommended) Create a non-root IAM user or IAM Identity Center user for `terraform apply` instead of using the root account. Attach `AdministratorAccess` for the bootstrap; you can step down after the cluster is up.

---

## Phase 1 — Install the tools

On macOS:

```bash
brew install terraform awscli gh kubectl helm
```

On Ubuntu / Debian:

```bash
sudo apt update
sudo apt install -y terraform awscli gh kubectl helm
```

Verify versions (the minimums this module assumes):

```bash
terraform --version    # >= 1.6.0
aws --version          # >= 2.15
kubectl version --client | head -2   # >= 1.28
helm version --short   # >= 3.13
gh --version           # any 2.x
```

If `terraform` isn't packaged on your distro, grab the latest binary from [hashicorp.com/terraform](https://www.terraform.io/downloads).

---

## Phase 2 — Authenticate to AWS from your laptop

Pick **one** of the three options below.

### Option A — Static IAM access key (simplest)

```bash
aws configure
# AWS Access Key ID:     AKIA...
# AWS Secret Access Key: ...
# Default region name:   eu-west-1
# Default output format: json
```

### Option B — IAM Identity Center / SSO (recommended for org accounts)

```bash
aws configure sso
# (follow prompts; opens a browser)
export AWS_PROFILE=shop-demo
```

### Option C — Environment variables (CI-style)

```bash
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_DEFAULT_REGION=eu-west-1
```

Sanity check — should print your account ID and ARN:

```bash
aws sts get-caller-identity
```

Expected:

```json
{
  "UserId":  "AIDA...",
  "Account": "123456789012",
  "Arn":     "arn:aws:iam::123456789012:user/your-name"
}
```

If you get `Unable to locate credentials`, your profile didn't load — re-run `aws configure` or `export AWS_PROFILE=...`.

---

## Phase 3 — Clone the repo and enter this module

```bash
git clone https://github.com/<your-fork>/nestjs-shop-azure.git
cd nestjs-shop-azure/infra/terraform/aws

ls
# README.md  iam-cicd.tf  ingress.tf  main.tf  outputs.tf  providers.tf  terraform.tfvars.example  variables.tf
```

---

## Phase 4 — Configure your variables

```bash
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars
```

The **only required** value is `github_repo`. Everything else has defaults tuned for the cheapest viable demo cluster (`eu-west-1`, 2 × t3.medium, 2 AZs, single NAT). Minimum file:

```hcl
github_repo = "amirHosseinKhademii/nestjs-shop-azure"
```

Common overrides:

```hcl
aws_region          = "us-east-1"          # cheaper instance pricing in N. Virginia
node_instance_type  = "t3.large"           # 2 vCPU/8 GiB if t3.medium feels tight
node_desired_size   = 3                    # extra capacity for traffic tests
github_branches     = ["main", "release/*"]
github_environments = ["production-eks", "staging-eks"]
```

`terraform.tfvars` is gitignored — your repo URL won't end up in version control.

---

## Phase 5 — `terraform init`

```bash
terraform init
```

Expected (~30 s):

```
Initializing the backend...
Initializing modules...
Downloading registry.terraform.io/terraform-aws-modules/vpc/aws 5.13.0
Downloading registry.terraform.io/terraform-aws-modules/eks/aws 20.24.0
Initializing provider plugins...
- Installing hashicorp/aws v5.70.0...
- Installing hashicorp/kubernetes v2.32.0...
- Installing hashicorp/helm v2.15.0...
- Installing hashicorp/tls v4.0.5...

Terraform has been successfully initialized!
```

Creates `.terraform/` and `.terraform.lock.hcl` (both gitignored).

If init fails with a network error, retry — the registry is occasionally flaky.

---

## Phase 6 — `terraform plan`

```bash
terraform plan -out tfplan
```

Expected (~10 s):

```
...
Plan: 53 to add, 0 to change, 0 to destroy.

Saved the plan to: tfplan
```

The exact count varies by version (45–55 is normal). **Read the plan carefully** — this is your last chance to catch a typo. Things to verify:

- Resource count is in the 45–55 range (not 200+).
- `module.eks.aws_eks_cluster.this` shows `version = "1.30"` (or whatever you set).
- `aws_iam_role.github_oidc` shows your repo in the trust policy `Condition.StringLike`.
- `module.vpc.aws_subnet.public` and `…private` together total 4 subnets.

If anything looks wrong, edit `terraform.tfvars` and re-plan.

---

## Phase 7 — `terraform apply`

```bash
terraform apply tfplan
```

This is the slow one. **Don't cancel it partway** — Terraform tracks every created resource in state, and a Ctrl-C mid-apply leaves orphaned resources you'll have to clean up manually.

Expected total: **15–20 minutes**, roughly:

| Phase | Duration | What's happening |
|-------|---------|------------------|
| VPC + IGW + subnets + route tables | ~1 min | Pure data-plane setup, very fast |
| NAT Gateway | ~2 min | Slow because AWS allocates an Elastic IP |
| IAM role + OIDC provider | ~10 s | Pure IAM API calls |
| EKS control plane | **~10 min** | The slowest step. AWS provisions a 3-AZ HA control plane behind the scenes |
| Managed node group | ~3 min | Launches EC2 instances, joins them to the cluster |
| EKS add-ons (coredns, vpc-cni, …) | ~1 min | Run after nodes are ready |
| Helm release: ingress-nginx | ~3 min | Includes waiting for the NLB to get a public hostname |

Watch progress in the terminal. Successful tail looks like:

```
helm_release.ingress_nginx[0]: Creation complete after 2m48s [id=ingress-nginx]

Apply complete! Resources: 53 added, 0 changed, 0 destroyed.

Outputs:

aws_region              = "eu-west-1"
cluster_arn             = "arn:aws:eks:eu-west-1:123456789012:cluster/shop-demo"
cluster_endpoint        = "https://ABC123.gr7.eu-west-1.eks.amazonaws.com"
cluster_name            = "shop-demo"
github_oidc_role_arn    = "arn:aws:iam::123456789012:role/shop-demo-github-oidc"
ingress_nginx_hostname  = "ab12cd34...elb.eu-west-1.amazonaws.com"
kubeconfig_command      = "aws eks update-kubeconfig --name shop-demo --region eu-west-1"
github_setup            = <<EOT
   ... copy-paste block ...
EOT
```

If apply errors midway:

| Error | Fix |
|-------|-----|
| `EntityAlreadyExists ... oidc-provider/token.actions.githubusercontent.com` | You already have one. Set `create_oidc_provider = false` in `terraform.tfvars`, re-run `terraform apply`. |
| `InvalidParameterException: Subnet ... is not in any of the AZs supported by EKS` | Pick a different region; EKS isn't enabled in every AZ of every region. Try `eu-west-1` or `us-east-1`. |
| `UnauthorizedOperation` on any AWS call | Your IAM principal doesn't have permission. Use `AdministratorAccess` for bootstrap. |
| Control plane creation hangs >15 min | Rare but happens. `terraform apply` is idempotent — Ctrl-C is **not** safe (state corruption risk); wait the full AWS timeout (~25 min), then retry. |

---

## Phase 8 — Point your local `kubectl` at the cluster

```bash
$(terraform output -raw kubeconfig_command)
# Equivalent to: aws eks update-kubeconfig --name shop-demo --region eu-west-1

kubectl config current-context
# arn:aws:eks:eu-west-1:123456789012:cluster/shop-demo
```

Sanity:

```bash
kubectl get nodes -o wide
```

Expected (2 nodes, both Ready, both in private subnets — `EXTERNAL-IP` should be `<none>`):

```
NAME                                       STATUS   ROLES    AGE   VERSION              INTERNAL-IP     EXTERNAL-IP
ip-10-42-128-15.eu-west-1.compute.internal Ready    <none>   3m    v1.30.4-eks-12345    10.42.128.15    <none>
ip-10-42-144-23.eu-west-1.compute.internal Ready    <none>   3m    v1.30.4-eks-12345    10.42.144.23    <none>
```

```bash
kubectl get pods -A
```

You should see system pods running in `kube-system` (coredns × 2, kube-proxy × 2, aws-node × 2, eks-pod-identity-agent × 2) and ingress-nginx (controller × 2 + admission-create / admission-patch jobs Completed).

---

## Phase 9 — Verify network topology and security groups

This is the "did Terraform actually build what I think it built" pass. Skip if you trust the plan.

```bash
CLUSTER=$(terraform output -raw cluster_name)
REGION=$(terraform output -raw aws_region)

# Subnets and their roles
VPC_ID=$(aws eks describe-cluster --name "$CLUSTER" --region "$REGION" \
  --query 'cluster.resourcesVpcConfig.vpcId' --output text)

aws ec2 describe-subnets --region "$REGION" \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Subnets[].{AZ:AvailabilityZone,CIDR:CidrBlock,Public:MapPublicIpOnLaunch,Tags:Tags[?contains(Key,`role/`)].Value|[0]}' \
  --output table
```

Expected (the `Public=True` rows are your two public subnets; the others are private):

```
-------------------------------------------------------------------
|                          DescribeSubnets                        |
+--------------+----------------+--------+-----------------------+
|      AZ      |     CIDR       | Public |        Tags           |
+--------------+----------------+--------+-----------------------+
|  eu-west-1a  |  10.42.0.0/20  |  True  |  1                    |  ← public, kubernetes.io/role/elb
|  eu-west-1b  |  10.42.16.0/20 |  True  |  1                    |
|  eu-west-1a  |  10.42.128.0/20|  False |  1                    |  ← private, kubernetes.io/role/internal-elb
|  eu-west-1b  |  10.42.144.0/20|  False |  1                    |
+--------------+----------------+--------+-----------------------+
```

Worker EC2 instances should be in private subnets only:

```bash
aws ec2 describe-instances --region "$REGION" \
  --filters "Name=tag:eks:cluster-name,Values=$CLUSTER" \
  --query 'Reservations[].Instances[].{ID:InstanceId,PrivateIP:PrivateIpAddress,PublicIP:PublicIpAddress,Subnet:SubnetId}' \
  --output table
```

`PublicIP` column should be empty for both instances. If you see a public IP, something is wrong with the subnet placement.

Security groups attached to the nodes (auto-created by the EKS module):

```bash
aws ec2 describe-security-groups --region "$REGION" \
  --filters "Name=tag:kubernetes.io/cluster/$CLUSTER,Values=owned" \
  --query 'SecurityGroups[].[GroupId,GroupName,Description]' --output table
```

Expected: 2 security groups — `eks-cluster-sg-shop-demo-…` (for control-plane ENIs) and `shop-demo-node-…` (for worker EC2). Plus the NLB SG that AWS auto-created for the Helm-installed ingress.

NLB hostname (your eventual public URL):

```bash
kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
# e.g. ab12cd34xyz.elb.eu-west-1.amazonaws.com
```

`dig +short` that hostname — it should resolve to 2 public IPs (one per AZ).

---

## Phase 10 — Wire GitHub Actions

The simplest path: copy-paste the `gh` block Terraform printed:

```bash
terraform output -raw github_setup
```

That outputs three commands (one per Variable/Secret) plus a verification step. Run them. Requires `gh auth login` first.

If you'd rather click in the GitHub UI, go to **Settings → Secrets and variables → Actions** in your repo, then add:

| Type | Name | Value |
|------|------|-------|
| Repository **Variable** | `EKS_CLUSTER_NAME` | `terraform output -raw cluster_name` |
| Repository **Variable** | `AWS_REGION` | `terraform output -raw aws_region` |
| Repository **Secret** | `AWS_ROLE_TO_ASSUME` | `terraform output -raw github_oidc_role_arn` |

The `if: vars.EKS_CLUSTER_NAME != ''` gate at line 362 of `cd.yml` activates the moment `EKS_CLUSTER_NAME` is set. Until then, the `deploy:` job is silently skipped, which is what you want for a demo branch you don't intend to deploy.

### Create the GitHub Environment

The deploy job runs in the `production-eks` GitHub Environment. Create it once:

1. Repo → **Settings → Environments → New environment**.
2. Name: **`production-eks`** (must match exactly — the IAM trust policy is locked to this string).
3. (Optional but recommended) **Required reviewers → add yourself**. This adds a "click to approve" gate before each prod deploy.
4. (Optional) **Wait timer → 1 minute**. Gives you time to cancel if you immediately notice a problem.

---

## Phase 11 — Trigger the first deploy

```bash
git commit --allow-empty -m "kick CI to deploy to EKS"
git push
```

Watch it: **GitHub → Actions → CD**. The job graph for the AWS branch:

```
ci ──► prepare ──► build ──► push ──► update-manifests ──► seed-secrets-eks ──► deploy
                                                                                  │
                                                                                  └─► writes Live URL to job summary
```

Each job has its own log; `deploy` is the one to watch.

Expected timing:

| Job | Duration |
|-----|---------|
| `prepare` | 30 s |
| `build` (5 services in parallel) | 4–6 min |
| `push` (Docker Hub) | 1–2 min |
| `update-manifests` | 30 s |
| `seed-secrets-eks` | 30 s |
| `deploy` | 3–5 min (rolls 5 deployments, waits for each) |

Total CI run: **~10 minutes**.

When `deploy` finishes, scroll to the job summary (link at top of the run) for **Live URL**.

---

## Phase 12 — Smoke test

```bash
URL=$(kubectl -n ingress-nginx get svc ingress-nginx-controller \
        -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "App is at: http://$URL"

curl -sI "http://$URL/health/ready"
# HTTP/1.1 200 OK

curl -sI "http://$URL/"
# HTTP/1.1 200 OK
# Content-Type: text/html

curl -s -X POST "http://$URL/graphql" \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ __typename }"}'
# {"data":{"__typename":"Query"}}

open "http://$URL"   # macOS
# OR
xdg-open "http://$URL"   # Linux
```

The first request can take **30–60 s** after deploy while the NLB warms up health checks across both AZs. If you get connection-refused, wait a minute and retry.

If you also seeded Grafana Cloud secrets and applied observability, you should now see traffic in Grafana → Explore → `grafanacloud-<your-stack>-prom`:

```promql
up{job="prometheus.scrape.shop_services"} == 1
```

---

## Phase 13 — Day-2 operations

### Resize the node group

Edit `terraform.tfvars`:

```hcl
node_instance_type = "t3.large"
node_desired_size  = 3
node_max_size      = 6
```

```bash
terraform apply
```

The managed node group does a **rolling replacement** — drains one node at a time, waits for pods to evict cleanly, then terminates. ~3 min per node, no downtime if your Deployments have `replicas >= 2`.

### Switch to spot instances (halve compute cost)

In `main.tf`:

```hcl
eks_managed_node_groups = {
  default = {
    capacity_type  = "SPOT"
    instance_types = ["t3.medium", "t3a.medium", "t2.medium"]   # multiple types = better availability
    # ...
  }
}
```

Spot nodes get a **2-minute termination notice** when AWS reclaims them. Combine with `replicas >= 2` and a `PodDisruptionBudget` to survive evictions.

### Restrict the Kubernetes API to known IPs

In `main.tf`'s `module "eks"` block:

```hcl
cluster_endpoint_public_access       = true
cluster_endpoint_public_access_cidrs = [
  "203.0.113.0/24",   # your office
  "192.0.2.50/32",    # your home VPN
]
```

> If you do this, GitHub Actions runners (whose IPs change) **lose access** unless you also allow GitHub's published IP ranges from `https://api.github.com/meta` (about 80 CIDRs). Use a self-hosted runner inside the VPC instead for cleaner prod hygiene.

### Add a branch / environment that may deploy

```hcl
github_branches     = ["main", "release/*"]
github_environments = ["production-eks", "staging-eks"]
```

`terraform apply` updates only the IAM role's trust policy — cluster untouched.

### Tighten the EKS access entry to a Namespace scope

```hcl
access_entries = {
  github_actions = {
    principal_arn = aws_iam_role.github_oidc.arn
    type          = "STANDARD"
    policy_associations = {
      shop_only = {
        policy_arn = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSEditPolicy"
        access_scope = {
          type       = "namespace"
          namespaces = ["shop", "ingress-nginx", "observability"]
        }
      }
    }
  }
}
```

CI can now `apply` to those three namespaces only — kube-system and others are off-limits.

### Roll out a new Kubernetes minor version

```hcl
kubernetes_version = "1.31"
```

`terraform apply` upgrades the control plane in place (~10 min, no downtime), then the node group cordons / drains / replaces nodes (~3 min per node). Always check release notes for breaking API removals before bumping.

---

## Phase 14 — Teardown

```bash
cd infra/terraform/aws
terraform destroy
```

Type `yes` when prompted. ~15 minutes. Order of deletion:

1. Helm release ingress-nginx (which deletes the NLB → frees its public IP)
2. Managed node group (terminates EC2)
3. EKS cluster
4. EKS add-ons
5. NAT Gateway (releases its Elastic IP)
6. Subnets, route tables, IGW, VPC
7. IAM role + OIDC provider

If `terraform destroy` errors:

| Error | Fix |
|-------|-----|
| `DependencyViolation` on the VPC | Something *outside* Terraform created an ENI in this VPC (often a manually-launched LB or a leftover RDS instance). Find it in the AWS console: **VPC → Network Interfaces → filter by VPC ID**. Delete it. Retry `terraform destroy`. |
| `OIDCProviderInUse` on `aws_iam_openid_connect_provider` | Another stack in the same account references it. Set `create_oidc_provider = false` in *those* stacks first. |
| Hangs on the EKS cluster delete | Add-ons may need explicit deletion. `aws eks list-addons` then `aws eks delete-addon` per add-on. Retry. |

After successful destroy, **also delete the GitHub Variables and Secret** so a stray push doesn't try to deploy to a non-existent cluster:

```bash
gh variable delete EKS_CLUSTER_NAME --repo "$GITHUB_REPO"
gh variable delete AWS_REGION       --repo "$GITHUB_REPO"
gh secret   delete AWS_ROLE_TO_ASSUME --repo "$GITHUB_REPO"
```

---

## Cost cheat sheet

Monthly cost while the cluster is running 24/7 in `eu-west-1` (on-demand pricing, May 2026):

| Component | Hourly | Monthly |
|-----------|-------:|--------:|
| EKS control plane | $0.10 | ~$72 |
| 2 × t3.medium worker nodes | $0.0832 | ~$60 |
| 1 × NAT Gateway (single-NAT mode) | $0.045 | ~$33 |
| 1 × NLB (ingress-nginx) | $0.0225 | ~$16 |
| EBS gp3 root volumes (2 × 20 GiB) | — | ~$3 |
| Data egress | varies | ~$0–$5 demo |
| **Total** | **≈ $0.25** | **≈ $185** |

Knock it down by:

- `terraform destroy` when not actively demoing (control plane is pay-per-hour).
- `capacity_type = "SPOT"` in `main.tf` — halves node cost.
- `node_desired_size = 1` if single-user demo is enough.
- Switch to `eu-north-0` / `us-east-1` for slightly cheaper instance pricing.

---

## Troubleshooting reference

| Symptom | Cause | Fix |
|---------|-------|-----|
| `terraform apply` errors `EntityAlreadyExists ... oidc-provider/token.actions.githubusercontent.com` | Account already has the GitHub OIDC provider from another stack | `create_oidc_provider = false` in `terraform.tfvars` |
| CI's `deploy` job: `Could not assume role with OIDC` | Trust policy mismatch — the workflow's `sub` claim doesn't match any of your `github_branches` / `github_environments` | Add the branch (or use the env) to `terraform.tfvars` and re-apply |
| CI's `deploy` job: `kubectl apply` returns `forbidden` | IAM was authenticated but the EKS access entry wasn't applied | Confirm `module.eks.access_entries.github_actions` exists; run `terraform apply` again |
| `kubectl get nodes` returns nothing for >5 min after apply | Node group failed to bootstrap (rare; usually a CNI / VPC config drift) | `aws eks describe-nodegroup --cluster-name <name> --nodegroup-name default` and inspect `health.issues[]` |
| `helm_release.ingress_nginx` times out | Cluster has no schedulable nodes yet | `kubectl describe pods -n kube-system` to see why pods are Pending; usually a missing node IAM policy → re-run `terraform apply` |
| `terraform destroy` hangs on `aws_iam_openid_connect_provider` | Another stack in the same account still references it | `create_oidc_provider = false` on the *other* stacks |
| Apply succeeds but `terraform output ingress_nginx_hostname` is empty | NLB takes 60–90 s to receive a public DNS name after the Service is created | `terraform refresh && terraform output ingress_nginx_hostname` after a minute |
| `curl http://$URL/` hangs after a successful deploy | NLB health checks haven't gone green yet (60–90 s warm-up across both AZs) | Wait, retry. Check `kubectl -n shop get pods` are all Ready. |

---

## File map

```
infra/terraform/aws/
├── providers.tf            ← Terraform / provider version pins, kube/helm wiring
├── variables.tf            ← all knobs the operator can turn
├── main.tf                 ← VPC + EKS + managed node group
├── iam-cicd.tf             ← GitHub OIDC provider + assumable role + trust policy
├── ingress.tf              ← ingress-nginx Helm release (NLB)
├── outputs.tf              ← cluster name, role ARN, kubeconfig command, gh-cli block
├── terraform.tfvars.example ← template; copy to terraform.tfvars
├── .gitignore              ← ignores .terraform/, *.tfstate, terraform.tfvars
└── README.md               ← this file
```

CI / runtime files this module is the prerequisite for:

```
.github/actions/aws-eks-kubectl/action.yml   ← assumes role, runs `aws eks update-kubeconfig`
.github/workflows/cd.yml  (jobs: seed-secrets-eks, deploy)
infra/aws/eks-overlay/                        ← kustomize overlay applied by `deploy`
```

---

## TL;DR

```bash
# Once
brew install terraform awscli gh kubectl helm
aws configure
gh auth login

# Per cluster
git clone <repo>
cd nestjs-shop-azure/infra/terraform/aws
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars                 # set github_repo

terraform init
terraform apply                           # ~15-20 min

$(terraform output -raw kubeconfig_command)
kubectl get nodes

terraform output -raw github_setup        # paste the gh commands

# Create GitHub Environment "production-eks" once in the UI, then:
git commit --allow-empty -m "deploy"
git push                                  # CI runs, deploys, prints Live URL

# Stop paying when done
terraform destroy
```

Total time from zero to a live public URL: **about 50 minutes**. ~25 min of that is `terraform apply` + the first CI run; the rest is one-time setup that you don't repeat.



<!-- gh variable delete EKS_CLUSTER_NAME --repo "$GITHUB_REPO"
gh variable delete AWS_REGION       --repo "$GITHUB_REPO"
gh secret   delete AWS_ROLE_TO_ASSUME --repo "$GITHUB_REPO" -->