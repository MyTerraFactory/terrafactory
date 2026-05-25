import type { ComponentDefinition, ModuleMapping, ProjectState } from "@/lib/types";

const gcpOptionalFields: ComponentDefinition["fields"] = [
  { key: "enableEncryption", label: "Encryption", type: "boolean", help: "Enable encryption and customer-managed key wiring where supported." },
  { key: "backupRetentionDays", label: "Backup retention days", type: "number", min: 0, max: 365, help: "Backup or recovery retention period. Use 0 for stateless services." },
  { key: "deletionProtection", label: "Deletion protection", type: "boolean", help: "Protect stateful production resources from accidental deletion." },
  { key: "enableMonitoring", label: "Monitoring", type: "boolean", help: "Enable metrics, alerts, and managed service telemetry." },
  { key: "enableAuditLogs", label: "Audit logs", type: "boolean", help: "Enable data access or admin activity log configuration where supported." },
  { key: "maintenanceWindow", label: "Maintenance window", type: "text", placeholder: "SUN:04:00", help: "Preferred maintenance window for managed services." },
  { key: "privateDns", label: "Private DNS", type: "boolean", help: "Create or associate private DNS records for private services." },
  { key: "autoscaling", label: "Autoscaling", type: "boolean", help: "Enable autoscaling policy scaffolding where supported." },
  { key: "minCapacity", label: "Min capacity", type: "number", min: 0, max: 10000, help: "Minimum autoscaling capacity." },
  { key: "maxCapacity", label: "Max capacity", type: "number", min: 1, max: 10000, help: "Maximum autoscaling capacity." },
  { key: "dataClassification", label: "Data classification", type: "select", help: "Governance classification label.", options: [{ label: "Public", value: "public" }, { label: "Internal", value: "internal" }, { label: "Confidential", value: "confidential" }, { label: "Restricted", value: "restricted" }] },
  { key: "costAllocationTag", label: "Cost allocation label", type: "text", placeholder: "platform-core", help: "Additional cost allocation label value." }
];

export const gcpComponentDefinitions: ComponentDefinition[] = [
  {
    type: "vpc",
    label: "VPC / Networking",
    description: "Custom mode VPC with private service access, subnets, and Cloud NAT-ready layout.",
    provider: "gcp",
    icon: "Network",
    estimatedResources: 10,
    fields: [
      { key: "cidr", label: "Primary subnet CIDR", type: "text", required: true, placeholder: "10.80.0.0/16", help: "Primary RFC1918 range for the regional subnet." },
      { key: "azCount", label: "Zones", type: "number", required: true, min: 2, max: 4, help: "Used for regional GKE node distribution." },
      { key: "enableNatGateway", label: "Cloud NAT", type: "boolean", help: "Provides outbound internet access for private workloads." },
      ...gcpOptionalFields
    ]
  },
  {
    type: "security-group",
    label: "Firewall Rules",
    description: "Least-privilege VPC firewall baseline for ingress and admin access.",
    provider: "gcp",
    icon: "Shield",
    estimatedResources: 4,
    fields: [
      { key: "allowedCidrBlocks", label: "Allowed CIDRs", type: "cidr-list", required: true, help: "Ingress source ranges for public edge services." },
      { key: "enableSsh", label: "SSH access", type: "boolean", help: "Disabled by default; prefer IAP TCP forwarding." },
      ...gcpOptionalFields
    ],
    dependsOn: ["vpc"]
  },
  {
    type: "eks",
    label: "GKE Cluster",
    description: "Private regional GKE cluster with autoscaling node pools.",
    provider: "gcp",
    icon: "Boxes",
    estimatedResources: 22,
    fields: [
      { key: "clusterVersion", label: "Release channel", type: "select", required: true, help: "GKE release channel.", options: [{ label: "Regular", value: "REGULAR" }, { label: "Stable", value: "STABLE" }, { label: "Rapid", value: "RAPID" }] },
      { key: "nodeInstanceType", label: "Node machine type", type: "select", required: true, help: "Default node pool machine type.", options: [{ label: "e2-standard-4", value: "e2-standard-4" }, { label: "n2-standard-4", value: "n2-standard-4" }, { label: "n2-standard-8", value: "n2-standard-8" }] },
      { key: "minNodes", label: "Min nodes", type: "number", required: true, min: 1, max: 20, help: "Minimum autoscaling nodes per region." },
      { key: "maxNodes", label: "Max nodes", type: "number", required: true, min: 2, max: 100, help: "Maximum autoscaling nodes per region." },
      { key: "privateEndpoint", label: "Private nodes", type: "boolean", help: "Creates private worker nodes and limits public exposure." },
      ...gcpOptionalFields
    ],
    dependsOn: ["vpc", "security-group"]
  },
  {
    type: "rds",
    label: "Cloud SQL PostgreSQL",
    description: "Cloud SQL PostgreSQL with HA, private IP, backups, and deletion protection.",
    provider: "gcp",
    icon: "Database",
    estimatedResources: 8,
    fields: [
      { key: "engineVersion", label: "Engine version", type: "select", required: true, help: "Pinned PostgreSQL major version.", options: [{ label: "16", value: "POSTGRES_16" }, { label: "15", value: "POSTGRES_15" }, { label: "14", value: "POSTGRES_14" }] },
      { key: "instanceClass", label: "Tier", type: "select", required: true, help: "Cloud SQL machine tier.", options: [{ label: "db-custom-2-8192", value: "db-custom-2-8192" }, { label: "db-custom-4-16384", value: "db-custom-4-16384" }] },
      { key: "allocatedStorage", label: "Storage GB", type: "number", required: true, min: 20, max: 4096, help: "SSD storage allocation." },
      { key: "multiAz", label: "Regional HA", type: "boolean", help: "Uses REGIONAL availability type for production." },
      ...gcpOptionalFields
    ],
    dependsOn: ["vpc", "security-group"]
  },
  {
    type: "redis",
    label: "Memorystore Redis",
    description: "Managed Redis with private connectivity and TLS-ready client posture.",
    provider: "gcp",
    icon: "Zap",
    estimatedResources: 5,
    fields: [
      { key: "nodeType", label: "Tier", type: "select", required: true, help: "Memorystore availability tier.", options: [{ label: "STANDARD_HA", value: "STANDARD_HA" }, { label: "BASIC", value: "BASIC" }] },
      { key: "replicas", label: "Memory GB", type: "number", required: true, min: 1, max: 300, help: "Redis memory size in GB." },
      { key: "transitEncryption", label: "Transit encryption", type: "boolean", help: "Sets transit encryption mode when supported." },
      ...gcpOptionalFields
    ],
    dependsOn: ["vpc", "security-group"]
  },
  {
    type: "alb",
    label: "Cloud Load Balancer",
    description: "Global HTTPS load balancer with managed certificate and optional Cloud Armor policy.",
    provider: "gcp",
    icon: "Router",
    estimatedResources: 13,
    fields: [
      { key: "domainName", label: "Domain name", type: "text", required: true, placeholder: "app.example.com", help: "DNS name for the HTTPS load balancer." },
      { key: "enableWaf", label: "Cloud Armor", type: "boolean", help: "Adds a security policy for public edge traffic." },
      { key: "certificateArn", label: "Certificate map entry", type: "text", placeholder: "projects/.../locations/global/certificateMaps/...", help: "Existing Certificate Manager certificate map entry." },
      ...gcpOptionalFields
    ],
    dependsOn: ["vpc", "security-group"]
  }
];

