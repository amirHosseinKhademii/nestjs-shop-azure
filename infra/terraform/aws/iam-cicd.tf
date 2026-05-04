# ─────────────────────────────────────────────────────────────────────────────
# iam-cicd.tf
#
# The "GitHub Actions can deploy without storing AWS keys" plumbing.
#
# How OIDC federation works:
#
#   1. Each GitHub Actions job is given a short-lived JSON Web Token by
#      GitHub itself, signed by GitHub's private key. The token's `sub`
#      claim looks like:
#         repo:amirHosseinKhademii/nestjs-shop-azure:ref:refs/heads/main
#         repo:amirHosseinKhademii/nestjs-shop-azure:environment:production-eks
#
#   2. The job calls `sts:AssumeRoleWithWebIdentity` against AWS,
#      presenting that token.
#
#   3. AWS verifies the signature against the public keys at
#      `https://token.actions.githubusercontent.com/.well-known/openid-configuration`.
#      The `aws_iam_openid_connect_provider` below is what registers
#      that issuer with our account so AWS will trust those tokens.
#
#   4. AWS checks the role's trust policy against the `sub` claim — if
#      the policy says "only main branch may assume me", and the token
#      came from a PR push, the assume fails closed. No leaked key, no
#      blast radius.
#
#   5. AWS returns short-lived (1 h) credentials. The job uses them for
#      `aws eks update-kubeconfig` and `kubectl apply`. They expire
#      automatically — you cannot accidentally check them into git.
#
# This is strictly better than storing `AWS_ACCESS_KEY_ID` / `_SECRET` as
# repo secrets. There is no equivalent password to leak.
# ─────────────────────────────────────────────────────────────────────────────

# Fetch GitHub's current TLS cert thumbprint at apply time. AWS used to
# require this list to be hard-coded (and you'd have to rotate it whenever
# GitHub rolled their cert). Recent provider versions accept an empty list
# and validate against the public OIDC discovery doc, but supplying the
# real thumbprint is still the most compatible setup.
data "tls_certificate" "github" {
  url = "https://token.actions.githubusercontent.com"
}

# The OIDC identity provider AWS uses to verify GitHub's signed JWTs.
# `count = var.create_oidc_provider ? 1 : 0` skips creation if your
# account already has one (you can only have ONE per `url` per AWS
# account — a second `terraform apply` on a sibling stack would conflict).
# To check first: `aws iam list-open-id-connect-providers`.
resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github.certificates[0].sha1_fingerprint]
}

# If we're not creating it, look up the existing one so the role's trust
# policy can reference its ARN. Either branch yields a single ARN we can
# plug into `Federated:` below.
data "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 0 : 1

  url = "https://token.actions.githubusercontent.com"
}

locals {
  github_oidc_provider_arn = (
    var.create_oidc_provider
      ? aws_iam_openid_connect_provider.github[0].arn
      : data.aws_iam_openid_connect_provider.github[0].arn
  )

  # Build the list of allowed `sub` values: one per (repo × branch) and
  # one per (repo × environment). The trust policy uses StringLike, so
  # wildcards inside any of these strings would also work.
  github_subs = concat(
    [for b in var.github_branches : "repo:${var.github_repo}:ref:refs/heads/${b}"],
    [for e in var.github_environments : "repo:${var.github_repo}:environment:${e}"],
  )
}

# The IAM role CI assumes. Its trust policy is what makes the whole
# federation safe — without the `sub` condition, ANY workflow run on ANY
# GitHub repo could assume the role just by pointing OIDC at our account.
data "aws_iam_policy_document" "github_oidc_trust" {
  statement {
    sid     = "GitHubOIDC"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_provider_arn]
    }

    # Token must come from GitHub Actions specifically, not some other
    # OIDC consumer that happens to use the same provider.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # And it must originate from one of our allowed (repo, branch) or
    # (repo, environment) combinations. This is the line that pins the
    # role to your repo and your repo only.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = local.github_subs
    }
  }
}

resource "aws_iam_role" "github_oidc" {
  name               = "${var.cluster_name}-github-oidc"
  description        = "Assumed by GitHub Actions in ${var.github_repo} to deploy to EKS via OIDC."
  assume_role_policy = data.aws_iam_policy_document.github_oidc_trust.json

  max_session_duration = 3600  # 1 h — matches the default the AWS CLI uses
}

# The minimum permissions the deploy job needs:
#
#   • eks:DescribeCluster — what `aws eks update-kubeconfig` calls. Without
#     it the kubeconfig step in the composite action fails with
#     "User is not authorized to perform: eks:DescribeCluster".
#   • eks:ListClusters — convenience, lets you `aws eks list-clusters` if
#     debugging without polluting the policy.
#
# Kubernetes-level permissions (apply, get, watch, etc.) come from the
# EKS access entry in main.tf, not from this IAM policy. IAM controls
# who can talk to the cluster's API; the access entry controls what
# they can do once authenticated. Two completely separate layers.
data "aws_iam_policy_document" "github_oidc_perms" {
  statement {
    sid    = "EksAuth"
    effect = "Allow"
    actions = [
      "eks:DescribeCluster",
      "eks:ListClusters",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_oidc" {
  name   = "eks-deploy"
  role   = aws_iam_role.github_oidc.id
  policy = data.aws_iam_policy_document.github_oidc_perms.json
}
