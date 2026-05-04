# ─────────────────────────────────────────────────────────────────────────────
# main.tf
#
# The actual AWS footprint. Two well-maintained community modules do the
# heavy lifting:
#
#   1. terraform-aws-modules/vpc/aws
#        creates the VPC, subnets, route tables, IGW, NAT, and the
#        DNS / hostname options EKS expects.
#
#   2. terraform-aws-modules/eks/aws
#        creates the EKS control plane, the managed node group (which in
#        turn creates the worker EC2 instances), the cluster IAM role, the
#        node IAM role, and registers the essential add-ons.
#
# Why use the modules instead of writing it by hand? Because EKS has roughly
# 40 IAM policies, security-group rules, and tags that *all* have to be
# right or the cluster boots into a non-functional state. The official
# modules encode every gotcha learnt by the community.
#
# Cost while running (24/7, eu-west-1):
#   EKS control plane ........ $0.10 / hr  =  ~$72 / mo
#   2 × t3.medium  ............ $0.0416/hr =  ~$60 / mo  (per node)
#   1 × NAT Gateway  .......... $0.045 /hr =  ~$33 / mo  (single-NAT mode)
#   1 × NLB (from ingress)  ... $0.0225/hr =  ~$16 / mo
#   ─────────────────────────────────────────  TOTAL ≈ $180 / mo
#
# Halve it by `terraform destroy` when not actively demoing. EKS is
# pay-per-hour, no minimum commitment.
# ─────────────────────────────────────────────────────────────────────────────

# Look up the AZs available *in the chosen region*. AZ identifiers
# (`eu-west-1a`, `1b`, …) are mapped per-AWS-account, so hard-coding them
# breaks portability. `slice(..., 0, var.az_count)` picks the first N.
data "aws_availability_zones" "available" {
  state = "available"
}

# Used by the OIDC trust policy and a few outputs.
data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, var.az_count)

  # Convenience: every CIDR in the VPC is /20 (4094 usable IPs). Plenty for
  # ~250 pods per node × 2 nodes. Public subnets get the lower half of the
  # VPC, private subnets the upper half — easy to remember, easy to audit.
  public_subnet_cidrs  = [for i, _ in local.azs : cidrsubnet(var.vpc_cidr, 4, i)]      # 10.42.0.0/20, 10.42.16.0/20, …
  private_subnet_cidrs = [for i, _ in local.azs : cidrsubnet(var.vpc_cidr, 4, i + 8)]  # 10.42.128.0/20, 10.42.144.0/20, …
}

# ─────────────────────────────────────────────────────────────────────────────
# VPC
#
# This is "the network the cluster lives in". EKS requires:
#   • At least 2 subnets in different AZs (the control plane is multi-AZ).
#   • A route to the Internet for pulling images from Docker Hub / ECR
#     (worker nodes use the NAT in private subnets; the LB lives in public).
#   • Specific tags on subnets so AWS Load Balancer Controller (or the
#     in-tree controller, which we use) knows which subnets to attach
#     ELBs / NLBs to. The eks/aws module sets them automatically.
#
# Public  subnets host: NAT Gateway, ingress NLB. NOT the worker nodes.
# Private subnets host: the worker EC2 instances and the Pods running on them.
# ─────────────────────────────────────────────────────────────────────────────
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.13"

  name = "${var.cluster_name}-vpc"
  cidr = var.vpc_cidr

  azs             = local.azs
  public_subnets  = local.public_subnet_cidrs
  private_subnets = local.private_subnet_cidrs

  # Internet egress for the worker nodes. `single_nat_gateway = true` saves
  # ~$33/mo per AZ at the cost of cross-AZ egress traffic if a node in AZ-b
  # talks to the NAT in AZ-a. For a demo this trade-off is the right one.
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
}

# ─────────────────────────────────────────────────────────────────────────────
# EKS cluster + managed node group
#
# `cluster_endpoint_public_access = true` keeps the API reachable from the
# internet (so your laptop and GitHub Actions can `kubectl`). For
# production, restrict to a known CIDR or set `public_access_cidrs`.
#
# `enable_irsa = true` provisions the OIDC provider that lets PODS assume
# IAM roles (separate from the GitHub-Actions OIDC provider in iam-cicd.tf).
# Even though we don't currently grant any pods AWS permissions, having
# IRSA ready means future cluster add-ons (cert-manager, external-dns,
# Karpenter, etc.) work without re-applying.
#
# `cluster_addons` are first-party Kubernetes add-ons EKS keeps patched
# automatically. The four below are essentially mandatory:
#   • coredns      — DNS for in-cluster service discovery
#   • kube-proxy   — translates Service IPs into iptables rules on every node
#   • vpc-cni      — assigns real VPC IPs to pods (so they're routable on the LB)
#   • eks-pod-identity-agent  — newer / simpler alternative to IRSA tokens
#
# `access_entries` is the modern (post-aws-auth-ConfigMap) way of granting
# IAM principals access to the cluster's Kubernetes API. The single entry
# below maps the GitHub-OIDC IAM role (created in iam-cicd.tf) to the
# built-in `cluster-admin` group, so `cd.yml` can do `kubectl apply -k …`.
# Tighten `policy_associations` to a Namespace-scoped policy for production.
# ─────────────────────────────────────────────────────────────────────────────
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.24"

  cluster_name    = var.cluster_name
  cluster_version = var.kubernetes_version

  cluster_endpoint_public_access = true
  enable_irsa                    = true

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  cluster_addons = {
    coredns                = {}
    kube-proxy             = {}
    vpc-cni                = {}
    eks-pod-identity-agent = {}
  }

  # Single managed node group. `capacity_type = "ON_DEMAND"` is the safe
  # default; switch to `SPOT` to halve the per-hour cost at the risk of
  # 2-min termination notices. Add a second node group with a node taint
  # if you want to dedicate nodes to system pods.
  eks_managed_node_groups = {
    default = {
      ami_type       = "AL2023_x86_64_STANDARD"
      instance_types = [var.node_instance_type]
      capacity_type  = "ON_DEMAND"

      desired_size = var.node_desired_size
      min_size     = var.node_min_size
      max_size     = var.node_max_size

      disk_size = var.node_disk_size_gb

      labels = {
        workload = "shop"
      }
    }
  }

  # ── Access for the GitHub OIDC role (defined in iam-cicd.tf). Without
  # this, the IAM role can authenticate to AWS but cannot issue
  # `kubectl` calls — you'd see RBAC `forbidden` errors in the deploy job.
  # ─────────────────────────────────────────────────────────────────────
  enable_cluster_creator_admin_permissions = true

  access_entries = {
    github_actions = {
      principal_arn = aws_iam_role.github_oidc.arn
      type          = "STANDARD"

      policy_associations = {
        admin = {
          policy_arn = "arn:${data.aws_partition.current.partition}:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
          access_scope = {
            type = "cluster"
          }
        }
      }
    }
  }

  tags = {
    role = "demo-cluster"
  }
}
