import type { ComponentDefinition, ComponentType, ModuleMapping, ProjectState } from "@/lib/types";

const azureLocationOptions = [
  { label: "Regional", value: "regional" },
  { label: "Zonal", value: "zonal" },
  { label: "Global", value: "global" }
];

const azureOptionalFields: ComponentDefinition["fields"] = [
  { key: "enableEncryption", label: "Encryption", type: "boolean", help: "Enable encryption and customer-managed key wiring where supported." },
  { key: "backupRetentionDays", label: "Backup retention days", type: "number", min: 0, max: 365, help: "Backup or recovery retention period. Use 0 for stateless services." },
  { key: "deletionProtection", label: "Deletion protection", type: "boolean", help: "Protect stateful production resources from accidental deletion." },
  { key: "enableMonitoring", label: "Monitoring", type: "boolean", help: "Enable diagnostic settings, metrics, and alert scaffolding." },
  { key: "enableAuditLogs", label: "Audit logs", type: "boolean", help: "Enable platform or control-plane logging where supported." },
  { key: "maintenanceWindow", label: "Maintenance window", type: "text", placeholder: "Sun 04:00-05:00", help: "Preferred maintenance window for managed services." },
  { key: "privateDns", label: "Private DNS", type: "boolean", help: "Create or associate private DNS zones for private endpoints." },
  { key: "autoscaling", label: "Autoscaling", type: "boolean", help: "Enable autoscaling policy scaffolding where supported." },
  { key: "minCapacity", label: "Min capacity", type: "number", min: 0, max: 10000, help: "Minimum autoscaling capacity." },
  { key: "maxCapacity", label: "Max capacity", type: "number", min: 1, max: 10000, help: "Maximum autoscaling capacity." },
  { key: "dataClassification", label: "Data classification", type: "select", help: "Governance classification tag.", options: [{ label: "Public", value: "public" }, { label: "Internal", value: "internal" }, { label: "Confidential", value: "confidential" }, { label: "Restricted", value: "restricted" }] },
  { key: "costAllocationTag", label: "Cost allocation tag", type: "text", placeholder: "platform-core", help: "Additional cost allocation tag value." }
];

const azureVmSizeOptions = [
  { label: "B2s - burstable small", value: "Standard_B2s" },
  { label: "B4ms - burstable medium", value: "Standard_B4ms" },
  { label: "D2s v5 - general purpose", value: "Standard_D2s_v5" },
  { label: "D4s v5 - general purpose", value: "Standard_D4s_v5" },
  { label: "D8s v5 - general purpose", value: "Standard_D8s_v5" },
  { label: "E4s v5 - memory optimized", value: "Standard_E4s_v5" },
  { label: "F4s v2 - compute optimized", value: "Standard_F4s_v2" }
];

function genericAzureFields(extra?: ComponentDefinition["fields"]): ComponentDefinition["fields"] {
  const extraFields = extra ?? [];
  const extraKeys = new Set(extraFields.map((field) => field.key));
  const baseFields: ComponentDefinition["fields"] = [
    { key: "sku", label: "SKU / tier", type: "text", required: true, placeholder: "Standard", help: "Provider-specific SKU, tier, or capacity family." },
    { key: "replicas", label: "Capacity", type: "number", required: true, min: 1, max: 1000, help: "Instance count, capacity units, partitions, or equivalent scale setting." },
    { key: "publicAccess", label: "Public access", type: "boolean", help: "Keep disabled for private production services unless an edge service requires it." },
    { key: "privateEndpoint", label: "Private endpoint", type: "boolean", help: "Adds private connectivity wiring where the module supports it." },
    { key: "zoneMode", label: "Zone mode", type: "select", required: true, help: "Availability and placement strategy.", options: azureLocationOptions }
  ];

  return [
    ...baseFields.filter((field) => !extraKeys.has(field.key)),
    ...extraFields,
    ...azureOptionalFields
  ];
}

function service(
  type: ComponentType,
  label: string,
  description: string,
  estimatedResources: number,
  extra?: ComponentDefinition["fields"],
  dependsOn: ComponentType[] = ["vpc", "security-group"]
): ComponentDefinition {
  return {
    type,
    label,
    description,
    provider: "azure",
    icon: "Box",
    estimatedResources,
    fields: genericAzureFields(extra),
    dependsOn
  };
}

