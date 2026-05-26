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
      value.startsWith("jsonencode(") ||
      value.startsWith("merge(") ||
      value.startsWith("try(") ||
      value.startsWith("values("))
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

function moduleTypeLabel(project: ProjectState, component: InfraComponent): string {
  if (project.provider === "azure") {
    const azureLabels: Partial<Record<InfraComponent["type"], string>> = {
      "security-group": "nsg",
      alb: "application_gateway",
      eks: "aks",
      rds: "postgresql",
      vpc: "vnet"
    };

    return azureLabels[component.type] ?? component.type.replaceAll("-", "_");
  }

  if (project.provider === "gcp") {
    const gcpLabels: Partial<Record<InfraComponent["type"], string>> = {
      "security-group": "firewall",
      alb: "https_lb",
      eks: "gke",
      rds: "cloud_sql"
    };

    return gcpLabels[component.type] ?? component.type.replaceAll("-", "_");
  }

  return component.type.replaceAll("-", "_");
}

function moduleName(project: ProjectState, component: InfraComponent): string {
  const componentName = component.type === "rds" && sanitizeName(component.name) === "rds" ? "postgres" : component.name;
  return `${moduleTypeLabel(project, component)}_${sanitizeName(componentName).replaceAll("-", "_")}`;
}

function moduleRef(project: ProjectState, type: InfraComponent["type"], output: string): string {
  const component = enabledComponents(project).find((item) => item.type === type);
  return component ? `module.${moduleName(project, component)}.${output}` : `module.${type.replace("-", "_")}.${output}`;
}

function awsVpcId(project: ProjectState): string {
  return moduleRef(project, "vpc", "vpc_attributes.id");
}

function awsPrivateSubnetIds(project: ProjectState): string {
  return `values(${moduleRef(project, "vpc", "private_subnet_attributes_by_az")})[*].id`;
}

function awsPublicSubnetIds(project: ProjectState): string {
  return `values(${moduleRef(project, "vpc", "public_subnet_attributes_by_az")})[*].id`;
}

function awsSecurityGroupId(project: ProjectState): string {
  return moduleRef(project, "security-group", "id");
}

function awsVpcFlowLogs(component: InfraComponent): Record<string, unknown> {
  if (!component.config.enableAuditLogs && !component.config.enableMonitoring) {
    return { log_destination_type: "none" };
  }

  return {
    log_destination_type: "cloudwatch",
    retention_in_days: component.config.backupRetentionDays ?? 30,
    tags: componentTags(component, "{}")
  };
}

function awsEndpointShortName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return "s3";
  }

  const parts = value.trim().split(".");
  return parts[parts.length - 1] || value.trim();
}

function awsAuroraModuleBody(project: ProjectState, component: InfraComponent, base: Record<string, unknown>): Record<string, unknown> {
  return {
    ...base,
    name: `\${local.name_prefix}-${sanitizeName(component.name)}`,
    identifier: `\${local.name_prefix}-${sanitizeName(component.name)}`,
    region: "var.aws_region",
    sec_region: "var.aws_secondary_region",
    private_subnet_ids_p: awsPrivateSubnetIds(project),
    private_subnet_ids_s: "var.aws_secondary_private_subnet_ids",
    password: "var.sensitive_database_password",
    engine: "aurora-postgresql",
    engine_version_pg: component.config.engineVersion,
    database_name: sanitizeName(project.name).replaceAll("-", "_"),
    instance_class: component.config.instanceClass,
    username: "tfadmin",
    primary_instance_count: component.config.minCapacity ?? component.config.replicas ?? (component.config.multiAz ? 2 : 1),
    secondary_instance_count: 0,
    tags: componentTags(component)
  };
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
  const optionalTagKeys: Record<string, string> = {
    enableEncryption: "EncryptionEnabled",
    backupRetentionDays: "BackupRetentionDays",
    deletionProtection: "DeletionProtectionRequested",
    enableMonitoring: "MonitoringEnabled",
    enableAuditLogs: "AuditLogsEnabled",
    maintenanceWindow: "MaintenanceWindow",
    privateDns: "PrivateDnsRequested",
    autoscaling: "AutoscalingEnabled",
    minCapacity: "MinCapacity",
    maxCapacity: "MaxCapacity"
  };

  if (typeof dataClassification === "string" && dataClassification) {
    tags.DataClassification = dataClassification;
  }

  if (typeof costAllocationTag === "string" && costAllocationTag) {
    tags.CostAllocation = costAllocationTag;
  }

  for (const [configKey, tagKey] of Object.entries(optionalTagKeys)) {
    const value = component.config[configKey];
    if (value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0)) {
      tags[tagKey] = String(value);
    }
  }

  if (Object.keys(tags).length === 0) {
    return baseTagExpression;
  }

  return `merge(${baseTagExpression}, ${toHclValue(tags, 2)})`;
}

