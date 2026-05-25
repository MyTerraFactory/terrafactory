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

function genericAzureFields(extra?: ComponentDefinition["fields"]): ComponentDefinition["fields"] {
  return [
    { key: "sku", label: "SKU / tier", type: "text", required: true, placeholder: "Standard", help: "Provider-specific SKU, tier, or capacity family." },
    { key: "replicas", label: "Capacity", type: "number", required: true, min: 1, max: 1000, help: "Instance count, capacity units, partitions, or equivalent scale setting." },
    { key: "publicAccess", label: "Public access", type: "boolean", help: "Keep disabled for private production services unless an edge service requires it." },
    { key: "privateEndpoint", label: "Private endpoint", type: "boolean", help: "Adds private connectivity wiring where the module supports it." },
    { key: "zoneMode", label: "Zone mode", type: "select", required: true, help: "Availability and placement strategy.", options: azureLocationOptions },
    ...(extra ?? []),
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
    { key: "image", label: "Image", type: "select", required: true, help: "Base OS image.", options: [{ label: "Ubuntu 24.04 LTS", value: "Ubuntu2404" }, { label: "Windows Server 2022", value: "Windows2022" }, { label: "RHEL 9", value: "RHEL9" }] },
    { key: "adminUsername", label: "Admin username", type: "text", required: true, placeholder: "azureuser", help: "Admin username for the VM." }
  ]),
  service("vmss", "Virtual Machine Scale Set", "Autoscaling compute pool for stateless workloads.", 10, [
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
  { resourceType: "vpc", provider: "azure", moduleSource: "claranet/vnet/azurerm", version: "8.1.3", requiredInputs: ["client_name", "environment", "location", "resource_group_name", "stack", "vnet_cidr"], optionalInputs: ["extra_tags", "subnets"], notes: "Claranet Azure VNet module." },
  { resourceType: "security-group", provider: "azure", moduleSource: "claranet/nsg/azurerm", version: "8.0.2", requiredInputs: ["client_name", "environment", "location", "location_short", "resource_group_name", "stack"], optionalInputs: ["deny_all_inbound", "extra_tags", "source_address_prefixes", "ssh_inbound_allowed"], notes: "Claranet NSG module with default deny posture." },
  { resourceType: "eks", provider: "azure", moduleSource: "claranet/aks-light/azurerm", version: "8.15.0", requiredInputs: ["client_name", "environment", "location", "resource_group_name", "stack"], optionalInputs: ["extra_tags", "kubernetes_version", "node_pools", "private_cluster_enabled", "vnet_subnet_id"], notes: "Claranet AKS Light module." },
  { resourceType: "rds", provider: "azure", moduleSource: "claranet/db-postgresql-flexible/azurerm", version: "8.5.1", requiredInputs: ["administrator_login", "allowed_cidrs", "client_name", "environment", "location", "resource_group_name", "stack"], optionalInputs: ["administrator_password", "backup_retention_days", "delegated_subnet_id", "extra_tags", "maintenance_window", "postgresql_version", "public_network_access_enabled", "size", "standby_zone", "storage_mb"], notes: "Claranet PostgreSQL Flexible Server module." },
  { resourceType: "redis", provider: "azure", moduleSource: "claranet/redis/azurerm", version: "8.1.4", requiredInputs: ["client_name", "environment", "location", "resource_group_name", "stack"], optionalInputs: ["capacity", "extra_tags", "minimum_tls_version", "sku_name", "subnet_id"], notes: "Claranet Azure Redis module." },
  { resourceType: "alb", provider: "azure", moduleSource: "claranet/app-gateway/azurerm", version: "7.4.2", requiredInputs: ["client_name", "environment", "location", "resource_group_name", "stack"], optionalInputs: ["backend_fqdn", "certificate_secret_id", "extra_tags", "subnet_id", "waf_configuration"], notes: "Claranet Application Gateway module." },
  ...azureComponentDefinitions
    .filter((definition) => !["vpc", "security-group", "eks", "rds", "redis", "alb"].includes(definition.type))
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