export const azureComponentDefinitions: ComponentDefinition[] = [
  {
    type: "vpc",
    label: "VNet / Networking",
    description: "Hub-ready Azure Virtual Network with workload, ingress, and data subnets.",
    provider: "azure",
    icon: "Network",
    estimatedResources: 12,
    fields: [
      { key: "cidr", label: "Address space", type: "text", required: true, placeholder: "10.60.0.0/16", help: "Primary private address space for the VNet." },
      { key: "azCount", label: "Availability zones", type: "number", required: true, min: 2, max: 3, help: "Used for zonal services and generated subnet strategy." },
      { key: "enableNatGateway", label: "NAT gateway", type: "boolean", help: "Provides stable outbound internet egress for private workloads." },
      ...azureOptionalFields
    ]
  },
  {
    type: "security-group",
    label: "Network Security Group",
    description: "Default-deny NSG baseline with optional controlled admin access.",
    provider: "azure",
    icon: "Shield",
    estimatedResources: 5,
    fields: [
      { key: "allowedCidrBlocks", label: "Allowed CIDRs", type: "cidr-list", required: true, help: "Ingress source prefixes for public entry points." },
      { key: "enableSsh", label: "SSH access", type: "boolean", help: "Disabled by default; prefer Azure Bastion or Just-in-Time VM access." },
      ...azureOptionalFields
    ],
    dependsOn: ["vpc"]
  },
  {
    type: "eks",
    label: "AKS Cluster",
    description: "Private Azure Kubernetes Service cluster with autoscaling node pools.",
    provider: "azure",
    icon: "Boxes",
    estimatedResources: 26,
    fields: [
      { key: "clusterVersion", label: "Kubernetes version", type: "select", required: true, help: "Pinned AKS control plane version.", options: [{ label: "1.31", value: "1.31" }, { label: "1.30", value: "1.30" }, { label: "1.29", value: "1.29" }] },
      { key: "nodeInstanceType", label: "Node size", type: "select", required: true, help: "Default node pool VM size.", options: [{ label: "Standard_D4s_v5", value: "Standard_D4s_v5" }, { label: "Standard_D8s_v5", value: "Standard_D8s_v5" }, { label: "Standard_B4ms", value: "Standard_B4ms" }] },
      { key: "minNodes", label: "Min nodes", type: "number", required: true, min: 1, max: 20, help: "Minimum autoscaling node count." },
      { key: "maxNodes", label: "Max nodes", type: "number", required: true, min: 2, max: 100, help: "Maximum autoscaling node count." },
      { key: "privateEndpoint", label: "Private cluster", type: "boolean", help: "Restricts the Kubernetes API endpoint to private access." },
      ...azureOptionalFields
    ],
    dependsOn: ["vpc", "security-group"]
  },
  {
    type: "rds",
    label: "Azure PostgreSQL",
    description: "PostgreSQL Flexible Server with private networking and backups.",
    provider: "azure",
    icon: "Database",
    estimatedResources: 10,
    fields: [
      { key: "engineVersion", label: "Engine version", type: "select", required: true, help: "Pinned PostgreSQL major version.", options: [{ label: "16", value: "16" }, { label: "15", value: "15" }, { label: "14", value: "14" }] },
      { key: "instanceClass", label: "SKU", type: "select", required: true, help: "Azure Flexible Server SKU.", options: [{ label: "D2ds_v5", value: "D2ds_v5" }, { label: "D4ds_v5", value: "D4ds_v5" }, { label: "B2s", value: "B2s" }] },
      { key: "allocatedStorage", label: "Storage GB", type: "number", required: true, min: 32, max: 16384, help: "Storage size, converted to MB in Terraform." },
      { key: "multiAz", label: "Zone redundant", type: "boolean", help: "Enables standby zone for higher availability." },
      ...azureOptionalFields
    ],
    dependsOn: ["vpc", "security-group"]
  },
  {
    type: "redis",
    label: "Azure Redis Cache",
    description: "Azure Cache for Redis with TLS and private ingress guardrails.",
    provider: "azure",
    icon: "Zap",
    estimatedResources: 6,
    fields: [
      { key: "nodeType", label: "SKU", type: "select", required: true, help: "Redis SKU tier.", options: [{ label: "Premium P1", value: "Premium" }, { label: "Standard C2", value: "Standard" }, { label: "Basic C1", value: "Basic" }] },
      { key: "replicas", label: "Capacity", type: "number", required: true, min: 1, max: 6, help: "Azure Redis capacity value." },
      { key: "transitEncryption", label: "Minimum TLS 1.2", type: "boolean", help: "Enforces modern TLS for client traffic." },
      ...azureOptionalFields
    ],
    dependsOn: ["vpc", "security-group"]
  },
  {
    type: "alb",
    label: "Application Gateway",
    description: "Azure Application Gateway edge entry point with HTTPS and optional WAF.",
    provider: "azure",
    icon: "Router",
    estimatedResources: 14,
    fields: [
      { key: "domainName", label: "Domain name", type: "text", required: true, placeholder: "app.example.com", help: "DNS name routed to Application Gateway." },
      { key: "enableWaf", label: "WAF policy", type: "boolean", help: "Enables WAF_v2 posture for public traffic." },
      { key: "certificateArn", label: "Key Vault certificate secret ID", type: "text", placeholder: "https://vault.vault.azure.net/secrets/...", help: "Existing Key Vault certificate secret identifier." },
      ...azureOptionalFields
    ],
    dependsOn: ["vpc", "security-group"]
  },
  service("vm", "Virtual Machine", "Linux or Windows VM with managed disk, private networking, and optional public ingress.", 8, [
    { key: "sku", label: "SKU / tier", type: "select", required: true, help: "Azure VM size.", options: azureVmSizeOptions },
    { key: "image", label: "Image", type: "select", required: true, help: "Base OS image.", options: [{ label: "Ubuntu 24.04 LTS", value: "Ubuntu2404" }, { label: "Windows Server 2022", value: "Windows2022" }, { label: "RHEL 9", value: "RHEL9" }] },
    { key: "adminUsername", label: "Admin username", type: "text", required: true, placeholder: "azureuser", help: "Admin username for the VM." }
  ]),
  service("vmss", "Virtual Machine Scale Set", "Autoscaling compute pool for stateless workloads.", 10, [
    { key: "sku", label: "SKU / tier", type: "select", required: true, help: "Azure VMSS instance size.", options: azureVmSizeOptions },
    { key: "image", label: "Image", type: "select", required: true, help: "Base OS image.", options: [{ label: "Ubuntu 24.04 LTS", value: "Ubuntu2404" }, { label: "Windows Server 2022", value: "Windows2022" }] }
  ]),
  service("storage-account", "Storage Account", "Secure storage account with blob, queue, table, and file service support.", 7, [
    { key: "kind", label: "Kind", type: "select", required: true, help: "Storage account kind.", options: [{ label: "StorageV2", value: "StorageV2" }, { label: "BlockBlobStorage", value: "BlockBlobStorage" }, { label: "FileStorage", value: "FileStorage" }] }
  ], []),
  service("key-vault", "Key Vault", "Secrets, keys, and certificates with RBAC and private endpoint readiness.", 7, [
    { key: "purgeProtection", label: "Purge protection", type: "boolean", help: "Recommended for production key vaults." }
  ]),
  service("app-service", "App Service", "Managed web application hosting with deployment slots and private integration.", 8),
  service("function-app", "Function App", "Serverless functions with managed identity, storage, and observability hooks.", 8),
  service("container-app", "Container Apps", "Serverless container workloads with revision traffic and ingress controls.", 9),
  service("container-registry", "Container Registry", "Private ACR with admin access disabled and optional private endpoint.", 6, undefined, []),
  service("aci", "Container Instance", "Lightweight Azure Container Instance for jobs and utility workloads.", 5),
  service("aks-node-pool", "AKS Node Pool", "Additional AKS node pool with autoscaling and workload isolation.", 5, [
    { key: "nodeTaints", label: "Node taints", type: "text", placeholder: "workload=system:NoSchedule", help: "Optional Kubernetes node taints." }
  ], ["eks"]),
  service("front-door", "Front Door", "Global HTTP edge routing, TLS termination, acceleration, and WAF integration.", 10, [
    { key: "domainName", label: "Domain name", type: "text", required: true, placeholder: "app.example.com", help: "Custom domain served from Front Door." }
  ], []),
  service("cdn", "CDN Profile", "Azure CDN profile and endpoint for static assets and edge caching.", 6, [
    { key: "domainName", label: "Endpoint host", type: "text", required: true, placeholder: "assets.example.com", help: "Custom domain or endpoint hostname." }
  ], []),
  service("dns-zone", "DNS Zone", "Public DNS zone with tagging and record-set readiness.", 4, [
    { key: "zoneName", label: "Zone name", type: "text", required: true, placeholder: "example.com", help: "Public DNS zone name." }
  ], []),
  service("private-dns-zone", "Private DNS Zone", "Private DNS zone linked to the workload VNet.", 5, [
    { key: "zoneName", label: "Zone name", type: "text", required: true, placeholder: "privatelink.database.windows.net", help: "Private DNS zone name." }
  ], ["vpc"]),
  service("private-endpoint", "Private Endpoint", "Private endpoint and DNS integration for PaaS services.", 6, [
    { key: "targetResourceId", label: "Target resource ID", type: "text", required: true, help: "Azure resource ID to expose privately." }
  ], ["vpc"]),
  service("public-ip", "Public IP", "Static public IP for edge resources.", 3, undefined, []),
  service("nat-gateway", "NAT Gateway", "Dedicated outbound egress gateway for private subnets.", 5, undefined, ["vpc"]),
  service("bastion", "Azure Bastion", "Browser-based private VM access without public SSH/RDP exposure.", 6, undefined, ["vpc"]),
  service("vpn-gateway", "VPN Gateway", "Site-to-site or point-to-site VPN gateway.", 9, [
    { key: "vpnType", label: "VPN type", type: "select", required: true, help: "Routing mode.", options: [{ label: "RouteBased", value: "RouteBased" }, { label: "PolicyBased", value: "PolicyBased" }] }
  ], ["vpc"]),
  service("expressroute", "ExpressRoute", "Private circuit gateway for enterprise connectivity.", 8, undefined, ["vpc"]),
  service("firewall", "Azure Firewall", "Managed network firewall with policy and private subnet placement.", 9, undefined, ["vpc"]),
  service("route-table", "Route Table", "Custom routes for subnet egress, inspection, and hub-spoke routing.", 4, undefined, ["vpc"]),
  service("load-balancer", "Load Balancer", "Layer 4 load balancer for internal or public services.", 8),
  service("traffic-manager", "Traffic Manager", "DNS-based global traffic routing and failover.", 5, [
    { key: "routingMethod", label: "Routing method", type: "select", required: true, help: "Traffic routing strategy.", options: [{ label: "Priority", value: "Priority" }, { label: "Weighted", value: "Weighted" }, { label: "Performance", value: "Performance" }] }
  ], []),
  service("mysql", "Azure MySQL", "Azure Database for MySQL Flexible Server with private access.", 9),
  service("mssql", "Azure SQL", "Azure SQL Server and database with private endpoint readiness.", 9),
  service("cosmos-db", "Cosmos DB", "Globally distributed NoSQL database with consistency controls.", 10, [
    { key: "apiKind", label: "API", type: "select", required: true, help: "Cosmos DB API surface.", options: [{ label: "NoSQL", value: "GlobalDocumentDB" }, { label: "MongoDB", value: "MongoDB" }, { label: "Cassandra", value: "Cassandra" }] }
  ]),
  service("storage-queue", "Storage Queue", "Queue service for asynchronous workload integration.", 4, undefined, ["storage-account"]),
  service("event-hub", "Event Hubs", "Streaming ingestion namespace with hubs, partitions, and capture readiness.", 8, [
    { key: "partitions", label: "Partitions", type: "number", required: true, min: 1, max: 32, help: "Event Hub partition count." }
  ]),
  service("service-bus", "Service Bus", "Messaging namespace with queues and topics for enterprise integration.", 8, [
    { key: "queueName", label: "Queue name", type: "text", required: true, placeholder: "jobs", help: "Default queue generated by the module." }
  ]),
  service("api-management", "API Management", "Managed API gateway with products, policies, and private networking options.", 12, [
    { key: "publisherEmail", label: "Publisher email", type: "text", required: true, placeholder: "platform@example.com", help: "Required APIM publisher contact." }
  ]),
  service("logic-app", "Logic App", "Workflow automation for integration and event-driven orchestration.", 6),
  service("data-factory", "Data Factory", "Data integration service with managed identity and diagnostics.", 7),
  service("synapse", "Synapse Analytics", "Analytics workspace for SQL, Spark, and data lake workloads.", 12),
  service("databricks", "Databricks Workspace", "Azure Databricks workspace with secure cluster connectivity.", 9),
  service("stream-analytics", "Stream Analytics", "Real-time stream processing jobs.", 6),
  service("event-grid", "Event Grid", "Event routing topics, domains, and subscriptions.", 5),
  service("log-analytics", "Log Analytics Workspace", "Central observability workspace for logs and metrics.", 5, undefined, []),
  service("app-insights", "Application Insights", "Application telemetry linked to Log Analytics.", 5, undefined, ["log-analytics"]),
  service("monitor-action-group", "Monitor Action Group", "Alert notification routing for operations teams.", 4, [
    { key: "receiverEmail", label: "Receiver email", type: "text", required: true, placeholder: "oncall@example.com", help: "Default alert receiver." }
  ], []),
  service("dashboard", "Azure Dashboard", "Shared Azure Portal dashboard for service health and metrics.", 4, undefined, ["log-analytics"]),
  service("managed-identity", "Managed Identity", "User-assigned identity for workloads and automation.", 3, undefined, []),
  service("role-assignment", "Role Assignment", "RBAC assignment scoped to a subscription, resource group, or resource.", 3, [
    { key: "roleName", label: "Role", type: "text", required: true, placeholder: "Reader", help: "Azure built-in or custom role name." }
  ], ["managed-identity"]),
  service("policy-assignment", "Policy Assignment", "Azure Policy assignment for governance guardrails.", 5, [
    { key: "policyDefinitionId", label: "Policy definition ID", type: "text", required: true, help: "Built-in or custom policy definition ID." }
  ], []),
  service("defender", "Microsoft Defender", "Defender for Cloud plan configuration.", 4, [
    { key: "planName", label: "Plan name", type: "text", required: true, placeholder: "VirtualMachines", help: "Defender plan to enable." }
  ], []),
  service("recovery-services-vault", "Recovery Services Vault", "Backup and site recovery vault with soft delete.", 6, undefined, []),
  service("backup-policy", "Backup Policy", "VM or workload backup policy linked to a Recovery Services Vault.", 5, undefined, ["recovery-services-vault"]),
  service("automation-account", "Automation Account", "Runbooks, update management, and operational automation.", 5, undefined, []),
  service("cognitive-services", "Cognitive Services", "Azure AI multi-service account with private endpoint option.", 6),
  service("azure-openai", "Azure OpenAI", "Azure OpenAI account for model deployments and private networking.", 7, [
    { key: "model", label: "Model", type: "text", required: true, placeholder: "gpt-4.1", help: "Default model deployment name." }
  ]),
  service("ai-search", "AI Search", "Azure AI Search service for retrieval and vector search workloads.", 7),
  service("machine-learning", "Machine Learning Workspace", "Azure ML workspace with storage, key vault, and registry hooks.", 10),
  service("maps", "Azure Maps", "Maps account for geospatial workloads.", 3, undefined, []),
  service("communication-services", "Communication Services", "Email, SMS, voice, and chat communication resource.", 4, undefined, [])
];

