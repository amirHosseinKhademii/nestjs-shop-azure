# ─────────────────────────────────────────────────────────────────────────────
# providers.tf
#
# Pins Terraform itself + every provider this module talks to. Pinning matters
# because provider major versions change argument names and behaviour
# (e.g. `aws` v5 → v6 reorganised `aws_eks_cluster` and renamed several
# attributes). Without pins, a colleague running `terraform init` next week
# could pick up a breaking version and the apply would fail with cryptic
# diffs.
#
# Why these four providers?
#   • aws         — creates the VPC, EKS, IAM, and the LoadBalancer Service
#   • kubernetes  — talks to the cluster control plane *after* it's created
#                    (used by the EKS module to write `aws-auth` /
#                    access-entries).
#   • helm        — installs ingress-nginx so the cluster has a real public
#                    LB on day one (without it, `kubectl apply -k` would
#                    deploy the apps but they'd have nowhere to receive
#                    traffic).
#   • tls         — used by the GitHub OIDC provider to fetch GitHub's
#                    current SSL thumbprint at apply time, so we don't have
#                    to hard-code a value that GitHub may rotate.
# ─────────────────────────────────────────────────────────────────────────────

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.32"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.15"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # ── Optional: remote state ──────────────────────────────────────────────
  # Uncomment + adjust once you have an S3 bucket. Remote state is what
  # lets a teammate (or a CI runner) `terraform plan` against the same
  # state file you applied. Without it, every operator has their own
  # `terraform.tfstate` and they will overwrite each other's resources.
  #
  # backend "s3" {
  #   bucket         = "shop-demo-tfstate"
  #   key            = "aws/eks/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "shop-demo-tflocks"   # state-locking, prevents two
  #                                           # concurrent applies from racing
  #   encrypt        = true
  # }
}

# AWS provider — picks up credentials from (in order): env vars, the AWS
# CLI's `~/.aws/credentials`, an EC2 / EKS instance role, or the IAM Identity
# Center session you `aws sso login`'d into. The `aws_region` variable lets
# you re-target without editing this file.
provider "aws" {
  region = var.aws_region

  # Tag every resource we create with stack metadata. This is *invaluable*
  # for cost reporting (Cost Explorer can filter by tag) and for finding
  # stragglers when a destroy half-fails ("show me everything tagged
  # `terraform_module=infra/terraform/aws`").
  default_tags {
    tags = {
      project          = "shop-nest-azure"
      stack            = "aws-eks-demo"
      terraform_module = "infra/terraform/aws"
      managed_by       = "terraform"
    }
  }
}

# ── kubernetes / helm providers ─────────────────────────────────────────────
# These two need to *authenticate to the EKS cluster* — but the cluster
# doesn't exist yet on the very first apply. The standard solution is the
# `exec` block below, which calls `aws eks get-token` *at the time the
# provider is used*, not at plan time. So order of operations is:
#
#   1. aws provider creates the EKS cluster (exists now)
#   2. EKS module needs to write an aws-auth/access-entry ⇒ kubernetes
#      provider runs `aws eks get-token` ⇒ gets a fresh token ⇒ talks to
#      the just-created cluster.
#
# `cluster_endpoint` and `cluster_certificate_authority_data` come from the
# `module.eks` outputs created in `main.tf`. They are referenced lazily;
# Terraform builds the dependency graph automatically.

provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name, "--region", var.aws_region]
  }
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)

    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name, "--region", var.aws_region]
    }
  }
}