function azureDiagnostics(component: InfraComponent): Record<string, unknown> {
  const diagnosticsEnabled = Boolean(component.config.enableMonitoring || component.config.enableAuditLogs);

  if (!diagnosticsEnabled) {
    return {};
  }

  return {
    logs_destinations_ids: "var.azure_diagnostic_destination_ids"
  };
}

function azureFlowLogs(component: InfraComponent): Record<string, unknown> {
  if (!component.config.enableAuditLogs && !component.config.enableMonitoring) {
    return {};
  }

  return {
    flow_log_enabled: true,
    flow_log_storage_account_id: "var.azure_flow_log_storage_account_id",
    log_analytics_workspace_id: "var.azure_log_analytics_workspace_id",
    log_analytics_workspace_guid: "var.azure_log_analytics_workspace_guid",
    flow_log_retention_policy_days: component.config.backupRetentionDays
  };
}

function azureMaintenanceWindow(value: unknown): Record<string, number> | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const dayMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6
  };
  const match = value.trim().match(/^(sun|mon|tue|wed|thu|fri|sat)\w*\s+(\d{1,2})(?::(\d{2}))?/i);

  if (!match) {
    return undefined;
  }

  return {
    day_of_week: dayMap[match[1].slice(0, 3).toLowerCase()],
    start_hour: Number(match[2]),
    start_minute: Number(match[3] ?? 0)
  };
}

function azureZoneList(component: InfraComponent): number[] | undefined {
  return component.config.zoneMode === "zonal" ? [1] : component.config.zoneMode === "regional" ? [1, 2, 3] : undefined;
}

