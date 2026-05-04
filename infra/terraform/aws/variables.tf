# ─────────────────────────────────────────────────────────────────────────────
# variables.tf
#
# Inputs the operator can override per environment via either:
#   - a `terraform.tfvars` file (gitignored; copy from the .example),
#   - `-var key=value` flags on the CLI,
#   - `TF_VAR_key=value` environment variables.
#
# Defaults are tuned for the cheapest demo cluster that can host the 5
# backend pods + ingress-nginx + Alloy. Bump the node group for production.
# ─────────────────────────────────────────────────────────────────────────────

# AWS region. Pick one geographically close to you for lower latency in
# `kubectl exec` and faster image pulls. eu-west-1 (Ireland) and
# us-east-1 (N. Virginia) tend to have the cheapest spot pricing.
variable "aws_region" {
  description = "AWS region the cluster lives in. Must be a region where EKS is GA."
  type        = string
  default     = "eu-west-1"
}

# Cluster name. Becomes part of every resource's name (so don't pick something
# generic like "demo" — your AWS account is shared across teams). 1–100 chars,
# no spaces, alphanum + dashes.
variable "cluster_name" {
  description = "EKS cluster name. Used as a prefix for related resources too."
  type        = string
  default     = "shop-demo"

  validation {
    condition     = can(regex("^[a-z0-9-]{1,40}$", var.cluster_name))
    error_message = "cluster_name must be lowercase alphanumeric / dash, max 40 chars."
  }
}

# Kubernetes minor version. AWS supports the last 4 minor versions; keep this
# within their support window or you'll get force-upgraded. Bump in lockstep
# with eks-overlay's tested manifests.
variable "kubernetes_version" {
  description = "EKS Kubernetes minor version (e.g. 1.30, 1.31). EKS supports the last 4."
  type        = string
  default     = "1.30"
}

# VPC CIDR. /16 gives you 65k IPs split across 2 AZs (more than enough for
# the demo). If you peer this VPC with another, make sure the CIDR doesn't
# overlap with theirs.
variable "vpc_cidr" {
  description = "VPC CIDR. Pick a non-overlapping /16 if you intend to peer."
  type        = string
  default     = "10.42.0.0/16"
}

# AZs to spread subnets across. 2 is the EKS minimum and keeps cost down
# (each NAT Gateway is ~$33/mo, and we use one per AZ for HA — see main.tf
# `single_nat_gateway = true` for the cheaper single-NAT mode).
variable "az_count" {
  description = "Number of Availability Zones to span. EKS requires at least 2."
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 3
    error_message = "az_count must be 2 or 3. EKS minimum is 2."
  }
}

# ── Worker node group ──────────────────────────────────────────────────────
# t3.medium = 2 vCPU / 4 GiB / burstable. Enough to fit the 5 backend pods
# (each ~150 MiB heap) + ingress-nginx + Alloy with headroom on 2 nodes.
# Upgrade to t3.large or m6i.large if you start seeing OOMKilled.

variable "node_instance_type" {
  description = "EC2 instance type for the managed node group."
  type        = string
  default     = "t3.medium"
}

variable "node_desired_size" {
  description = "Steady-state number of worker nodes."
  type        = number
  default     = 2
}

variable "node_min_size" {
  description = "Cluster Autoscaler / managed node group minimum."
  type        = number
  default     = 2
}

variable "node_max_size" {
  description = "Cluster Autoscaler / managed node group maximum (room for bursts)."
  type        = number
  default     = 4
}

variable "node_disk_size_gb" {
  description = "EBS root volume size per worker node, in GiB."
  type        = number
  default     = 20
}

# ── GitHub OIDC for CI/CD ──────────────────────────────────────────────────
# These wire `cd.yml`'s `deploy:` job (the AWS branch) to this cluster.
# Without them, the `aws-actions/configure-aws-credentials@v4` step in CI
# would have nothing to assume.

variable "github_repo" {
  description = <<-EOT
    GitHub repository in `owner/name` format (e.g. amirHosseinKhademii/nestjs-shop-azure).
    The IAM trust policy will only allow workflows from this repo to assume
    the CI/CD role. Wildcards across repos are deliberately not supported.
  EOT
  type        = string
}

variable "github_branches" {
  description = <<-EOT
    Branches whose workflow runs are allowed to assume the CI/CD role.
    Default `["main"]` is what you want for a portfolio demo. Add `dev` or
    `staging` if you want previews to deploy too.
  EOT
  type        = list(string)
  default     = ["main"]
}

variable "github_environments" {
  description = <<-EOT
    GitHub Environment names (Settings → Environments) that may assume the
    CI/CD role. Pair this with required reviewers / wait timers in GitHub
    for a manual approval gate. The deploy job in cd.yml uses
    `environment: production-eks`.
  EOT
  type        = list(string)
  default     = ["production-eks"]
}

variable "create_oidc_provider" {
  description = <<-EOT
    Create the IAM OpenID Connect identity provider for token.actions.
    githubusercontent.com. Set to FALSE if your AWS account already has
    one from another stack (you can only have one per issuer per account).
    Check with: `aws iam list-open-id-connect-providers`.
  EOT
  type        = bool
  default     = true
}

# ── ingress-nginx ──────────────────────────────────────────────────────────
# Installed via Helm so the apps have a real public LB on day one. Toggle
# off if you want to install ingress with your own Helm/Argo workflow.

variable "install_ingress_nginx" {
  description = "Install ingress-nginx via Helm (provisions an AWS NLB)."
  type        = bool
  default     = true
}

variable "ingress_nginx_chart_version" {
  description = "Chart version pin for ingress-nginx (https://github.com/kubernetes/ingress-nginx/releases)."
  type        = string
  default     = "4.11.3"
}
