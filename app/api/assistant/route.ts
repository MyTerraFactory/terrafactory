import { NextResponse } from "next/server";
import type { ProjectState } from "@/lib/types";

function recommendationFor(project: ProjectState): string {
  const enabled = new Set(project.components.filter((component) => component.enabled).map((component) => component.type));
  const notes = [
    `I see an ${project.provider.toUpperCase()} ${project.environment} stack in ${project.region}.`,
    project.provider === "aws"
      ? "Use private subnets for compute and data services, keep public subnets limited to edge entry points, and keep state in S3 with DynamoDB locking."
      : project.provider === "azure"
        ? "Keep AKS, PostgreSQL Flexible Server, and Redis on private subnets, use Azure Storage remote state, and route public traffic through Application Gateway with WAF."
        : "Keep GKE private where possible, use GCS remote state, private IP for Cloud SQL, and put public traffic behind HTTPS Load Balancing plus Cloud Armor."
  ];

  if (enabled.has("eks") && !enabled.has("alb")) {
    notes.push("Add an ALB or ingress controller plan so workloads have a controlled public entry point.");
  }

  if (enabled.has("rds")) {
    notes.push("RDS is configured as a sensitive tier; keep passwords outside tfvars and prefer Secrets Manager or injected TF_VAR values.");
  }

  if (!enabled.has("redis")) {
    notes.push("For latency-sensitive SaaS sessions or queues, Redis is a good next block.");
  }

  return notes.join("\n\n");
}

export async function POST(request: Request) {
  const project = (await request.json()) as ProjectState;

  return NextResponse.json({
    summary: recommendationFor(project),
    graphActions: [
      "Keep VPC as the root dependency.",
      "Attach data tiers only to private/database subnets.",
      "Expose traffic through ALB rather than public node groups."
    ]
  });
}