function gcpLabels(component: InfraComponent): Record<string, string> {
  const labels: Record<string, string> = {};
  const labelKeys: Record<string, string> = {
    dataClassification: "data_classification",
    costAllocationTag: "cost_allocation",
    enableEncryption: "encryption_enabled",
    backupRetentionDays: "backup_retention_days",
    deletionProtection: "deletion_protection_requested",
    enableMonitoring: "monitoring_enabled",
    enableAuditLogs: "audit_logs_enabled",
    maintenanceWindow: "maintenance_window",
    privateDns: "private_dns_requested",
    autoscaling: "autoscaling_enabled",
    minCapacity: "min_capacity",
    maxCapacity: "max_capacity"
  };

  for (const [configKey, labelKey] of Object.entries(labelKeys)) {
    const value = component.config[configKey];
    if (value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0)) {
      labels[labelKey] = String(value).toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 63);
    }
  }

  return labels;
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

  if (!mapping || mapping.moduleSource.startsWith("./")) {
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
  const mapping = getModuleMapping(component.type, project.provider);

  switch (component.type) {
    case "vpc":
      return {
        ...base,
        name: "${local.name_prefix}-network",
        cidr_block: component.config.cidr,
        az_count: component.config.azCount,
        subnets: {
          public: {
            netmask: 24,
            nat_gateway_configuration: component.config.enableNatGateway ? "single_az" : "none",
            tags: { Tier: "public" }
          },
          private: {
            netmask: 24,
            connect_to_public_natgw: component.config.enableNatGateway,
            tags: { Tier: "private" }
          }
        },
        vpc_flow_logs: awsVpcFlowLogs(component),
        tags: componentTags(component)
      };
    case "security-group":
      return {
        ...base,
        name: "${local.name_prefix}-baseline",
        vpc_id: awsVpcId(project),
        ingress_cidr_blocks: component.config.allowedCidrBlocks,
        enable_ssh: component.config.enableSsh,
        egress_rules: ["all-all"],
        tags: componentTags(component)
      };
    case "eks":
      return {
        ...base,
        cluster_name: "var.aws_eks_cluster_name",
        cluster_endpoint: "var.aws_eks_cluster_endpoint",
        cluster_version: component.config.clusterVersion,
        oidc_provider_arn: "var.aws_eks_oidc_provider_arn",
        enable_metrics_server: true,
        enable_cluster_autoscaler: component.config.autoscaling ?? true,
        enable_aws_load_balancer_controller: true,
        enable_aws_cloudwatch_metrics: component.config.enableMonitoring,
        enable_aws_for_fluentbit: component.config.enableAuditLogs,
        eks_addons: {
          coredns: {},
          kube_proxy: {},
          vpc_cni: {
            most_recent: true
          }
        },
        tags: componentTags(component)
      };
    case "rds":
      if (mapping?.moduleSource === "aws-ia/rds-aurora/aws") {
        return awsAuroraModuleBody(project, component, base);
      }

      return {
        ...base,
        identifier: "${local.name_prefix}-postgres",
        engine: "postgres",
        engine_version: component.config.engineVersion,
        instance_class: component.config.instanceClass,
        allocated_storage: component.config.allocatedStorage,
        multi_az: component.config.multiAz,
        subnet_ids: awsPrivateSubnetIds(project),
        vpc_security_group_ids: [awsSecurityGroupId(project)],
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
        subnet_ids: awsPrivateSubnetIds(project),
        security_group_ids: [awsSecurityGroupId(project)],
        snapshot_retention_limit: component.config.backupRetentionDays,
        maintenance_window: component.config.maintenanceWindow,
        tags: componentTags(component)
      };
    case "alb":
      return {
        ...base,
        name: "${local.name_prefix}-alb",
        vpc_id: awsVpcId(project),
        subnets: awsPublicSubnetIds(project),
        certificate_arn: component.config.certificateArn || "var.acm_certificate_arn",
        enable_waf: component.config.enableWaf,
        domain_name: component.config.domainName,
        access_logs_enabled: component.config.enableAuditLogs,
        deletion_protection_enabled: component.config.deletionProtection,
        tags: componentTags(component)
      };
    default:
      if (mapping?.moduleSource === "aws-ia/rds-aurora/aws") {
        return awsAuroraModuleBody(project, component, base);
      }

      if (!mapping || mapping.moduleSource.startsWith("./")) {
        return {
          ...base,
          name: `\${local.name_prefix}-${sanitizeName(component.name)}`,
          region: "var.aws_region",
          sku: component.config.sku,
          capacity: component.config.replicas,
          public_access_enabled: component.config.publicAccess,
          private_connectivity_enabled: component.config.privateEndpoint,
          placement_mode: component.config.zoneMode,
          vpc_id: awsVpcId(project),
          subnet_ids: awsPrivateSubnetIds(project),
          security_group_ids: [awsSecurityGroupId(project)],
          kms_key_id: "var.aws_kms_key_id",
          optional_config: optionalConfig(component),
          tags: componentTags(component)
        };
      }

      return {
        ...base,
        name: `\${local.name_prefix}-${sanitizeName(component.name)}`,
        name_prefix: "${local.name_prefix}",
        region: "var.aws_region",
        sku: component.config.sku,
        capacity: component.config.replicas,
        public_access_enabled: component.config.publicAccess,
        private_connectivity_enabled: component.config.privateEndpoint,
        placement_mode: component.config.zoneMode,
        vpc_id: awsVpcId(project),
        subnet_ids: awsPrivateSubnetIds(project),
        vpc_subnet_ids: awsPrivateSubnetIds(project),
        security_group_ids: [awsSecurityGroupId(project)],
        kms_key_id: "var.aws_kms_key_id",
        aws_service_principal: "logs.amazonaws.com",
        retention_in_days: component.config.backupRetentionDays,
        launch_template_id: "var.aws_launch_template_id",
        launch_configuration: "var.aws_launch_configuration_name",
        asg_max_size: component.config.maxCapacity ?? component.config.replicas,
        create_service_role: true,
        image_url: component.config.containerImage,
        service_name: sanitizeName(component.name),
        project_name: sanitizeName(component.name),
        app_name: sanitizeName(component.name),
        endpoint_name: sanitizeName(component.name),
        server_name: sanitizeName(component.name),
        instance_alias: sanitizeName(component.name),
        domain_name: component.config.domainName,
        endpoint_type: component.config.privateEndpoint ? "VPC" : "PUBLIC",
        domain: "S3",
        enable_logging: component.config.enableAuditLogs,
        log_retention_days: component.config.backupRetentionDays,
        private_dns_enabled: component.config.privateDns ?? true,
        enabled_gateway_endpoints: ["s3", "dynamodb"].includes(awsEndpointShortName(component.config.serviceName)) ? [awsEndpointShortName(component.config.serviceName)] : [],
        enabled_interface_endpoints: ["s3", "dynamodb"].includes(awsEndpointShortName(component.config.serviceName)) ? [] : [awsEndpointShortName(component.config.serviceName)],
        specified_regions: ["var.aws_region"],
        private_subnet_ids_p: awsPrivateSubnetIds(project),
        private_subnet_ids_s: "var.aws_secondary_private_subnet_ids",
        sec_region: "var.aws_secondary_region",
        password: "var.sensitive_database_password",
        database_name: sanitizeName(project.name).replaceAll("-", "_"),
        engine: "aurora-postgresql",
        engine_version_pg: component.config.engineVersion,
        identifier: `\${local.name_prefix}-${sanitizeName(component.name)}`,
        instance_class: component.config.instanceClass,
        username: "tfadmin",
        primary_instance_count: component.config.minCapacity ?? component.config.replicas,
        secondary_instance_count: 0,
        build_image: "aws/codebuild/standard:7.0",
        create_role_and_policy: true,
        app_tags: componentTags(component),
        allow_public_access_network_policy: component.config.publicAccess,
        resource_arn: "var.aws_shield_protected_resource_arn",
        protection_group_config: [
          {
            id: "${local.name_prefix}-shield",
            aggregation: "MAX",
            pattern: "ALL"
          }
        ],
        agent_name: sanitizeName(component.name),
        collection_name: sanitizeName(component.name),
        guardrail_name: sanitizeName(component.name),
        kb_name: sanitizeName(component.name),
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
        cidrs: [component.config.cidr],
        extra_tags: componentTags(component),
        ...azureFlowLogs(component)
      };
    case "security-group":
      return {
        ...base,
        ...common,
        ssh_inbound_allowed: component.config.enableSsh,
        ssh_source_allowed: component.config.allowedCidrBlocks,
        all_inbound_denied: true,
        extra_tags: componentTags(component),
        ...azureFlowLogs(component)
      };
    case "eks":
      return {
        ...base,
        ...common,
        kubernetes_version: component.config.clusterVersion,
        private_cluster_enabled: component.config.privateEndpoint,
        logs_kube_audit_enabled: component.config.enableAuditLogs,
        maintenance_window: typeof component.config.maintenanceWindow === "string" && component.config.maintenanceWindow
          ? { allowed: [{ day: component.config.maintenanceWindow.split(/\s+/)[0], hours: [Number(component.config.maintenanceWindow.match(/\d{1,2}/)?.[0] ?? 4)] }] }
          : undefined,
        node_pools: [
          {
            name: "system",
            vm_size: component.config.nodeInstanceType,
            min_count: component.config.minNodes,
            max_count: component.config.maxNodes,
            auto_scaling_enabled: component.config.autoscaling ?? true,
            tags: componentTags(component, "{}")
          }
        ],
        nodes_subnet: {
          name: "var.azure_aks_subnet_name",
          virtual_network_name: "var.azure_vnet_name",
          resource_group_name: "azurerm_resource_group.main.name"
        },
        extra_tags: componentTags(component),
        ...azureDiagnostics(component)
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
        delegated_subnet: { id: "var.azure_data_subnet_id" },
        public_network_access_enabled: false,
        high_availability: component.config.multiAz ? { mode: "ZoneRedundant", standby_availability_zone: 2 } : null,
        backup_retention_days: component.config.backupRetentionDays,
        maintenance_window: azureMaintenanceWindow(component.config.maintenanceWindow),
        extra_tags: componentTags(component),
        ...azureDiagnostics(component)
      };
    case "redis":
      return {
        ...base,
        ...common,
        sku_name: component.config.nodeType,
        capacity: component.config.replicas,
        minimum_tls_version: component.config.transitEncryption ? "1.2" : "1.0",
        subnet_id: "var.azure_data_subnet_id",
        extra_tags: componentTags(component),
        ...azureDiagnostics(component)
      };
    case "alb":
      return {
        ...base,
        ...common,
        sku: component.config.sku || (component.config.enableWaf ? "WAF_v2" : "Standard_v2"),
        zones: azureZoneList(component),
        sku_capacity: component.config.replicas,
        autoscale_configuration: component.config.autoscaling
          ? {
              min_capacity: component.config.minCapacity ?? 1,
              max_capacity: component.config.maxCapacity ?? 5
            }
          : undefined,
        create_subnet: false,
        subnet_id: "var.azure_app_gateway_subnet_id",
        firewall_policy_id: component.config.enableWaf ? "var.azure_waf_policy_id" : null,
        force_firewall_policy_association: component.config.enableWaf,
        ssl_certificates: component.config.certificateArn || "var.edge_certificate_id"
          ? [{ name: "edge", key_vault_secret_id: component.config.certificateArn || "var.edge_certificate_id" }]
          : [],
        backend_address_pools: [{ name: "default", fqdns: [component.config.domainName] }],
        backend_http_settings: [{ name: "default", port: 443, protocol: "Https" }],
        frontend_ports: [{ name: "https", port: 443 }],
        http_listeners: [{ name: "https", frontend_port_name: "https", protocol: "Https", ssl_certificate_name: "edge" }],
        request_routing_rules: [{ name: "default", http_listener_name: "https", backend_address_pool_name: "default", backend_http_settings_name: "default", priority: 100 }],
        app_gateway_tags: componentTags(component, "{}"),
        extra_tags: componentTags(component),
        ...azureDiagnostics(component),
        ...azureFlowLogs(component)
      };
    default:
      return {
        ...base,
        ...common,
        parent_id: "azurerm_resource_group.main.id",
        resource_group_id: "azurerm_resource_group.main.id",
        custom_name: `\${local.name_prefix}-${sanitizeName(component.name)}`,
        name: `\${local.name_prefix}-${sanitizeName(component.name)}`,
        logs_destinations_ids: "var.azure_diagnostic_destination_ids",
        os_type: "Linux",
        sku_name: component.config.sku,
        sku: component.type === "expressroute" ? { tier: "Standard", family: "MeteredData" } : component.config.sku,
        capacity: component.config.replicas,
        zone: component.config.zoneMode === "zonal" ? "1" : null,
        zones: azureZoneList(component),
        public_network_access_enabled: component.config.publicAccess,
        private_endpoint_enabled: component.config.privateEndpoint,
        zone_mode: component.config.zoneMode,
        subnet_id: "var.azure_data_subnet_id",
        subnet_ids: ["var.azure_data_subnet_id"],
        network_interfaces: {
          primary: {
            name: `\${local.name_prefix}-${sanitizeName(component.name)}-nic`,
            ip_configurations: {
              primary: {
                name: "primary",
                private_ip_subnet_resource_id: "var.azure_data_subnet_id",
                create_public_ip_address: component.config.publicAccess
              }
            }
          }
        },
        extension_protected_setting: {},
        user_data_base64: "",
        template: {
          min_replicas: component.config.autoscaling ? component.config.minCapacity ?? 1 : 1,
          max_replicas: component.config.autoscaling ? component.config.maxCapacity ?? component.config.replicas ?? 3 : component.config.replicas ?? 1,
          containers: [
            {
              name: sanitizeName(component.name) || "app",
              image: component.config.containerImage || "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest",
              cpu: 0.5,
              memory: "1Gi"
            }
          ]
        },
        container_app_environment_resource_id: "var.azure_container_app_environment_resource_id",
        virtual_network_name: "var.azure_vnet_name",
        subnet_bastion_cidr: "var.azure_bastion_subnet_cidr",
        subnet_cidr: "var.azure_firewall_subnet_cidr",
        target_resource: component.config.targetResourceId || "var.azure_private_endpoint_target_resource_id",
        administrator_login: "tfadmin",
        administrator_password: "var.sensitive_database_password",
        admin_username: component.config.adminUsername || "azureuser",
        admin_password: "var.sensitive_database_password",
        publisher_name: project.owner,
        publisher_email: component.config.publisherEmail,
        domain_name: component.config.zoneName || component.config.domainName,
        dns_config: {
          relative_name: sanitizeName(project.name),
          ttl: 60
        },
        monitor_config: {
          protocol: "HTTPS",
          port: 443,
          path: "/"
        },
        traffic_routing_method: component.config.routingMethod || "Performance",
        workspace_id: "var.azure_log_analytics_workspace_resource_id",
        storage_data_lake_gen2_filesystem_id: "var.azure_synapse_storage_filesystem_id",
        sql_administrator_login_password: "var.sensitive_database_password",
        kind: component.type === "azure-openai" ? "OpenAI" : "CognitiveServices",
        namespace_parameters: {
          sku: component.config.sku || "Standard",
          capacity: component.config.replicas ?? 2,
          auto_inflate_enabled: component.config.autoscaling,
          maximum_throughput_units: component.config.maxCapacity,
          public_network_access_enabled: component.config.publicAccess ?? false,
          minimum_tls_version: "1.2"
        },
        containers_config: [
          {
            name: sanitizeName(component.name) || "app",
            image: component.config.containerImage || "mcr.microsoft.com/azuredocs/aci-helloworld:latest",
            cpu: 1,
            memory: 1.5,
            ports: [{ port: 80, protocol: "TCP" }]
          }
        ],
        content: "jsonencode({ lenses = [] })",
        role_assignments_for_resource_groups: {},
        diagnostic_settings: {
          enabled: true,
          log_analytics_workspace_id: "try(module.log_analytics_observability.id, null)"
        },
        optional_config: optionalConfig(component),
        extra_tags: componentTags(component),
        tags: componentTags(component)
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
        ],
        deletion_protection: component.config.deletionProtection,
        cluster_resource_labels: gcpLabels(component),
        logging_service: component.config.enableAuditLogs ? "logging.googleapis.com/kubernetes" : undefined,
        monitoring_service: component.config.enableMonitoring ? "monitoring.googleapis.com/kubernetes" : undefined,
        horizontal_pod_autoscaling: component.config.autoscaling
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
        deletion_protection: component.config.deletionProtection ?? (project.environment === "prod"),
        deletion_protection_enabled: component.config.deletionProtection ?? (project.environment === "prod"),
        backup_configuration: {
          enabled: Number(component.config.backupRetentionDays ?? 0) > 0,
          retained_backups: component.config.backupRetentionDays
        },
        insights_config: component.config.enableMonitoring
          ? {
              query_insights_enabled: true,
              record_application_tags: true,
              record_client_address: true
            }
          : undefined,
        user_labels: gcpLabels(component),
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
        labels: gcpLabels(component),
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
    .map((component) => block("module", [moduleName(project, component)], componentModuleBody(project, component)))
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
    ...(project.provider === "aws"
      ? [
          `variable "aws_secondary_region" {
  description = "Secondary AWS region used by AWS-IA multi-region modules such as Aurora."
  type        = string
  default     = "${project.region}"
}`,
          `variable "aws_secondary_private_subnet_ids" {
  description = "Secondary-region private subnet IDs used by AWS-IA modules that require paired regional subnets."
  type        = list(string)
  default     = []
}`,
          `variable "aws_kms_key_id" {
  description = "Existing AWS KMS key ID or ARN for AWS-IA modules that require encryption wiring."
  type        = string
  default     = ""
}`,
          `variable "aws_launch_template_id" {
  description = "Existing EC2 launch template ID used by the AWS-IA ECS cluster module."
  type        = string
  default     = ""
}`,
          `variable "aws_launch_configuration_name" {
  description = "Existing EC2 launch configuration name used by the AWS-IA ECS cluster module."
  type        = string
  default     = ""
}`,
          `variable "aws_shield_protected_resource_arn" {
  description = "AWS resource ARN protected by the AWS-IA Shield Advanced module."
  type        = string
  default     = ""
}`,
          `variable "aws_eks_cluster_name" {
  description = "Existing EKS cluster name used by the AWS-IA EKS Blueprints Addons module."
  type        = string
  default     = "${sanitizeName(project.name)}-${project.environment}-eks"
}`,
          `variable "aws_eks_cluster_endpoint" {
  description = "Existing EKS cluster endpoint used by the AWS-IA EKS Blueprints Addons module."
  type        = string
  default     = ""
}`,
          `variable "aws_eks_oidc_provider_arn" {
  description = "Existing EKS cluster OIDC provider ARN used by the AWS-IA EKS Blueprints Addons module."
  type        = string
  default     = ""
}`
        ]
      : []),
    ...(project.provider === "azure"
      ? [
          `variable "azure_vnet_name" {
  description = "Azure VNet name used by modules that attach to existing subnets."
  type        = string
  default     = ""
}`,
          `variable "azure_aks_subnet_name" {
  description = "Azure subnet name for AKS nodes."
  type        = string
  default     = "aks"
}`,
          `variable "azure_data_subnet_id" {
  description = "Azure subnet ID for data services such as PostgreSQL and Redis."
  type        = string
  default     = ""
}`,
          `variable "azure_app_gateway_subnet_id" {
  description = "Azure subnet ID for Application Gateway."
  type        = string
  default     = ""
}`,
          `variable "azure_bastion_subnet_cidr" {
  description = "CIDR range for the Azure Bastion subnet when the Claranet Bastion module is selected."
  type        = string
  default     = "10.60.250.0/27"
}`,
          `variable "azure_firewall_subnet_cidr" {
  description = "CIDR range for the Azure Firewall subnet when the Claranet Firewall module is selected."
  type        = string
  default     = "10.60.251.0/26"
}`,
          `variable "azure_private_endpoint_target_resource_id" {
  description = "Fallback target resource ID or private link alias for Azure Private Endpoint."
  type        = string
  default     = ""
}`,
          `variable "azure_container_app_environment_resource_id" {
  description = "Existing Container Apps managed environment resource ID for AVM Container App."
  type        = string
  default     = ""
}`,
          `variable "azure_log_analytics_workspace_resource_id" {
  description = "Existing Log Analytics workspace resource ID for modules that attach telemetry resources."
  type        = string
  default     = ""
}`,
          `variable "azure_synapse_storage_filesystem_id" {
  description = "Existing ADLS Gen2 filesystem ID required by the AVM Synapse workspace module."
  type        = string
  default     = ""
}`,
          `variable "azure_diagnostic_destination_ids" {
  description = "Destination resource IDs for Azure diagnostic settings when monitoring or audit logs are enabled."
  type        = list(string)
  default     = []
}`,
          `variable "azure_flow_log_storage_account_id" {
  description = "Storage account ID for Azure Network Watcher flow logs when enabled."
  type        = string
  default     = null
}`,
          `variable "azure_log_analytics_workspace_id" {
  description = "Log Analytics workspace resource ID for Azure diagnostics or flow logs."
  type        = string
  default     = null
}`,
          `variable "azure_log_analytics_workspace_guid" {
  description = "Log Analytics workspace GUID for Azure flow log traffic analytics."
  type        = string
  default     = null
}`,
          `variable "azure_waf_policy_id" {
  description = "Existing Azure WAF policy ID to associate with Application Gateway when WAF is enabled."
  type        = string
  default     = null
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
        ? `module.${moduleName(project, vpc)}.id`
        : project.provider === "gcp"
          ? `module.${moduleName(project, vpc)}.network_id`
          : `module.${moduleName(project, vpc)}.vpc_attributes.id`;
    outputs.push(`output "vpc_id" {
  description = "Created network ID."
  value       = ${vpcValue}
}`);
  }

  const eks = byType("eks");
  if (eks) {
    const clusterValue =
      project.provider === "azure" || project.provider === "gcp"
        ? `module.${moduleName(project, eks)}.name`
        : getModuleMapping(eks.type, project.provider)?.moduleSource === "aws-ia/eks-blueprints-addons/aws"
          ? "var.aws_eks_cluster_name"
          : getModuleMapping(eks.type, project.provider)?.moduleSource.startsWith("./")
            ? `module.${moduleName(project, eks)}.name`
            : `module.${moduleName(project, eks)}.cluster_name`;
    outputs.push(`output "eks_cluster_name" {
  description = "Kubernetes cluster name."
  value       = ${clusterValue}
}`);
  }

  const rds = byType("rds");
  if (rds) {
    const dbValue =
      project.provider === "azure"
        ? `module.${moduleName(project, rds)}.id`
        : project.provider === "gcp"
          ? `module.${moduleName(project, rds)}.instance_connection_name`
          : getModuleMapping(rds.type, project.provider)?.moduleSource === "aws-ia/rds-aurora/aws"
            ? `module.${moduleName(project, rds)}.aurora_cluster_endpoint`
            : getModuleMapping(rds.type, project.provider)?.moduleSource.startsWith("./")
              ? `module.${moduleName(project, rds)}.id`
              : `module.${moduleName(project, rds)}.db_instance_endpoint`;
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
azure_vnet_name       = ""
azure_aks_subnet_name = "aks"
azure_data_subnet_id  = ""
azure_app_gateway_subnet_id = ""
azure_bastion_subnet_cidr = "10.60.250.0/27"
azure_firewall_subnet_cidr = "10.60.251.0/26"
azure_private_endpoint_target_resource_id = ""
azure_container_app_environment_resource_id = ""
azure_log_analytics_workspace_resource_id = ""
azure_synapse_storage_filesystem_id = ""
azure_diagnostic_destination_ids = []
azure_flow_log_storage_account_id = null
azure_log_analytics_workspace_id = null
azure_log_analytics_workspace_guid = null
azure_waf_policy_id = null
# sensitive_database_password should be supplied through a secret manager or TF_VAR_sensitive_database_password.
`;
  }

  return `aws_region          = "${project.region}"
environment         = "${project.environment}"
acm_certificate_arn = ""
aws_secondary_region = "${project.region}"
aws_secondary_private_subnet_ids = []
aws_kms_key_id = ""
aws_launch_template_id = ""
aws_launch_configuration_name = ""
aws_shield_protected_resource_arn = ""
aws_eks_cluster_name = "${sanitizeName(project.name)}-${project.environment}-eks"
aws_eks_cluster_endpoint = ""
aws_eks_oidc_provider_arn = ""
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
  default     = "${project.region}"
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

variable "ingress_cidr_blocks" {
  description = "Optional ingress CIDR blocks."
  type        = list(string)
  default     = []
}

variable "enable_ssh" {
  description = "Whether SSH ingress is enabled."
  type        = bool
  default     = false
}

variable "egress_rules" {
  description = "Optional egress rule names."
  type        = list(string)
  default     = []
}

variable "cluster_name" {
  description = "Optional Kubernetes cluster name."
  type        = string
  default     = null
}

variable "cluster_version" {
  description = "Optional Kubernetes cluster version."
  type        = string
  default     = null
}

variable "cluster_endpoint_private_access" {
  description = "Whether a cluster endpoint should be private."
  type        = bool
  default     = true
}

variable "cluster_enabled_log_types" {
  description = "Optional cluster log types."
  type        = list(string)
  default     = []
}

variable "cluster_log_retention_in_days" {
  description = "Optional control-plane log retention."
  type        = number
  default     = null
}

variable "node_groups" {
  description = "Optional node group configuration."
  type        = any
  default     = {}
}

variable "identifier" {
  description = "Optional resource identifier."
  type        = string
  default     = null
}

variable "engine" {
  description = "Optional data service engine."
  type        = string
  default     = null
}

variable "engine_version" {
  description = "Optional engine version."
  type        = string
  default     = null
}

variable "instance_class" {
  description = "Optional instance class."
  type        = string
  default     = null
}

variable "allocated_storage" {
  description = "Optional allocated storage in GB."
  type        = number
  default     = null
}

variable "multi_az" {
  description = "Whether Multi-AZ deployment is requested."
  type        = bool
  default     = false
}

variable "vpc_security_group_ids" {
  description = "Optional VPC security group IDs."
  type        = list(string)
  default     = []
}

variable "storage_encrypted" {
  description = "Whether storage encryption is requested."
  type        = bool
  default     = true
}

variable "deletion_protection" {
  description = "Whether deletion protection is requested."
  type        = bool
  default     = false
}

variable "backup_retention_period" {
  description = "Optional backup retention period."
  type        = number
  default     = null
}

variable "maintenance_window" {
  description = "Optional maintenance window."
  type        = string
  default     = null
}

variable "node_type" {
  description = "Optional cache node type."
  type        = string
  default     = null
}

variable "replicas_per_node_group" {
  description = "Optional replicas per node group."
  type        = number
  default     = null
}

variable "transit_encryption_enabled" {
  description = "Whether transit encryption is requested."
  type        = bool
  default     = true
}

variable "snapshot_retention_limit" {
  description = "Optional snapshot retention limit."
  type        = number
  default     = null
}

variable "subnets" {
  description = "Optional subnet IDs."
  type        = any
  default     = []
}

variable "certificate_arn" {
  description = "Optional certificate ARN."
  type        = string
  default     = null
}

variable "enable_waf" {
  description = "Whether WAF is requested."
  type        = bool
  default     = false
}

variable "domain_name" {
  description = "Optional domain name."
  type        = string
  default     = null
}

variable "access_logs_enabled" {
  description = "Whether access logs are requested."
  type        = bool
  default     = false
}

variable "deletion_protection_enabled" {
  description = "Whether deletion protection is requested."
  type        = bool
  default     = false
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
  default     = "standard"
}

variable "capacity" {
  description = "Service capacity setting."
  type        = number
  default     = 1
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
