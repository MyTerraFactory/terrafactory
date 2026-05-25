import type { GeneratedFile, InfraComponent, ProjectState } from "@/lib/types";
import { getModuleMapping } from "@/lib/registry/catalog";

function quote(value: string): string {
  return JSON.stringify(value);
}

function toHclValue(value: unknown, indent = 0): string {
  const spaces = " ".repeat(indent);

  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => toHclValue(item, indent)).join(", ")}]`;
  }

  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }

  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value)
      .map(([key, item]) => `${spaces}  ${key} = ${toHclValue(item, indent + 2)}`)
      .join("\n");
    return `{\n${entries}\n${spaces}}`;
  }

  if (typeof value === "string" && value.startsWith("var.")) {
    return value;
  }

  if (
    typeof value === "string" &&
    (value.startsWith("local.") ||
      value.startsWith("module.") ||
      value.startsWith("azurerm_") ||
      value.startsWith("google_") ||
      value.startsWith("aws_") ||
      value.startsWith("merge(") ||
      value.startsWith("try("))
  ) {
    return value;
  }

  return quote(String(value ?? ""));
}

function block(name: string, labels: string[], body: Record<string, unknown>): string {
  const labelText = labels.map(quote).join(" ");
  const lines = Object.entries(body)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `  ${key} = ${toHclValue(value, 2)}`);
  return `${name} ${labelText} {\n${lines.join("\n")}\n}`;
}

function sanitizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function moduleName(component: InfraComponent): string {
  return `${component.type.replaceAll("-", "_")}_${sanitizeName(component.name).replaceAll("-", "_")}`;
}

function moduleRef(project: ProjectState, type: InfraComponent["type"], output: string): string {
  const component = enabledComponents(project).find((item) => item.type === type);
  return component ? `module.${moduleName(component)}.${output}` : `module.${type.replace("-", "_")}.${output}`;
}

function locationShort(project: ProjectState): string {
  return project.region
    .split(/[^a-zA-Z0-9]/)
    .map((part) => part.slice(0, 2))
    .join("")
    .slice(0, 8)
    .toLowerCase();
}

function enabledComponents(project: ProjectState): InfraComponent[] {
  return project.components.filter((component) => component.enabled);
}

function commonTags(project: ProjectState): Record<string, string> {
  return {
    Project: project.name,
    Environment: project.environment,
    Owner: project.owner,
    CostCenter: project.costCenter,
    ManagedBy: "TerraFactory"
  };
}

function componentTags(component: InfraComponent, baseTagExpression = "local.tags"): string {
  const tags: Record<string, string> = {};
  const dataClassification = component.config.dataClassification;
  const costAllocationTag = component.config.costAllocationTag;

  if (typeof dataClassification === "string" && dataClassification) {
    tags.DataClassification = dataClassification;
  }

  if (typeof costAllocationTag === "string" && costAllocationTag) {
    tags.CostAllocation = costAllocationTag;
  }

  if (Object.keys(tags).length === 0) {
    return baseTagExpression;
  }

  return `merge(${baseTagExpression}, ${toHclValue(tags, 2)})`;
}

function optionalConfig(component: InfraComponent): Record<string, unknown> {
  return {
    encryption_enabled: component.config.enableEncryption,
    backup_retention_days: component.config.backupRetentionDays,
    deletion_protection: component.config.deletionProtection,
    monitoring_enabled: component.config.enableMonitoring,
    audit_logs_enabled: component.config.enableAuditLogs,
    maintenance_window: component.config.maintenanceWindow,
    private_dns_enabled: component.config.privateDns,
    autoscaling_enabled: component.config.autoscaling,
    min_capacity: component.config.minCapacity,
    max_capacity: component.config.maxCapacity,
    data_classification: component.config.dataClassification,
    cost_allocation_tag: component.config.costAllocationTag
  };
}

function alignRegistryModuleInputs(project: ProjectState, component: InfraComponent, body: Record<string, unknown>): Record<string, unknown> {
  const mapping = getModuleMapping(component.type, project.provider);

  if (!mapping || mapping.moduleSource.startsWith("./") || !mapping.moduleSource.startsWith("claranet/")) {
    return body;
  }

  const allowedInputs = new Set(["source", "version", ...mapping.requiredInputs, ...mapping.optionalInputs]);

  return Object.fromEntries(Object.entries(body).filter(([key]) => allowedInputs.has(key)));
}

function componentModuleBody(project: ProjectState, component: InfraComponent): Record<string, unknown> {
  const mapping = getModuleMapping(component.type, project.provider);
  const base = {
    source: mapping ? mapping.moduleSource : `./modules/${component.type}`,
    ...(mapping && !mapping.moduleSource.startsWith("./") ? { version: mapping.version } : {})
  };

  if (project.provider === "azure") {
    return alignRegistryModuleInputs(project, component, azureModuleBody(project, component, base));
  }

  if (project.provider === "gcp") {
    return gcpModuleBody(project, component, base);
  }

  return alignRegistryModuleInputs(project, component, awsModuleBody(project, component, base));
}

function awsModuleBody(project: ProjectState, component: InfraComponent, base: Record<string, unknown>): Record<string, unknown> {
  switch (component.type) {
    case "vpc":
      return {
        ...base,
        name: "${local.name_prefix}-network",
        cidr: component.config.cidr,
        az_count: component.config.azCount,
        enable_nat_gateway: component.config.enableNatGateway,
        public_subnet_tags: { Tier: "public" },
        private_subnet_tags: { Tier: "private" },
        database_subnet_tags: { Tier: "database" },
        tags: componentTags(component)
      };
    case "security-group":
      return {
        ...base,
        name: "${local.name_prefix}-baseline",
        vpc_id: moduleRef(project, "vpc", "vpc_id"),
        ingress_cidr_blocks: component.config.allowedCidrBlocks,
        enable_ssh: component.config.enableSsh,
        egress_rules: ["all-all"],
        tags: componentTags(component)
      };
    case "eks":
      return {
        ...base,
        cluster_name: "${local.name_prefix}-eks",
        cluster_version: component.config.clusterVersion,
        vpc_id: moduleRef(project, "vpc", "vpc_id"),
        subnet_ids: moduleRef(project, "vpc", "private_subnets"),
        cluster_endpoint_private_access: component.config.privateEndpoint,
        cluster_enabled_log_types: component.config.enableAuditLogs ? ["api", "audit", "authenticator", "controllerManager", "scheduler"] : [],
        cluster_log_retention_in_days: component.config.backupRetentionDays,
        node_groups: {
          default: {
            instance_types: [component.config.nodeInstanceType],
            min_size: component.config.minNodes,
            max_size: component.config.maxNodes,
            desired_size: component.config.minNodes,
            autoscaling_enabled: component.config.autoscaling ?? true
          }
        },
        tags: componentTags(component)
      };
    case "rds":
      return {
        ...base,
        identifier: "${local.name_prefix}-postgres",
        engine: "postgres",
        engine_version: component.config.engineVersion,
        instance_class: component.config.instanceClass,
        allocated_storage: component.config.allocatedStorage,
        multi_az: component.config.multiAz,
        subnet_ids: moduleRef(project, "vpc", "database_subnets"),
        vpc_security_group_ids: [moduleRef(project, "security-group", "security_group_id")],
        storage_encrypted: component.config.enableEncryption ?? true,
        deletion_protection: component.config.deletionProtection || project.environment === "prod",
        backup_retention_period: component.config.backupRetentionDays,
        maintenance_window: component.config.maintenanceWindow,
        tags: componentTags(component)
      };
    case "redis":
      return {
        ...base,
        name: "${local.name_prefix}-redis",
        node_type: component.config.nodeType,
        replicas_per_node_group: component.config.replicas,
        transit_encryption_enabled: component.config.transitEncryption,
        subnet_ids: moduleRef(project, "vpc", "private_subnets"),
        security_group_ids: [moduleRef(project, "security-group", "security_group_id")],
        snapshot_retention_limit: component.config.backupRetentionDays,
        maintenance_window: component.config.maintenanceWindow,
        tags: componentTags(component)
      };
    case "alb":
      return {
        ...base,
        name: "${local.name_prefix}-alb",
        vpc_id: moduleRef(project, "vpc", "vpc_id"),
        subnets: moduleRef(project, "vpc", "public_subnets"),
        certificate_arn: component.config.certificateArn || "var.acm_certificate_arn",
        enable_waf: component.config.enableWaf,
        domain_name: component.config.domainName,
        access_logs_enabled: component.config.enableAuditLogs,
        deletion_protection_enabled: component.config.deletionProtection,
        tags: componentTags(component)
      };
    default:
      return {
        ...base,
        name: `\${local.name_prefix}-${sanitizeName(component.name)}`,
        region: "var.aws_region",
        sku: component.config.sku,
        capacity: component.config.replicas,
        public_access_enabled: component.config.publicAccess,
        private_connectivity_enabled: component.config.privateEndpoint,
        placement_mode: component.config.zoneMode,
        vpc_id: moduleRef(project, "vpc", "vpc_id"),
        subnet_ids: moduleRef(project, "vpc", "private_subnets"),
        security_group_ids: [moduleRef(project, "security-group", "security_group_id")],
        kms_key_id: "try(module.kms_key_platform.id, null)",
        optional_config: optionalConfig(component),
        tags: componentTags(component)
      };
  }
}

function azureBase(project: ProjectState): Record<string, unknown> {
  return {
    client_name: project.owner,
    environment: project.environment,
    location: "azurerm_resource_group.main.location",
    location_short: locationShort(project),
    resource_group_name: "azurerm_resource_group.main.name",
    stack: project.name
  };
}

function azureModuleBody(project: ProjectState, component: InfraComponent, base: Record<string, unknown>): Record<string, unknown> {
  const common = azureBase(project);

  switch (component.type) {
    case "vpc":
      return {
        ...base,
        ...common,
        vnet_cidr: [component.config.cidr],
        extra_tags: componentTags(component),
        subnets: {
          aks: { cidrs: [`${String(component.config.cidr).split(".").slice(0, 2).join(".")}.16.0/20`] },
          appgw: { cidrs: [`${String(component.config.cidr).split(".").slice(0, 2).join(".")}.32.0/24`] },
          data: { cidrs: [`${String(component.config.cidr).split(".").slice(0, 2).join(".")}.48.0/24`] }
        }
      };
    case "security-group":
      return {
        ...base,
        ...common,
        ssh_inbound_allowed: component.config.enableSsh,
        source_address_prefixes: component.config.allowedCidrBlocks,
        deny_all_inbound: true,
        extra_tags: componentTags(component)
      };
    case "eks":
      return {
        ...base,
        ...common,
        kubernetes_version: component.config.clusterVersion,
        private_cluster_enabled: component.config.privateEndpoint,
        node_pools: {
          system: {
            vm_size: component.config.nodeInstanceType,
            min_count: component.config.minNodes,
            max_count: component.config.maxNodes,
            enable_auto_scaling: component.config.autoscaling ?? true
          }
        },
        vnet_subnet_id: moduleRef(project, "vpc", "subnets_ids[\"aks\"]"),
        extra_tags: componentTags(component)
      };
    case "rds":
      return {
        ...base,
        ...common,
        administrator_login: "tfadmin",
        administrator_password: "var.sensitive_database_password",
        allowed_cidrs: { private: component.config.allowedCidrBlocks ?? ["10.0.0.0/8"] },
        postgresql_version: Number(component.config.engineVersion),
        size: component.config.instanceClass,
        storage_mb: Number(component.config.allocatedStorage) * 1024,
        delegated_subnet_id: moduleRef(project, "vpc", "subnets_ids[\"data\"]"),
        public_network_access_enabled: false,
        standby_zone: component.config.multiAz ? 2 : null,
        backup_retention_days: component.config.backupRetentionDays,
        maintenance_window: component.config.maintenanceWindow,
        extra_tags: componentTags(component)
      };
    case "redis":
      return {
        ...base,
        ...common,
        sku_name: component.config.nodeType,
        capacity: component.config.replicas,
        minimum_tls_version: component.config.transitEncryption ? "1.2" : "1.0",
        subnet_id: moduleRef(project, "vpc", "subnets_ids[\"data\"]"),
        extra_tags: componentTags(component)
      };
    case "alb":
      return {
        ...base,
        ...common,
        subnet_id: moduleRef(project, "vpc", "subnets_ids[\"appgw\"]"),
        certificate_secret_id: component.config.certificateArn || "var.edge_certificate_id",
        waf_configuration: {
          enabled: component.config.enableWaf,
          firewall_mode: "Prevention",
          rule_set_type: "OWASP",
          rule_set_version: "3.2"
        },
        backend_fqdn: component.config.domainName,
        extra_tags: componentTags(component)
      };
    default:
      return {
        ...base,
        ...common,
        name: `\${local.name_prefix}-${sanitizeName(component.name)}`,
        sku: component.config.sku,
        capacity: component.config.replicas,
        public_network_access_enabled: component.config.publicAccess,
        private_endpoint_enabled: component.config.privateEndpoint,
        zone_mode: component.config.zoneMode,
        subnet_id: moduleRef(project, "vpc", "subnets_ids[\"data\"]"),
        diagnostic_settings: {
          enabled: true,
          log_analytics_workspace_id: "try(module.log_analytics_observability.id, null)"
        },
        optional_config: optionalConfig(component)
      };
  }
}

function gcpProjectId(project: ProjectState): string {
  return `${sanitizeName(project.name)}-${project.environment}`;
}

function gcpModuleBody(project: ProjectState, component: InfraComponent, base: Record<string, unknown>): Record<string, unknown> {
  switch (component.type) {
    case "vpc":
      return {
        ...base,
        project_id: "var.gcp_project_id",
        network_name: "${local.name_prefix}-vpc",
        routing_mode: "GLOBAL",
        subnets: [
          {
            subnet_name: "${local.name_prefix}-primary",
            subnet_ip: component.config.cidr,
            subnet_region: project.region,
            subnet_private_access: true
          }
        ],
        routes: component.config.enableNatGateway
          ? [
              {
                name: "${local.name_prefix}-egress",
                description: "Default egress route for private workloads",
                destination_range: "0.0.0.0/0",
                next_hop_internet: true
              }
            ]
          : []
      };
    case "security-group":
      return {
        ...base,
        project_id: "var.gcp_project_id",
        network_name: moduleRef(project, "vpc", "network_name"),
        rules: [
          {
            name: "${local.name_prefix}-allow-https",
            description: "Allow HTTPS from approved source ranges",
            direction: "INGRESS",
            priority: 1000,
            ranges: component.config.allowedCidrBlocks,
            allow: [{ protocol: "tcp", ports: ["443"] }]
          },
          {
            name: "${local.name_prefix}-allow-ssh-iap",
            description: "Optional SSH ingress, prefer IAP",
            direction: "INGRESS",
            priority: 1100,
            ranges: component.config.enableSsh ? ["35.235.240.0/20"] : [],
            allow: [{ protocol: "tcp", ports: ["22"] }]
          }
        ]
      };
    case "eks":
      return {
        ...base,
        project_id: "var.gcp_project_id",
        name: "${local.name_prefix}-gke",
        region: project.region,
        network: moduleRef(project, "vpc", "network_name"),
        subnetwork: moduleRef(project, "vpc", "subnets_names[0]"),
        release_channel: component.config.clusterVersion,
        enable_private_nodes: component.config.privateEndpoint,
        remove_default_node_pool: true,
        node_pools: [
          {
            name: "default",
            machine_type: component.config.nodeInstanceType,
            min_count: component.config.minNodes,
            max_count: component.config.maxNodes,
            auto_repair: true,
            auto_upgrade: true
          }
        ]
      };
    case "rds":
      return {
        ...base,
        project_id: "var.gcp_project_id",
        name: "${local.name_prefix}-postgres",
        database_version: component.config.engineVersion,
        region: project.region,
        tier: component.config.instanceClass,
        disk_size: component.config.allocatedStorage,
        availability_type: component.config.multiAz ? "REGIONAL" : "ZONAL",
        deletion_protection: project.environment === "prod",
        backup_configuration: {
          enabled: Number(component.config.backupRetentionDays ?? 0) > 0,
          retained_backups: component.config.backupRetentionDays
        },
        ip_configuration: {
          ipv4_enabled: false,
          private_network: moduleRef(project, "vpc", "network_self_link")
        }
      };
    case "redis":
      return {
        ...base,
        project_id: "var.gcp_project_id",
        name: "${local.name_prefix}-redis",
        region: project.region,
        tier: component.config.nodeType,
        memory_size_gb: component.config.replicas,
        transit_encryption_mode: component.config.transitEncryption ? "SERVER_AUTHENTICATION" : "DISABLED",
        authorized_network: moduleRef(project, "vpc", "network_id")
      };
    case "alb":
      return {
        ...base,
        project: "var.gcp_project_id",
        name: "${local.name_prefix}-https-lb",
        ssl: true,
        managed_ssl_certificate_domains: [component.config.domainName],
        create_address: true,
        security_policy: component.config.enableWaf ? "google_compute_security_policy.edge.id" : null,
        certificate_map: component.config.certificateArn || null,
        backends: {
          default: {
            protocol: "HTTP",
            port: 80,
            health_check: { request_path: "/" }
          }
        }
      };
    default:
      return base;
  }
}

function generateMain(project: ProjectState): string {
  const locals = `locals {
  name_prefix = "${sanitizeName(project.name)}-${project.environment}"
  provider    = "${project.provider}"
  tags = ${toHclValue(commonTags(project), 2)}
}`;

  const providerBootstrap =
    project.provider === "azure"
      ? `resource "azurerm_resource_group" "main" {
  name     = "\${local.name_prefix}-rg"
  location = var.location
  tags     = local.tags
}`
      : "";

  const modules = enabledComponents(project)
    .map((component) => block("module", [moduleName(component)], componentModuleBody(project, component)))
    .join("\n\n");

  return [locals, providerBootstrap, modules].filter(Boolean).join("\n\n") + "\n";
}

function generateVariables(project: ProjectState): string {
  const variables = [
    `variable "${project.provider === "aws" ? "aws_region" : "location"}" {
  description = "${project.provider === "aws" ? "AWS region" : "Cloud location or region"} for all provisioned infrastructure."
  type        = string
  default     = "${project.region}"
}`,
    `variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "${project.environment}"
}`,
    ...(project.provider === "gcp"
      ? [
          `variable "gcp_project_id" {
  description = "Google Cloud project ID."
  type        = string
  default     = "${gcpProjectId(project)}"
}`
        ]
      : []),
    `variable "${project.provider === "azure" ? "edge_certificate_id" : "acm_certificate_arn"}" {
  description = "Existing public edge certificate reference used by load balancers."
  type        = string
  default     = ""
}`,
    `variable "sensitive_database_password" {
  description = "Database password. Set with TF_VAR_sensitive_database_password or a secrets manager."
  type        = string
  sensitive   = true
}`
  ];

  return `${variables.join("\n\n")}\n`;
}

function generateOutputs(project: ProjectState): string {
  const outputs: string[] = [];
  const components = enabledComponents(project);
  const byType = (type: InfraComponent["type"]) => components.find((component) => component.type === type);

  const vpc = byType("vpc");
  if (vpc) {
    const vpcValue =
      project.provider === "azure"
        ? `module.${moduleName(vpc)}.vnet_id`
        : project.provider === "gcp"
          ? `module.${moduleName(vpc)}.network_id`
          : `module.${moduleName(vpc)}.vpc_id`;
    outputs.push(`output "vpc_id" {
  description = "Created network ID."
  value       = ${vpcValue}
}`);
  }

  const eks = byType("eks");
  if (eks) {
    const clusterValue =
      project.provider === "azure"
        ? `module.${moduleName(eks)}.name`
        : project.provider === "gcp"
          ? `module.${moduleName(eks)}.name`
          : `module.${moduleName(eks)}.cluster_name`;
    outputs.push(`output "eks_cluster_name" {
  description = "Kubernetes cluster name."
  value       = ${clusterValue}
}`);
  }

  const rds = byType("rds");
  if (rds) {
    const dbValue =
      project.provider === "azure"
        ? `module.${moduleName(rds)}.id`
        : project.provider === "gcp"
          ? `module.${moduleName(rds)}.instance_connection_name`
          : `module.${moduleName(rds)}.db_instance_endpoint`;
    outputs.push(`output "postgres_endpoint" {
  description = "PostgreSQL endpoint or connection identifier."
  value       = ${dbValue}
  sensitive   = true
}`);
  }

  return `${outputs.join("\n\n")}\n`;
}

function generateProviders(project: ProjectState): string {
  if (project.provider === "azure") {
    return `provider "azurerm" {
  features {}
}
`;
  }

  if (project.provider === "gcp") {
    return `provider "google" {
  project = var.gcp_project_id
  region  = var.location
}
`;
  }

  return `provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.tags
  }
}
`;
}

function generateVersions(project: ProjectState): string {
  const backend =
    project.provider === "azure"
      ? `backend "azurerm" {
    resource_group_name  = "${project.remoteStateBucket}-rg"
    storage_account_name = "${project.remoteStateBucket}"
    container_name       = "tfstate"
    key                  = "${project.name}/${project.environment}/terraform.tfstate"
  }`
      : project.provider === "gcp"
        ? `backend "gcs" {
    bucket = "${project.remoteStateBucket}"
    prefix = "${project.name}/${project.environment}"
  }`
        : `backend "s3" {
    bucket         = "${project.remoteStateBucket}"
    key            = "${project.name}/${project.environment}/terraform.tfstate"
    region         = "${project.region}"
    encrypt        = true
    dynamodb_table = "${project.remoteStateBucket}-lock"
  }`;

  const providers =
    project.provider === "azure"
      ? `azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azurecaf = {
      source  = "claranet/azurecaf"
      version = "~> 1.2"
    }`
      : project.provider === "gcp"
        ? `google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.0"
    }`
        : `aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }`;

  return `terraform {
  required_version = ">= 1.8.0"

  ${backend}

  required_providers {
    ${providers}
  }
}
`;
}

function generateTfvars(project: ProjectState): string {
  if (project.provider === "gcp") {
    return `location             = "${project.region}"