export const gcpModuleMappings: ModuleMapping[] = [
  { resourceType: "vpc", provider: "gcp", moduleSource: "terraform-google-modules/network/google", version: "~> 10.0", requiredInputs: ["project_id", "network_name", "subnets"], optionalInputs: ["routes"], notes: "Maintained Google module; Claranet registry has limited GCP coverage." },
  { resourceType: "security-group", provider: "gcp", moduleSource: "terraform-google-modules/network/google//modules/firewall-rules", version: "~> 10.0", requiredInputs: ["project_id", "network_name", "rules"], optionalInputs: [], notes: "Firewall rules submodule from the Google network module." },
  { resourceType: "eks", provider: "gcp", moduleSource: "terraform-google-modules/kubernetes-engine/google", version: "~> 44.0", requiredInputs: ["project_id", "name", "region", "network", "subnetwork"], optionalInputs: ["node_pools", "release_channel"], notes: "Maintained GKE module." },
  { resourceType: "rds", provider: "gcp", moduleSource: "GoogleCloudPlatform/sql-db/google//modules/postgresql", version: "~> 26.0", requiredInputs: ["project_id", "name", "database_version", "region"], optionalInputs: ["availability_type", "tier", "disk_size"], notes: "Partner Cloud SQL PostgreSQL module." },
  { resourceType: "redis", provider: "gcp", moduleSource: "./modules/gcp-memorystore-redis", version: "local", requiredInputs: ["project_id", "name", "region"], optionalInputs: ["tier", "memory_size_gb", "transit_encryption_mode"], notes: "Local template until a preferred registry module is selected." },
  { resourceType: "alb", provider: "gcp", moduleSource: "terraform-google-modules/lb-http/google", version: "~> 12.0", requiredInputs: ["project", "name", "backends"], optionalInputs: ["ssl", "managed_ssl_certificate_domains"], notes: "Maintained Google HTTPS load balancer module." }
];

export const defaultGcpProject: ProjectState = {
  id: "project_gcp_saas",
  name: "startup-saas",
  provider: "gcp",
  environment: "prod",
  region: "us-central1",
  remoteStateBucket: "company-terraform-state",
  owner: "platform",
  costCenter: "cc-1001",
  components: [
    { id: "cmp_gcp_vpc", type: "vpc", name: "network", enabled: true, config: { cidr: "10.80.0.0/16", azCount: 3, enableNatGateway: true } },
    { id: "cmp_gcp_fw", type: "security-group", name: "baseline-firewall", enabled: true, config: { allowedCidrBlocks: ["10.80.0.0/16"], enableSsh: false } },
    { id: "cmp_gcp_gke", type: "eks", name: "app-cluster", enabled: true, config: { clusterVersion: "REGULAR", nodeInstanceType: "e2-standard-4", minNodes: 3, maxNodes: 12, privateEndpoint: true } },
    { id: "cmp_gcp_sql", type: "rds", name: "postgres", enabled: true, config: { engineVersion: "POSTGRES_16", instanceClass: "db-custom-2-8192", allocatedStorage: 100, multiAz: true } }
  ]
};
