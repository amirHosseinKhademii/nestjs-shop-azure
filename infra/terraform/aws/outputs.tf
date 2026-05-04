# ─────────────────────────────────────────────────────────────────────────────
# outputs.tf
#
# Everything you need to wire CI to the cluster, plus the kubeconfig
# command for poking around manually. Run `terraform output github_setup`
# after `apply` to get a copy-pasteable block of `gh variable set …`
# commands.
# ─────────────────────────────────────────────────────────────────────────────

output "cluster_name" {
  description = "EKS cluster name. Becomes the GitHub Variable EKS_CLUSTER_NAME."
  value       = module.eks.cluster_name
}

output "aws_region" {
  description = "AWS region. Becomes the GitHub Variable AWS_REGION."
  value       = var.aws_region
}

output "cluster_endpoint" {
  description = "Public Kubernetes API endpoint."
  value       = module.eks.cluster_endpoint
}

output "cluster_arn" {
  description = "ARN of the EKS cluster — handy for IAM scoping."
  value       = module.eks.cluster_arn
}

output "github_oidc_role_arn" {
  description = "IAM Role ARN to assume from GitHub Actions. Becomes the GitHub SECRET AWS_ROLE_TO_ASSUME."
  value       = aws_iam_role.github_oidc.arn
}

output "kubeconfig_command" {
  description = "One-liner that points your local kubectl at this cluster. Run it after `terraform apply`."
  value       = "aws eks update-kubeconfig --name ${module.eks.cluster_name} --region ${var.aws_region}"
}

# Best-effort hint at the public hostname assigned to the ingress NLB. May
# be empty for a few seconds after `apply` while AWS provisions the LB; if
# so, re-run `terraform refresh && terraform output ingress_nginx_hostname`
# in 30 s. The deploy job in cd.yml resolves this exact value at runtime.
output "ingress_nginx_hostname" {
  description = "AWS-assigned NLB hostname (e.g. abcd…elb.amazonaws.com). Empty if the controller wasn't installed."
  value       = try(
    data.kubernetes_service.ingress_nginx[0].status[0].load_balancer[0].ingress[0].hostname,
    "(install_ingress_nginx=false or LB not provisioned yet)"
  )
}

# Look up the actual Service so we can read its assigned LB hostname. The
# `count` keeps this data source quiet when the user disabled ingress.
data "kubernetes_service" "ingress_nginx" {
  count = var.install_ingress_nginx ? 1 : 0

  metadata {
    name      = "ingress-nginx-controller"
    namespace = kubernetes_namespace.ingress_nginx[0].metadata[0].name
  }

  depends_on = [helm_release.ingress_nginx]
}

# Single block formatted for paste-into-terminal use. Run:
#   terraform output -raw github_setup
# (the `-raw` strips the surrounding quotes Terraform adds for plain-string
# outputs).
output "github_setup" {
  description = "Copy-paste block of `gh` CLI commands to wire CI to this cluster."
  value       = <<-EOT

    # ──────────────────────────────────────────────────────────────────
    # Wire GitHub Actions to this cluster. Requires `gh` CLI logged in:
    #   brew install gh && gh auth login
    # Repo must be ${var.github_repo}.
    # ──────────────────────────────────────────────────────────────────

    gh variable set EKS_CLUSTER_NAME --repo ${var.github_repo} --body "${module.eks.cluster_name}"
    gh variable set AWS_REGION       --repo ${var.github_repo} --body "${var.aws_region}"
    gh secret   set AWS_ROLE_TO_ASSUME --repo ${var.github_repo} --body "${aws_iam_role.github_oidc.arn}"

    # Sanity check the values were saved:
    gh variable list --repo ${var.github_repo}
    gh secret   list --repo ${var.github_repo}

    # Trigger a CI run that exercises the deploy path:
    gh workflow run cd.yml --repo ${var.github_repo} --ref main
    gh run watch --repo ${var.github_repo}
  EOT
}
