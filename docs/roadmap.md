# MVP Roadmap

## Phase 1: Multi-Cloud Composer

- Ship AWS VPC, EKS, RDS, Redis, ALB, and Security Group blocks.
- Ship broad AWS service coverage with local module templates for services that need concrete aws provider implementation hardening.
- Ship Azure VNet, AKS, PostgreSQL Flexible Server, Redis, Application Gateway, and NSG blocks.
- Ship broad Azure service coverage with local module templates for services that need concrete azurerm implementation hardening.
- Ship GCP VPC, GKE, Cloud SQL PostgreSQL, Memorystore, Cloud Load Balancer, and firewall rule blocks.
- Generate complete Terraform project files.
- Add Monaco preview, React Flow graph, ZIP download, copy action, autosave, and validation issues.
- Persist projects and version history with Prisma/PostgreSQL.

## Phase 2: SaaS Collaboration

- Add GitHub and Google OAuth.
- Add teams, RBAC, shared templates, and audit history.
- Add GitHub/GitLab export with branch and pull request workflows.
- Add Terraform Cloud workspace export.

## Phase 3: Registry and Validation

- Sync Claranet module metadata on a schedule.
- Add custom module templates.
- Run `terraform fmt`, `terraform validate`, `tflint`, and security policy checks.
- Add cost estimation and drift detection hooks.

## Phase 4: New Targets

- Add OpenTofu, Pulumi, Crossplane, Helm chart, and CI/CD pipeline generation targets.
