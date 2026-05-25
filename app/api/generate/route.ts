import { NextResponse } from "next/server";
import { generateTerraformProject } from "@/lib/terraform/hcl";
import { validateProject } from "@/lib/validation/project";
import type { ProjectState } from "@/lib/types";

export async function POST(request: Request) {
  const project = (await request.json()) as ProjectState;
  const issues = validateProject(project);
  const files = generateTerraformProject(project);

  return NextResponse.json({ files, issues });
}
