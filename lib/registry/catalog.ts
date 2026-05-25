import { awsComponentDefinitions, awsModuleMappings } from "@/lib/registry/aws-components";
import { azureComponentDefinitions, azureModuleMappings } from "@/lib/registry/azure-components";
import { gcpComponentDefinitions, gcpModuleMappings } from "@/lib/registry/gcp-components";
import type { CloudProvider, ComponentDefinition, ComponentType, ModuleMapping } from "@/lib/types";

export function getComponentDefinitions(provider: CloudProvider): ComponentDefinition[] {
  if (provider === "aws") {
    return awsComponentDefinitions;
  }
  if (provider === "azure") {
    return azureComponentDefinitions;
  }
  if (provider === "gcp") {
    return gcpComponentDefinitions;
  }

  return [];
}

export function getComponentDefinition(type: ComponentType, provider: CloudProvider): ComponentDefinition | undefined {
  return getComponentDefinitions(provider).find((definition) => definition.type === type);
}

export function getModuleMapping(type: ComponentType, provider: CloudProvider): ModuleMapping | undefined {
  if (provider === "aws") {
    return awsModuleMappings.find((mapping) => mapping.resourceType === type);
  }
  if (provider === "azure") {
    return azureModuleMappings.find((mapping) => mapping.resourceType === type);
  }
  if (provider === "gcp") {
    return gcpModuleMappings.find((mapping) => mapping.resourceType === type);
  }

  return undefined;
}

export function getModuleMappings(provider: CloudProvider): ModuleMapping[] {
  if (provider === "aws") {
    return awsModuleMappings;
  }
  if (provider === "azure") {
    return azureModuleMappings;
  }
  if (provider === "gcp") {
    return gcpModuleMappings;
  }
  return [];
}