gcp_project_id       = "${gcpProjectId(project)}"
environment         = "${project.environment}"
acm_certificate_arn = ""
# sensitive_database_password should be supplied through a secret manager or TF_VAR_sensitive_database_password.
`;
  }

  if (project.provider === "azure") {
    return `location              = "${project.region}"
environment           = "${project.environment}"
edge_certificate_id   = ""
# sensitive_database_password should be supplied through a secret manager or TF_VAR_sensitive_database_password.
`;
  }

  return `aws_region          = "${project.region}"
environment         = "${project.environment}"
acm_certificate_arn = ""
# sensitive_database_password should be supplied through a secret manager or TF_VAR_sensitive_database_password.
`;
}

function generateReadme(project: ProjectState): string {
  const modules = enabledComponents(project)
    .map((component) => {
      const mapping = getModuleMapping(component.type, project.provider);
      return `- ${component.name}: ${mapping?.moduleSource ?? component.type}`;
    })
    .join("\n");

  return `# ${project.name}

Generated by TerraFactory for the ${project.environment} environment.

## Modules

${modules}

## Commands

\`\`\`bash
terraform init
terraform validate
terraform plan -var-file=terraform.tfvars
\`\`\`
`;
}

function generateLocalModuleFiles(project: ProjectState): GeneratedFile[] {
  if (project.provider !== "azure" && project.provider !== "aws") {
    return [];
  }

  return enabledComponents(project).flatMap((component) => {
    const mapping = getModuleMapping(component.type, project.provider);
    const localPrefix = `./modules/${project.provider}-`;
    if (!mapping?.moduleSource.startsWith(localPrefix)) {
      return [];
    }

    const moduleDir = `terraform-project/modules/${project.provider}-${component.type}`;
    const cloudLabel = project.provider === "aws" ? "AWS" : "Azure";
    const providerSpecificVariables =
      project.provider === "aws"
        ? `variable "region" {
  description = "AWS region."
  type        = string
}

variable "public_access_enabled" {
  description = "Whether public access is enabled."
  type        = bool
  default     = false
}

variable "private_connectivity_enabled" {
  description = "Whether VPC/private connectivity should be enabled."
  type        = bool
  default     = true
}

variable "placement_mode" {
  description = "Regional, multi-AZ, or global placement mode."
  type        = string
  default     = "regional"
}

variable "vpc_id" {
  description = "Optional VPC ID."
  type        = string
  default     = null
}

variable "subnet_ids" {
  description = "Optional subnet IDs."
  type        = any
  default     = []
}

variable "security_group_ids" {
  description = "Optional security group IDs."
  type        = list(string)
  default     = []
}

variable "kms_key_id" {
  description = "Optional KMS key ID."
  type        = string
  default     = null
}
`
        : `variable "location" {
  description = "Azure region."
  type        = string
}

variable "public_network_access_enabled" {
  description = "Whether public network access is enabled."
  type        = bool
  default     = false
}

variable "private_endpoint_enabled" {
  description = "Whether private endpoint wiring should be enabled."
  type        = bool
  default     = true
}

variable "zone_mode" {
  description = "Regional, zonal, or global placement mode."
  type        = string
  default     = "regional"
}

variable "subnet_id" {
  description = "Optional subnet ID for private endpoint or delegated service placement."
  type        = string
  default     = null
}

variable "diagnostic_settings" {
  description = "Diagnostic settings configuration."
  type        = any
  default     = {}
}
`;

    return [
      {
        path: `${moduleDir}/variables.tf`,
        language: "hcl" as const,
        content: `variable "name" {
  description = "Resource name."
  type        = string
}

variable "resource_group_name" {
  description = "Resource group name when the target cloud uses one."
  type        = string
  default     = null
}

variable "sku" {
  description = "Service SKU or tier."
  type        = string
}

variable "capacity" {
  description = "Service capacity setting."
  type        = number
}

variable "optional_config" {
  description = "Advanced optional production configuration emitted by TerraFactory."
  type        = any
  default     = {}
}

variable "tags" {
  description = "Common tags."
  type        = map(string)
  default     = {}
}

${providerSpecificVariables}
`
      },
      {
        path: `${moduleDir}/main.tf`,
        language: "hcl" as const,
        content: `# Local template for ${component.type}.
# Replace this placeholder with a hardened ${project.provider} provider implementation or a selected registry module.
# TerraFactory emits this module so generated projects remain structurally complete.

locals {
  module_name = var.name
  service     = "${component.type}"
  cloud        = "${cloudLabel}"
}
`
      },
      {
        path: `${moduleDir}/outputs.tf`,
        language: "hcl" as const,
        content: `output "id" {
  description = "Placeholder module ID. Replace once the concrete Azure resource is implemented."
  value       = local.module_name
}

output "name" {
  description = "Module resource name."
  value       = local.module_name
}
`
      }
    ];
  });
}

export function generateTerraformProject(project: ProjectState): GeneratedFile[] {
  return [
    { path: "terraform-project/versions.tf", language: "hcl", content: generateVersions(project) },
    { path: "terraform-project/providers.tf", language: "hcl", content: generateProviders(project) },
    { path: "terraform-project/main.tf", language: "hcl", content: generateMain(project) },
    { path: "terraform-project/variables.tf", language: "hcl", content: generateVariables(project) },
    { path: "terraform-project/outputs.tf", language: "hcl", content: generateOutputs(project) },
    { path: "terraform-project/terraform.tfvars", language: "hcl", content: generateTfvars(project) },
    { path: "terraform-project/README.md", language: "markdown", content: generateReadme(project) },
    ...generateLocalModuleFiles(project)
  ];
}
