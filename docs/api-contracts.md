# API Contracts

## POST /api/generate

Generates Terraform files and validation issues from the visual project state.

Request:

```json
{
  "id": "project_aws_saas",
  "name": "startup-saas",
  "provider": "aws | azure | gcp",
  "environment": "prod",
  "region": "us-east-1",
  "remoteStateBucket": "company-terraform-state",
  "owner": "platform",
  "costCenter": "cc-1001",
  "components": []
}
```

Response:

```json
{
  "files": [
    { "path": "terraform-project/main.tf", "language": "hcl", "content": "..." }
  ],
  "issues": [
    { "path": "remoteStateBucket", "severity": "error", "message": "Remote state bucket is required for production stacks." }
  ]
}
```

## POST /api/assistant

Returns rule-based MVP guidance. In production this endpoint should call an AI provider with project state, generated files, module metadata, and policy guardrails.

Response:

```json
{
  "summary": "Use private subnets for compute and data services...",
  "graphActions": ["Keep VPC as the root dependency."]
}
```

## Planned APIs

- `POST /api/projects`: create project
- `GET /api/projects`: list projects visible to the user
- `PATCH /api/projects/:id`: update metadata or autosaved graph
- `POST /api/projects/:id/versions`: snapshot version history
- `POST /api/projects/:id/export/github`: create branch or pull request
- `POST /api/modules/sync`: sync Claranet and future module registries
- `POST /api/validate/terraform`: run `terraform fmt`, `terraform validate`, and lint checks
