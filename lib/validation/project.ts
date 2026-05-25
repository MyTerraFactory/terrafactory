import { getComponentDefinition } from "@/lib/registry/catalog";
import type { ProjectState, ValidationIssue } from "@/lib/types";

export function validateProject(project: ProjectState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!project.remoteStateBucket) {
    issues.push({ path: "remoteStateBucket", severity: "error", message: "Remote state bucket is required for production stacks." });
  }

  for (const component of project.components.filter((item) => item.enabled)) {
    const definition = getComponentDefinition(component.type, project.provider);
    if (!definition) {
      issues.push({ path: component.id, severity: "error", message: `No module definition for ${component.type}.` });
      continue;
    }

    for (const field of definition.fields) {
      const value = component.config[field.key];
      if (field.required && (value === undefined || value === "" || (Array.isArray(value) && value.length === 0))) {
        issues.push({ path: `${component.id}.${field.key}`, severity: "error", message: `${field.label} is required.` });
      }

      if (field.type === "number" && typeof value === "number") {
        if (field.min !== undefined && value < field.min) {
          issues.push({ path: `${component.id}.${field.key}`, severity: "error", message: `${field.label} must be at least ${field.min}.` });
        }
        if (field.max !== undefined && value > field.max) {
          issues.push({ path: `${component.id}.${field.key}`, severity: "error", message: `${field.label} must be at most ${field.max}.` });
        }
      }
    }
  }

  return issues;
}