export const azureModuleMappings: ModuleMapping[] = [
  { resourceType: "vpc", provider: "azure", moduleSource: "claranet/vnet/azurerm", version: "8.1.3", requiredInputs: ["cidrs", "client_name", "environment", "location", "resource_group_name", "stack"], optionalInputs: ["extra_tags", "flow_log_enabled", "flow_log_retention_policy_days", "flow_log_storage_account_id", "log_analytics_workspace_guid", "log_analytics_workspace_id"], notes: "Claranet Azure VNet module." },
  { resourceType: "security-group", provider: "azure", moduleSource: "claranet/nsg/azurerm", version: "8.1.4", requiredInputs: ["client_name", "environment", "location", "location_short", "resource_group_name", "stack"], optionalInputs: ["all_inbound_denied", "extra_tags", "flow_log_enabled", "flow_log_retention_policy_days", "flow_log_storage_account_id", "log_analytics_workspace_guid", "log_analytics_workspace_id", "ssh_inbound_allowed", "ssh_source_allowed"], notes: "Claranet NSG module with default deny posture." },
  { resourceType: "eks", provider: "azure", moduleSource: "claranet/aks-light/azurerm", version: "8.15.0", requiredInputs: ["client_name", "environment", "location", "resource_group_name", "stack"], optionalInputs: ["extra_tags", "kubernetes_version", "logs_destinations_ids", "logs_kube_audit_enabled", "maintenance_window", "node_pools", "nodes_subnet", "private_cluster_enabled"], notes: "Claranet AKS Light module." },
  { resourceType: "rds", provider: "azure", moduleSource: "claranet/db-postgresql-flexible/azurerm", version: "8.6.2", requiredInputs: ["administrator_login", "allowed_cidrs", "client_name", "environment", "location", "resource_group_name", "stack"], optionalInputs: ["administrator_password", "backup_retention_days", "delegated_subnet", "extra_tags", "high_availability", "logs_destinations_ids", "maintenance_window", "postgresql_version", "public_network_access_enabled", "size", "storage_mb"], notes: "Claranet PostgreSQL Flexible Server module." },
  { resourceType: "redis", provider: "azure", moduleSource: "claranet/redis/azurerm", version: "8.1.4", requiredInputs: ["client_name", "environment", "location", "resource_group_name", "stack"], optionalInputs: ["capacity", "extra_tags", "logs_destinations_ids", "minimum_tls_version", "public_network_access_enabled", "sku_name", "subnet_id"], notes: "Claranet Azure Redis module." },
  { resourceType: "alb", provider: "azure", moduleSource: "claranet/app-gateway/azurerm", version: "8.5.0", requiredInputs: ["client_name", "environment", "location", "resource_group_name", "stack"], optionalInputs: ["app_gateway_tags", "autoscale_configuration", "backend_address_pools", "backend_http_settings", "create_subnet", "extra_tags", "firewall_policy_id", "flow_log_enabled", "flow_log_retention_policy_days", "flow_log_storage_account_id", "force_firewall_policy_association", "frontend_ports", "http_listeners", "log_analytics_workspace_guid", "log_analytics_workspace_id", "logs_destinations_ids", "request_routing_rules", "sku", "sku_capacity", "ssl_certificates", "subnet_id", "zones"], notes: "Claranet Application Gateway module." },
  { resourceType: "storage-account", provider: "azure", moduleSource: "claranet/storage-account/azurerm", version: "8.6.10", requiredInputs: ["client_name", "environment", "location", "location_short", "logs_destinations_ids", "resource_group_name", "stack"], optionalInputs: ["account_kind", "account_tier", "custom_name", "extra_tags", "public_network_access_enabled"], notes: "Claranet Azure Storage Account module." },
  { resourceType: "key-vault", provider: "azure", moduleSource: "claranet/keyvault/azurerm", version: "8.2.1", requiredInputs: ["client_name", "environment", "location", "location_short", "logs_destinations_ids", "resource_group_name", "stack"], optionalInputs: ["custom_name", "extra_tags", "public_network_access_enabled"], notes: "Claranet Azure Key Vault module." },
  { resourceType: "app-service", provider: "azure", moduleSource: "claranet/app-service/azurerm", version: "8.6.1", requiredInputs: ["client_name", "environment", "location", "location_short", "logs_destinations_ids", "os_type", "resource_group_name", "sku_name", "stack"], optionalInputs: ["custom_name", "extra_tags", "public_network_access_enabled"], notes: "Claranet Azure App Service module." },
  { resourceType: "function-app", provider: "azure", moduleSource: "claranet/function-app/azurerm", version: "8.8.4", requiredInputs: ["client_name", "environment", "location", "location_short", "logs_destinations_ids", "os_type", "resource_group_name", "stack"], optionalInputs: ["custom_name", "extra_tags", "public_network_access_enabled"], notes: "Claranet Azure Function App module." },
  { resourceType: "container-registry", provider: "azure", moduleSource: "claranet/acr/azurerm", version: "8.2.3", requiredInputs: ["client_name", "environment", "location", "location_short", "logs_destinations_ids", "resource_group_name", "stack"], optionalInputs: ["custom_name", "extra_tags", "public_network_access_enabled", "sku"], notes: "Claranet Azure Container Registry module." },
  { resourceType: "private-endpoint", provider: "azure", moduleSource: "claranet/private-endpoint/azurerm", version: "8.1.3", requiredInputs: ["client_name", "environment", "location", "location_short", "resource_group_name", "stack", "subnet_id", "target_resource"], optionalInputs: ["custom_name", "extra_tags"], notes: "Claranet Azure Private Endpoint module." },
  { resourceType: "nat-gateway", provider: "azure", moduleSource: "claranet/nat-gateway/azurerm", version: "8.0.4", requiredInputs: ["client_name", "environment", "location", "location_short", "resource_group_name", "stack", "subnet_ids"], optionalInputs: ["custom_name", "extra_tags"], notes: "Claranet Azure NAT Gateway module." },
  { resourceType: "bastion", provider: "azure", moduleSource: "claranet/bastion/azurerm", version: "8.0.3", requiredInputs: ["client_name", "environment", "location", "location_short", "logs_destinations_ids", "resource_group_name", "stack", "subnet_bastion_cidr", "virtual_network_name"], optionalInputs: ["custom_name", "extra_tags"], notes: "Claranet Azure Bastion module." },
  { resourceType: "vpn-gateway", provider: "azure", moduleSource: "claranet/vpn/azurerm", version: "8.4.4", requiredInputs: ["client_name", "environment", "location", "location_short", "logs_destinations_ids", "resource_group_name", "stack", "virtual_network_name"], optionalInputs: ["custom_name", "extra_tags"], notes: "Claranet Azure VPN module." },
  { resourceType: "firewall", provider: "azure", moduleSource: "claranet/firewall/azurerm", version: "8.0.3", requiredInputs: ["client_name", "environment", "location", "location_short", "logs_destinations_ids", "resource_group_name", "stack", "subnet_cidr", "virtual_network_name"], optionalInputs: ["custom_name", "extra_tags"], notes: "Claranet Azure Firewall module." },
  { resourceType: "route-table", provider: "azure", moduleSource: "claranet/route-table/azurerm", version: "8.0.3", requiredInputs: ["client_name", "environment", "location", "location_short", "resource_group_name", "stack"], optionalInputs: ["custom_name", "extra_tags"], notes: "Claranet Azure Route Table module." },
  { resourceType: "load-balancer", provider: "azure", moduleSource: "claranet/lb/azurerm", version: "8.0.3", requiredInputs: ["client_name", "environment", "location", "location_short", "resource_group_name", "stack"], optionalInputs: ["custom_name", "extra_tags", "sku"], notes: "Claranet Azure Load Balancer module." },
  { resourceType: "mysql", provider: "azure", moduleSource: "claranet/db-mysql-flexible/azurerm", version: "8.3.5", requiredInputs: ["client_name", "environment", "location", "location_short", "logs_destinations_ids", "resource_group_name", "stack"], optionalInputs: ["administrator_password", "custom_name", "extra_tags", "public_network_access_enabled", "sku_name"], notes: "Claranet Azure MySQL Flexible Server module." },
  { resourceType: "mssql", provider: "azure", moduleSource: "claranet/db-sql/azurerm", version: "8.4.3", requiredInputs: ["administrator_login", "administrator_password", "client_name", "environment", "location", "location_short", "logs_destinations_ids", "resource_group_name", "stack"], optionalInputs: ["custom_name", "extra_tags"], notes: "Claranet Azure SQL module." },
  { resourceType: "cosmos-db", provider: "azure", moduleSource: "claranet/cosmos-db/azurerm", version: "8.2.3", requiredInputs: ["client_name", "environment", "location", "location_short", "logs_destinations_ids", "resource_group_name", "stack"], optionalInputs: ["custom_name", "extra_tags", "public_network_access_enabled"], notes: "Claranet Cosmos DB module." },
  { resourceType: "event-hub", provider: "azure", moduleSource: "claranet/eventhub/azurerm", version: "8.1.3", requiredInputs: ["client_name", "environment", "location", "location_short", "logs_destinations_ids", "namespace_parameters", "resource_group_name", "stack"], optionalInputs: ["custom_name", "extra_tags"], notes: "Claranet Event Hubs module." },
  { resourceType: "service-bus", provider: "azure", moduleSource: "claranet/service-bus/azurerm", version: "8.1.3", requiredInputs: ["client_name", "environment", "location", "location_short", "logs_destinations_ids", "resource_group_name", "stack"], optionalInputs: ["custom_name", "extra_tags"], notes: "Claranet Service Bus module." },
  { resourceType: "api-management", provider: "azure", moduleSource: "claranet/api-management/azurerm", version: "8.2.3", requiredInputs: ["client_name", "environment", "location", "location_short", "logs_destinations_ids", "publisher_email", "publisher_name", "resource_group_name", "stack"], optionalInputs: ["custom_name", "extra_tags", "sku_name"], notes: "Claranet API Management module." },
  { resourceType: "data-factory", provider: "azure", moduleSource: "claranet/data-factory/azurerm", version: "8.1.3", requiredInputs: ["client_name", "environment", "location", "location_short", "logs_destinations_ids", "resource_group_name", "stack"], optionalInputs: ["custom_name", "extra_tags"], notes: "Claranet Data Factory module." },
  { resourceType: "event-grid", provider: "azure", moduleSource: "claranet/eventgrid/azurerm", version: "8.2.2", requiredInputs: ["client_name", "environment", "location", "location_short", "logs_destinations_ids", "resource_group_name", "stack"], optionalInputs: ["custom_name", "extra_tags"], notes: "Claranet Event Grid module." },
  { resourceType: "dashboard", provider: "azure", moduleSource: "claranet/dashboard/azurerm", version: "8.1.3", requiredInputs: ["client_name", "content", "environment", "location", "location_short", "resource_group_name", "stack"], optionalInputs: ["custom_name", "extra_tags"], notes: "Claranet Azure Dashboard module." },
  { resourceType: "defender", provider: "azure", moduleSource: "claranet/defender-for-cloud/azurerm", version: "8.1.2", requiredInputs: [], optionalInputs: ["security_center_contacts", "security_center_setting"], notes: "Claranet Defender for Cloud module." },
  { resourceType: "aci", provider: "azure", moduleSource: "claranet/aci/azurerm", version: "8.0.3", requiredInputs: ["client_name", "containers_config", "environment", "location", "location_short", "logs_destinations_ids", "resource_group_name", "stack"], optionalInputs: ["custom_name", "extra_tags"], notes: "Claranet Azure Container Instances module." },
  { resourceType: "front-door", provider: "azure", moduleSource: "claranet/cdn-frontdoor/azurerm", version: "8.1.6", requiredInputs: ["client_name", "environment", "logs_destinations_ids", "resource_group_name", "stack"], optionalInputs: ["custom_name", "extra_tags"], notes: "Claranet Azure CDN Front Door module." },
  { resourceType: "cdn", provider: "azure", moduleSource: "claranet/cdn-frontdoor/azurerm", version: "8.1.6", requiredInputs: ["client_name", "environment", "logs_destinations_ids", "resource_group_name", "stack"], optionalInputs: ["custom_name", "extra_tags"], notes: "Claranet Azure CDN Front Door module." },
  { resourceType: "ai-search", provider: "azure", moduleSource: "claranet/search-service/azurerm", version: "8.1.2", requiredInputs: ["client_name", "environment", "location", "location_short", "logs_destinations_ids", "resource_group_name", "stack"], optionalInputs: ["custom_name", "extra_tags", "sku"], notes: "Claranet Azure AI Search module." },
  { resourceType: "vm", provider: "azure", moduleSource: "Azure/avm-res-compute-virtualmachine/azurerm", version: "0.20.0", requiredInputs: ["location", "name", "network_interfaces", "resource_group_name", "zone"], optionalInputs: ["admin_password", "admin_username", "diagnostic_settings", "os_type", "sku_size", "tags"], notes: "AVM fallback for Azure Virtual Machine." },
  { resourceType: "vmss", provider: "azure", moduleSource: "Azure/avm-res-compute-virtualmachinescaleset/azurerm", version: "0.9.0", requiredInputs: ["extension_protected_setting", "location", "name", "parent_id", "user_data_base64"], optionalInputs: ["admin_password", "network_interface", "os_profile", "sku_name", "tags", "zones"], notes: "AVM fallback for Azure Virtual Machine Scale Set." },
  { resourceType: "container-app", provider: "azure", moduleSource: "Azure/avm-res-app-containerapp/azurerm", version: "0.9.0", requiredInputs: ["container_app_environment_resource_id", "name", "resource_group_name", "template"], optionalInputs: ["resource_group_id", "tags"], notes: "AVM fallback for Azure Container App." },
  { resourceType: "dns-zone", provider: "azure", moduleSource: "Azure/avm-res-network-dnszone/azurerm", version: "0.2.1", requiredInputs: ["name", "resource_group_name"], optionalInputs: ["tags"], notes: "AVM fallback for public DNS zone." },
  { resourceType: "private-dns-zone", provider: "azure", moduleSource: "Azure/avm-res-network-privatednszone/azurerm", version: "0.5.0", requiredInputs: ["domain_name", "parent_id"], optionalInputs: ["tags", "virtual_network_links"], notes: "AVM fallback for private DNS zone." },
  { resourceType: "public-ip", provider: "azure", moduleSource: "Azure/avm-res-network-publicipaddress/azurerm", version: "0.2.1", requiredInputs: ["location", "name", "resource_group_name"], optionalInputs: ["diagnostic_settings", "sku", "sku_tier", "tags", "zones"], notes: "AVM fallback for Public IP Address." },
  { resourceType: "expressroute", provider: "azure", moduleSource: "Azure/avm-res-network-expressroutecircuit/azurerm", version: "0.3.3", requiredInputs: ["location", "name", "resource_group_name", "sku"], optionalInputs: ["diagnostic_settings", "tags"], notes: "AVM fallback for ExpressRoute circuit." },
  { resourceType: "traffic-manager", provider: "azure", moduleSource: "Azure/avm-res-network-trafficmanagerprofile/azurerm", version: "0.1.0", requiredInputs: ["dns_config", "monitor_config", "name", "resource_group_name", "traffic_routing_method"], optionalInputs: ["diagnostic_settings", "tags"], notes: "AVM fallback for Traffic Manager profile." },
  { resourceType: "logic-app", provider: "azure", moduleSource: "Azure/avm-res-logic-workflow/azurerm", version: "0.1.2", requiredInputs: ["location", "name", "resource_group_id", "resource_group_name"], optionalInputs: ["diagnostic_settings", "tags"], notes: "AVM fallback for Logic App workflow." },
  { resourceType: "synapse", provider: "azure", moduleSource: "Azure/avm-res-synapse-workspace/azurerm", version: "0.1.0", requiredInputs: ["location", "name", "resource_group_name", "sql_administrator_login_password", "storage_data_lake_gen2_filesystem_id"], optionalInputs: ["public_network_access_enabled", "sql_administrator_login", "tags"], notes: "AVM fallback for Synapse workspace." },
  { resourceType: "databricks", provider: "azure", moduleSource: "Azure/avm-res-databricks-workspace/azurerm", version: "0.5.0", requiredInputs: ["location", "name", "resource_group_name", "sku"], optionalInputs: ["diagnostic_settings", "public_network_access_enabled", "tags"], notes: "AVM fallback for Databricks workspace." },
  { resourceType: "log-analytics", provider: "azure", moduleSource: "Azure/avm-res-operationalinsights-workspace/azurerm", version: "0.5.1", requiredInputs: ["location", "name", "resource_group_name"], optionalInputs: ["diagnostic_settings", "log_analytics_workspace_retention_in_days", "log_analytics_workspace_sku", "tags"], notes: "AVM fallback for Log Analytics workspace." },
  { resourceType: "app-insights", provider: "azure", moduleSource: "Azure/avm-res-insights-component/azurerm", version: "0.4.0", requiredInputs: ["location", "name", "resource_group_name", "workspace_id"], optionalInputs: ["diagnostic_settings", "tags"], notes: "AVM fallback for Application Insights." },
  { resourceType: "managed-identity", provider: "azure", moduleSource: "Azure/avm-res-managedidentity-userassignedidentity/azurerm", version: "0.5.0", requiredInputs: ["location", "name", "resource_group_name"], optionalInputs: ["tags"], notes: "AVM fallback for user-assigned managed identity." },
  { resourceType: "role-assignment", provider: "azure", moduleSource: "Azure/avm-res-authorization-roleassignment/azurerm", version: "0.3.0", requiredInputs: [], optionalInputs: ["role_assignments_for_resource_groups"], notes: "AVM fallback for Azure role assignment." },
  { resourceType: "recovery-services-vault", provider: "azure", moduleSource: "Azure/avm-res-recoveryservices-vault/azurerm", version: "1.1.3", requiredInputs: ["location", "name", "resource_group_name", "sku"], optionalInputs: ["diagnostic_settings", "public_network_access_enabled", "tags"], notes: "AVM fallback for Recovery Services Vault." },
  { resourceType: "automation-account", provider: "azure", moduleSource: "Azure/avm-res-automation-automationaccount/azurerm", version: "0.2.0", requiredInputs: ["location", "name", "resource_group_name", "sku"], optionalInputs: ["diagnostic_settings", "public_network_access_enabled", "tags"], notes: "AVM fallback for Automation Account." },
  { resourceType: "cognitive-services", provider: "azure", moduleSource: "Azure/avm-res-cognitiveservices-account/azurerm", version: "0.11.0", requiredInputs: ["kind", "location", "name", "parent_id", "sku_name"], optionalInputs: ["diagnostic_settings", "public_network_access_enabled", "tags"], notes: "AVM fallback for Azure Cognitive Services account." },
  { resourceType: "azure-openai", provider: "azure", moduleSource: "Azure/avm-res-cognitiveservices-account/azurerm", version: "0.11.0", requiredInputs: ["kind", "location", "name", "parent_id", "sku_name"], optionalInputs: ["diagnostic_settings", "public_network_access_enabled", "tags"], notes: "AVM fallback for Azure OpenAI account." },
  { resourceType: "machine-learning", provider: "azure", moduleSource: "Azure/avm-res-machinelearningservices-workspace/azurerm", version: "0.9.0", requiredInputs: ["location", "name", "resource_group_name"], optionalInputs: ["diagnostic_settings", "public_network_access_enabled", "tags"], notes: "AVM fallback for Azure Machine Learning workspace." },
  ...azureComponentDefinitions
    .filter((definition) => !["vpc", "security-group", "eks", "rds", "redis", "alb", "storage-account", "key-vault", "app-service", "function-app", "container-registry", "private-endpoint", "nat-gateway", "bastion", "vpn-gateway", "firewall", "route-table", "load-balancer", "mysql", "mssql", "cosmos-db", "event-hub", "service-bus", "api-management", "data-factory", "event-grid", "dashboard", "defender", "aci", "front-door", "cdn", "ai-search", "vm", "vmss", "container-app", "dns-zone", "private-dns-zone", "public-ip", "expressroute", "traffic-manager", "logic-app", "synapse", "databricks", "log-analytics", "app-insights", "managed-identity", "role-assignment", "recovery-services-vault", "automation-account", "cognitive-services", "azure-openai", "machine-learning"].includes(definition.type))
    .map((definition): ModuleMapping => ({
      resourceType: definition.type,
      provider: "azure",
      moduleSource: `./modules/azure-${definition.type}`,
      version: "local",
      requiredInputs: ["name", "resource_group_name", "location"],
      optionalInputs: ["sku", "capacity", "public_network_access_enabled", "private_endpoint_enabled", "tags"],
      notes: "Local Azure service template placeholder. Replace with a registry module when selected for production hardening."
    }))
];

export const defaultAzureProject: ProjectState = {
  id: "project_azure_saas",
  name: "startup-saas",
  provider: "azure",
  environment: "prod",
  region: "eastus",
  remoteStateBucket: "tfstateprod",
  owner: "platform",
  costCenter: "cc-1001",
  components: [
    { id: "cmp_azure_vnet", type: "vpc", name: "network", enabled: true, config: { cidr: "10.60.0.0/16", azCount: 3, enableNatGateway: true } },
    { id: "cmp_azure_nsg", type: "security-group", name: "baseline-nsg", enabled: true, config: { allowedCidrBlocks: ["10.60.0.0/16"], enableSsh: false } },
    { id: "cmp_azure_aks", type: "eks", name: "app-cluster", enabled: true, config: { clusterVersion: "1.31", nodeInstanceType: "Standard_D4s_v5", minNodes: 3, maxNodes: 12, privateEndpoint: true } },
    { id: "cmp_azure_pg", type: "rds", name: "postgres", enabled: true, config: { engineVersion: "16", instanceClass: "D2ds_v5", allocatedStorage: 128, multiAz: true } }
  ]
};
