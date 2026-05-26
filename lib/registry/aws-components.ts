import type { ComponentDefinition, ComponentType, ModuleMapping, ProjectState } from "@/lib/types";

const awsPlacementOptions = [
  { label: "Regional", value: "regional" },
  { label: "Multi-AZ", value: "multi-az" },
  { label: "Global", value: "global" }
];

const awsOptionalFields: ComponentDefinition["fields"] = [
  { key: "enableEncryption", label: "Encryption", type: "boolean", help: "Enable provider-managed or customer-managed encryption where supported." },
  { key: "backupRetentionDays", label: "Backup retention days", type: "number", min: 0, max: 365, help: "Backup or recovery retention period. Use 0 for stateless services." },
  { key: "deletionProtection", label: "Deletion protection", type: "boolean", help: "Protect stateful production resources from accidental deletion." },
  { key: "enableMonitoring", label: "Monitoring", type: "boolean", help: "Enable metrics, alarms, and health telemetry where supported." },
  { key: "enableAuditLogs", label: "Audit logs", type: "boolean", help: "Enable service, access, or control-plane logging where supported." },
  { key: "maintenanceWindow", label: "Maintenance window", type: "text", placeholder: "sun:04:00-sun:05:00", help: "Preferred maintenance window for managed services." },
  { key: "privateDns", label: "Private DNS", type: "boolean", help: "Create or associate private DNS records for private endpoints." },
  { key: "autoscaling", label: "Autoscaling", type: "boolean", help: "Enable autoscaling policy scaffolding where supported." },
  { key: "minCapacity", label: "Min capacity", type: "number", min: 0, max: 10000, help: "Minimum autoscaling capacity." },
  { key: "maxCapacity", label: "Max capacity", type: "number", min: 1, max: 10000, help: "Maximum autoscaling capacity." },
  { key: "dataClassification", label: "Data classification", type: "select", help: "Governance classification tag.", options: [{ label: "Public", value: "public" }, { label: "Internal", value: "internal" }, { label: "Confidential", value: "confidential" }, { label: "Restricted", value: "restricted" }] },
  { key: "costAllocationTag", label: "Cost allocation tag", type: "text", placeholder: "platform-core", help: "Additional cost allocation tag value." }
];

function genericAwsFields(extra?: ComponentDefinition["fields"]): ComponentDefinition["fields"] {
  return [
    { key: "sku", label: "Class / tier", type: "text", required: true, placeholder: "standard", help: "Service class, instance family, tier, or runtime setting." },
    { key: "replicas", label: "Capacity", type: "number", required: true, min: 1, max: 10000, help: "Instance count, shards, partitions, capacity units, or equivalent scale setting." },
    { key: "publicAccess", label: "Public access", type: "boolean", help: "Keep disabled for private production resources unless this is an edge service." },
    { key: "privateEndpoint", label: "Private connectivity", type: "boolean", help: "Adds VPC, subnet, endpoint, or private networking wiring where supported." },
    { key: "zoneMode", label: "Placement", type: "select", required: true, help: "Availability and placement strategy.", options: awsPlacementOptions },
    ...(extra ?? []),
    ...awsOptionalFields
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
    provider: "aws",
    icon: "Box",
    estimatedResources,
    fields: genericAwsFields(extra),
    dependsOn
  };
}

export const awsComponentDefinitions: ComponentDefinition[] = [
  {
    type: "vpc",
    label: "VPC / Networking",
    description: "Multi-AZ VPC with public, private, and database subnet tiers.",
    provider: "aws",
    icon: "Network",
    estimatedResources: 18,
    fields: [
      { key: "cidr", label: "CIDR block", type: "text", required: true, placeholder: "10.40.0.0/16", help: "Primary RFC1918 network range for the VPC." },
      { key: "azCount", label: "Availability zones", type: "number", required: true, min: 2, max: 4, help: "Production stacks should use at least two AZs." },
      { key: "enableNatGateway", label: "NAT gateways", type: "boolean", help: "Creates outbound internet paths for private subnets." },
      ...awsOptionalFields
    ]
  },
  {
    type: "security-group",
    label: "Security Groups",
    description: "Least-privilege network policies for application and data tiers.",
    provider: "aws",
    icon: "Shield",
    estimatedResources: 4,
    fields: [
      { key: "allowedCidrBlocks", label: "Allowed CIDRs", type: "cidr-list", required: true, help: "Ingress sources for public-facing entry points." },
      { key: "enableSsh", label: "SSH access", type: "boolean", help: "Disabled by default; prefer SSM Session Manager." },
      ...awsOptionalFields
    ],
    dependsOn: ["vpc"]
  },
  {
    type: "eks",
    label: "EKS Cluster",
    description: "Private endpoint-ready EKS cluster with managed node groups.",
    provider: "aws",
    icon: "Boxes",
    estimatedResources: 34,
    fields: [
      { key: "clusterVersion", label: "Kubernetes version", type: "select", required: true, help: "Use a supported EKS control plane version.", options: [{ label: "1.31", value: "1.31" }, { label: "1.30", value: "1.30" }, { label: "1.29", value: "1.29" }] },
      { key: "nodeInstanceType", label: "Node type", type: "select", required: true, help: "Default node group instance family.", options: [{ label: "m6i.large", value: "m6i.large" }, { label: "m7i.large", value: "m7i.large" }, { label: "t3.large", value: "t3.large" }] },
      { key: "minNodes", label: "Min nodes", type: "number", required: true, min: 1, max: 20, help: "Minimum autoscaling node count." },
      { key: "maxNodes", label: "Max nodes", type: "number", required: true, min: 2, max: 100, help: "Maximum autoscaling node count." },
      { key: "privateEndpoint", label: "Private API endpoint", type: "boolean", help: "Restrict Kubernetes API access to the VPC." },
      ...awsOptionalFields
    ],
    dependsOn: ["vpc", "security-group"]
  },
  {
    type: "rds",
    label: "Managed PostgreSQL",
    description: "Encrypted RDS PostgreSQL with backups and subnet isolation.",
    provider: "aws",
    icon: "Database",
    estimatedResources: 9,
    fields: [
      { key: "engineVersion", label: "Engine version", type: "select", required: true, help: "Pinned PostgreSQL major version.", options: [{ label: "16", value: "16" }, { label: "15", value: "15" }, { label: "14", value: "14" }] },
      { key: "instanceClass", label: "Instance class", type: "select", required: true, help: "Compute class for the database.", options: [{ label: "db.t4g.medium", value: "db.t4g.medium" }, { label: "db.m7g.large", value: "db.m7g.large" }] },
      { key: "allocatedStorage", label: "Storage GB", type: "number", required: true, min: 20, max: 4096, help: "Encrypted allocated storage." },
      { key: "multiAz", label: "Multi-AZ", type: "boolean", help: "Recommended for production workloads." },
      ...awsOptionalFields
    ],
    dependsOn: ["vpc", "security-group"]
  },
  {
    type: "redis",
    label: "Redis Cache",
    description: "ElastiCache Redis replication group in private subnets.",
    provider: "aws",
    icon: "Zap",
    estimatedResources: 7,
    fields: [
      { key: "nodeType", label: "Node type", type: "select", required: true, help: "Cache node family.", options: [{ label: "cache.t4g.micro", value: "cache.t4g.micro" }, { label: "cache.t4g.small", value: "cache.t4g.small" }, { label: "cache.m7g.large", value: "cache.m7g.large" }] },
      { key: "replicas", label: "Replicas", type: "number", required: true, min: 0, max: 5, help: "Number of read replicas." },
      { key: "transitEncryption", label: "TLS in transit", type: "boolean", help: "Encrypts client-to-cache traffic." },
      ...awsOptionalFields
    ],
    dependsOn: ["vpc", "security-group"]
  },
  {
    type: "alb",
    label: "Application Load Balancer",
    description: "Internet-facing ALB with HTTPS listener and target groups.",
    provider: "aws",
    icon: "Router",
    estimatedResources: 12,
    fields: [
      { key: "domainName", label: "Domain name", type: "text", required: true, placeholder: "app.example.com", help: "DNS name to route to the load balancer." },
      { key: "enableWaf", label: "AWS WAF", type: "boolean", help: "Adds a managed WAF policy to the public edge." },
      { key: "certificateArn", label: "ACM certificate ARN", type: "text", placeholder: "arn:aws:acm:...", help: "Existing certificate ARN for HTTPS." },
      ...awsOptionalFields
    ],
    dependsOn: ["vpc", "security-group"]
  },
  service("ec2", "EC2 Instance", "Virtual machine with EBS, IAM profile, security group, and private subnet placement.", 8, [
    { key: "image", label: "AMI family", type: "select", required: true, help: "Base operating system family.", options: [{ label: "Amazon Linux 2023", value: "al2023" }, { label: "Ubuntu 24.04", value: "ubuntu-2404" }, { label: "Windows Server 2022", value: "windows-2022" }] }
  ]),
  service("autoscaling-group", "Auto Scaling Group", "EC2 autoscaling group with launch template and health checks.", 10, [
    { key: "minNodes", label: "Min instances", type: "number", required: true, min: 1, max: 500, help: "Minimum autoscaling group size." },
    { key: "maxNodes", label: "Max instances", type: "number", required: true, min: 1, max: 1000, help: "Maximum autoscaling group size." }
  ]),
  service("lambda", "Lambda Function", "Serverless function with IAM role, logs, tracing, and optional VPC access.", 7, [
    { key: "runtime", label: "Runtime", type: "select", required: true, help: "Lambda runtime.", options: [{ label: "Node.js 22", value: "nodejs22.x" }, { label: "Python 3.13", value: "python3.13" }, { label: "Java 21", value: "java21" }, { label: ".NET 8", value: "dotnet8" }] }
  ], ["security-group"]),
  service("ecs", "ECS Cluster", "Elastic Container Service cluster with capacity providers and service discovery readiness.", 9),
  service("fargate-service", "ECS Fargate Service", "Serverless container service with autoscaling, ALB integration, and logs.", 11, [
    { key: "containerImage", label: "Container image", type: "text", required: true, placeholder: "public.ecr.aws/nginx/nginx:latest", help: "Container image URI." }
  ], ["ecs", "security-group"]),
  service("ecr", "Elastic Container Registry", "Private container registry with lifecycle policies and image scanning.", 5, undefined, []),
  service("batch", "AWS Batch", "Managed batch compute environment and job queue.", 8),
  service("lightsail", "Lightsail", "Simple VPS-style compute for small workloads.", 5, undefined, []),
  service("s3-bucket", "S3 Bucket", "Object storage bucket with encryption, versioning, lifecycle, and public access block.", 6, [
    { key: "versioning", label: "Versioning", type: "boolean", help: "Enable object versioning." }
  ], []),
  service("efs", "EFS File System", "Elastic file system for shared POSIX storage.", 7),
  service("fsx", "FSx File System", "Managed Windows, Lustre, NetApp ONTAP, or OpenZFS file system.", 8, [
    { key: "fileSystemType", label: "File system type", type: "select", required: true, help: "FSx engine.", options: [{ label: "Windows", value: "WINDOWS" }, { label: "Lustre", value: "LUSTRE" }, { label: "ONTAP", value: "ONTAP" }, { label: "OpenZFS", value: "OPENZFS" }] }
  ]),
  service("backup-vault", "Backup Vault", "AWS Backup vault with encryption and access policy.", 5, undefined, []),
  service("dynamodb", "DynamoDB", "Serverless NoSQL table with PITR, streams, and autoscaling-ready capacity.", 7, [
    { key: "partitionKey", label: "Partition key", type: "text", required: true, placeholder: "pk", help: "Primary partition key attribute." }
  ], []),
  service("aurora", "Aurora Cluster", "Amazon Aurora cluster with private subnets, backups, and deletion protection.", 10),
  service("documentdb", "DocumentDB", "MongoDB-compatible managed document database.", 9),
  service("neptune", "Neptune", "Managed graph database cluster.", 9),
  service("redshift", "Redshift", "Managed data warehouse cluster or serverless namespace.", 10),
  service("opensearch", "OpenSearch Service", "Managed search and analytics domain with encryption and VPC access.", 9),
  service("memorydb", "MemoryDB", "Redis-compatible durable in-memory database.", 8),
  service("msk", "Managed Kafka", "Amazon MSK Kafka cluster with private connectivity and monitoring.", 11),
  service("sqs", "SQS Queue", "Managed message queue with DLQ and encryption.", 4, [
    { key: "fifo", label: "FIFO queue", type: "boolean", help: "Enable FIFO semantics." }
  ], []),
  service("sns", "SNS Topic", "Pub/sub topic with encryption and subscription hooks.", 4, undefined, []),
  service("eventbridge", "EventBridge Bus", "Event bus with routing rules and archive readiness.", 5, undefined, []),
  service("step-functions", "Step Functions", "Managed workflow state machine with IAM and logs.", 6, undefined, ["iam-role"]),
  service("api-gateway", "API Gateway", "REST or HTTP API front door with stages, logging, and auth hooks.", 8, [
    { key: "apiType", label: "API type", type: "select", required: true, help: "API Gateway flavor.", options: [{ label: "HTTP API", value: "HTTP" }, { label: "REST API", value: "REST" }, { label: "WebSocket API", value: "WEBSOCKET" }] }
  ], []),
  service("appsync", "AppSync", "Managed GraphQL API with auth, logging, and data source hooks.", 7, undefined, []),
  service("cloudfront", "CloudFront Distribution", "Global CDN distribution with TLS, cache policies, and origin access.", 9, [
    { key: "domainName", label: "Domain name", type: "text", required: true, placeholder: "app.example.com", help: "Custom domain served by CloudFront." }
  ], []),
  service("route53", "Route 53 Zone", "Public or private DNS hosted zone with record-set readiness.", 5, [
    { key: "zoneName", label: "Zone name", type: "text", required: true, placeholder: "example.com", help: "Hosted zone name." }
  ], []),
  service("acm", "ACM Certificate", "TLS certificate request and DNS validation records.", 5, [
    { key: "domainName", label: "Domain name", type: "text", required: true, placeholder: "app.example.com", help: "Certificate subject name." }
  ], ["route53"]),
  service("waf", "AWS WAF", "Managed web ACL with AWS managed rule groups.", 6, undefined, []),
  service("shield", "AWS Shield", "DDoS protection subscription and protected resource wiring.", 4, undefined, []),
  service("transit-gateway", "Transit Gateway", "Central VPC and VPN routing hub.", 8, undefined, ["vpc"]),
  service("direct-connect", "Direct Connect", "Dedicated network connection resources and gateway wiring.", 7, undefined, []),
  service("client-vpn", "Client VPN", "Managed client VPN endpoint for private access.", 8, undefined, ["vpc", "security-group"]),
  service("vpc-endpoint", "VPC Endpoint", "Gateway or interface endpoint for private AWS service access.", 5, [
    { key: "serviceName", label: "Service name", type: "text", required: true, placeholder: "com.amazonaws.us-east-1.s3", help: "AWS endpoint service name." }
  ], ["vpc", "security-group"]),
  service("iam-role", "IAM Role", "Least-privilege IAM role with trust policy and managed policy attachments.", 4, [
    { key: "principalService", label: "Principal service", type: "text", required: true, placeholder: "lambda.amazonaws.com", help: "Service principal allowed to assume the role." }
  ], []),
  service("kms-key", "KMS Key", "Customer managed KMS key with rotation and aliases.", 5, undefined, []),
  service("secrets-manager", "Secrets Manager", "Managed secret with KMS encryption and rotation hooks.", 5, undefined, ["kms-key"]),
  service("ssm-parameter", "SSM Parameter", "Parameter Store value with optional SecureString encryption.", 4, undefined, ["kms-key"]),
  service("cognito", "Cognito", "User pool and app client for authentication.", 7, undefined, []),
  service("guardduty", "GuardDuty", "Threat detection detector and organization settings.", 4, undefined, []),
  service("security-hub", "Security Hub", "Security posture aggregation and standards enablement.", 4, undefined, []),
  service("config", "AWS Config", "Configuration recorder and compliance delivery channel.", 5, undefined, ["s3-bucket"]),
  service("cloudtrail", "CloudTrail", "Audit trail with encrypted S3 delivery and log validation.", 6, undefined, ["s3-bucket", "kms-key"]),
  service("cloudwatch", "CloudWatch", "Log groups, metric alarms, and dashboards.", 5, undefined, []),
  service("xray", "X-Ray", "Distributed tracing group and sampling rules.", 4, undefined, []),
  service("managed-prometheus", "Managed Prometheus", "Amazon Managed Service for Prometheus workspace.", 5, undefined, []),
  service("managed-grafana", "Managed Grafana", "Amazon Managed Grafana workspace.", 5, undefined, ["managed-prometheus"]),
  service("glue", "AWS Glue", "Data catalog database and ETL job scaffolding.", 7, undefined, ["s3-bucket", "iam-role"]),
  service("athena", "Athena", "Serverless query workgroup and results bucket.", 5, undefined, ["s3-bucket"]),
  service("emr", "EMR", "Managed big data cluster for Spark and Hadoop workloads.", 10),
  service("kinesis", "Kinesis Data Stream", "Real-time streaming data stream with shards and encryption.", 6),
  service("firehose", "Kinesis Firehose", "Managed delivery stream to S3, OpenSearch, or Redshift.", 6, undefined, ["s3-bucket"]),
  service("lake-formation", "Lake Formation", "Data lake governance permissions and resource registration.", 5, undefined, ["s3-bucket"]),
  service("quicksight", "QuickSight", "BI namespace, users, and dashboard scaffolding.", 5, undefined, []),
  service("sagemaker", "SageMaker", "ML domain or notebook with execution role and VPC options.", 8),
  service("bedrock", "Bedrock", "Foundation model access policy and application integration scaffolding.", 5, undefined, ["iam-role"]),
  service("textract", "Textract", "Document AI IAM and workflow scaffolding.", 4, undefined, ["iam-role"]),
  service("comprehend", "Comprehend", "Natural language processing job scaffolding.", 4, undefined, ["iam-role"]),
  service("rekognition", "Rekognition", "Computer vision integration IAM scaffolding.", 4, undefined, ["iam-role"]),
  service("lex", "Lex", "Conversational bot scaffolding.", 5, undefined, ["iam-role"]),
  service("polly", "Polly", "Text-to-speech integration IAM scaffolding.", 4, undefined, ["iam-role"]),
  service("codebuild", "CodeBuild", "Build project with service role, logs, and artifacts.", 6, undefined, ["iam-role", "s3-bucket"]),
  service("codepipeline", "CodePipeline", "Release pipeline with artifact store and stages.", 7, undefined, ["iam-role", "s3-bucket"]),
  service("codecommit", "CodeCommit", "Managed Git repository.", 3, undefined, []),
  service("codedeploy", "CodeDeploy", "Deployment application and group.", 5, undefined, ["iam-role"]),
  service("cloudformation-stack", "CloudFormation Stack", "CloudFormation stack wrapper for legacy or third-party templates.", 4, undefined, []),
  service("service-catalog", "Service Catalog", "Curated portfolio and product scaffolding.", 6, undefined, []),
  service("organizations-account", "Organizations Account", "AWS Organizations account and OU placement scaffolding.", 4, undefined, []),
  service("backup-plan", "Backup Plan", "AWS Backup plan and resource selection.", 5, undefined, ["backup-vault"]),
  service("elastic-beanstalk", "Elastic Beanstalk", "Managed application environment for web workloads.", 7),
  service("app-runner", "App Runner", "Managed container or source-based web service.", 6, [
    { key: "containerImage", label: "Container image", type: "text", required: true, placeholder: "public.ecr.aws/nginx/nginx:latest", help: "Container image URI." }
  ], ["ecr"]),
  service("amplify", "Amplify", "Frontend hosting app and branch scaffolding.", 5, undefined, []),
  service("ses", "SES", "Email identity, domain DKIM, and sending configuration.", 5, [
    { key: "domainName", label: "Domain name", type: "text", required: true, placeholder: "example.com", help: "Verified sending domain." }
  ], ["route53"]),
  service("connect", "Amazon Connect", "Cloud contact center instance scaffolding.", 5, undefined, []),
  service("pinpoint", "Pinpoint", "Customer engagement application for messaging campaigns.", 5, undefined, []),
  service("iot-core", "IoT Core", "IoT policy, thing type, and registry scaffolding.", 5, undefined, []),
  service("greengrass", "Greengrass", "Edge runtime deployment scaffolding.", 5, undefined, ["iot-core"]),
  service("transfer-family", "Transfer Family", "Managed SFTP/FTPS/FTP endpoint backed by S3 or EFS.", 7, undefined, ["s3-bucket"]),
  service("datasync", "DataSync", "Managed data transfer task scaffolding.", 6, undefined, []),
  service("migration-hub", "Migration Hub", "Migration tracking and strategy scaffolding.", 4, undefined, []),
  service("dms", "Database Migration Service", "DMS replication instance and task scaffolding.", 8)
];

export const awsModuleMappings: ModuleMapping[] = [
  { resourceType: "vpc", provider: "aws", moduleSource: "aws-ia/vpc/aws", version: "4.7.3", requiredInputs: ["name", "subnets"], optionalInputs: ["az_count", "cidr_block", "tags", "vpc_flow_logs"], notes: "AWS-IA VPC baseline with public and private subnet tiers." },
  { resourceType: "vpc-endpoint", provider: "aws", moduleSource: "aws-ia/vpc_endpoints/aws", version: "0.1.1", requiredInputs: ["vpc_id"], optionalInputs: ["enabled_gateway_endpoints", "enabled_interface_endpoints", "private_dns_enabled", "security_group_ids", "subnet_ids", "tags"], notes: "AWS-IA VPC endpoints module for gateway and interface endpoints." },
  { resourceType: "eks", provider: "aws", moduleSource: "aws-ia/eks-blueprints-addons/aws", version: "1.23.0", requiredInputs: ["cluster_endpoint", "cluster_name", "cluster_version", "oidc_provider_arn"], optionalInputs: ["enable_aws_cloudwatch_metrics", "enable_aws_for_fluentbit", "enable_aws_load_balancer_controller", "enable_cluster_autoscaler", "enable_metrics_server", "eks_addons", "tags"], notes: "AWS-IA EKS Blueprints Addons module. AWS-IA does not publish a direct EKS cluster creation module, so this wires production add-ons to an EKS cluster reference." },
  { resourceType: "ecs", provider: "aws", moduleSource: "aws-ia/ecs-cluster/aws", version: "0.0.1", requiredInputs: ["launch_configuration", "launch_template_id"], optionalInputs: ["asg_max_size", "create_service_role", "name", "region", "tags", "vpc_subnet_ids"], notes: "AWS-IA ECS cluster module with capacity-provider scaffolding." },
  { resourceType: "fargate-service", provider: "aws", moduleSource: "aws-ia/ecs-fargate/aws", version: "0.0.2", requiredInputs: ["vpc_id"], optionalInputs: ["image_url", "name", "name_prefix", "region", "service_name"], notes: "AWS-IA ECS Fargate service module." },
  { resourceType: "rds", provider: "aws", moduleSource: "aws-ia/rds-aurora/aws", version: "0.0.7", requiredInputs: ["password", "private_subnet_ids_p", "private_subnet_ids_s", "region", "sec_region"], optionalInputs: ["database_name", "engine", "engine_version_mysql", "engine_version_pg", "identifier", "instance_class", "name", "primary_instance_count", "secondary_instance_count", "tags", "username"], notes: "AWS-IA Aurora PostgreSQL-compatible module used for the managed PostgreSQL block." },
  { resourceType: "aurora", provider: "aws", moduleSource: "aws-ia/rds-aurora/aws", version: "0.0.7", requiredInputs: ["password", "private_subnet_ids_p", "private_subnet_ids_s", "region", "sec_region"], optionalInputs: ["database_name", "engine", "engine_version_mysql", "engine_version_pg", "identifier", "instance_class", "name", "primary_instance_count", "secondary_instance_count", "tags", "username"], notes: "AWS-IA Aurora module for regional database clusters." },
  { resourceType: "opensearch", provider: "aws", moduleSource: "aws-ia/opensearch-serverless/aws", version: "0.0.5", requiredInputs: [], optionalInputs: ["allow_public_access_network_policy"], notes: "AWS-IA OpenSearch Serverless module used for the OpenSearch block." },
  { resourceType: "guardduty", provider: "aws", moduleSource: "aws-ia/guardduty/aws", version: "0.1.0", requiredInputs: [], optionalInputs: ["tags"], notes: "AWS-IA GuardDuty detector module." },
  { resourceType: "security-hub", provider: "aws", moduleSource: "aws-ia/security-hub/aws", version: "0.0.1", requiredInputs: [], optionalInputs: ["specified_regions"], notes: "AWS-IA Security Hub module." },
  { resourceType: "cloudwatch", provider: "aws", moduleSource: "aws-ia/cloudwatch-log-group/aws", version: "1.0.1", requiredInputs: ["aws_service_principal", "kms_key_id", "name", "tags"], optionalInputs: ["retention_in_days"], notes: "AWS-IA CloudWatch log group module." },
  { resourceType: "codebuild", provider: "aws", moduleSource: "aws-ia/codebuild/aws", version: "0.0.5", requiredInputs: [], optionalInputs: ["build_image", "create_role_and_policy", "project_name", "region", "tags"], notes: "AWS-IA CodeBuild project module." },
  { resourceType: "amplify", provider: "aws", moduleSource: "aws-ia/amplify-app/aws", version: "0.0.1", requiredInputs: [], optionalInputs: ["app_name", "app_tags", "domain_name", "tags"], notes: "AWS-IA Amplify app module." },
  { resourceType: "connect", provider: "aws", moduleSource: "aws-ia/amazonconnect/aws", version: "0.0.1", requiredInputs: [], optionalInputs: ["instance_alias", "tags"], notes: "AWS-IA Amazon Connect instance module." },
  { resourceType: "transfer-family", provider: "aws", moduleSource: "aws-ia/transfer-family/aws", version: "0.6.0", requiredInputs: [], optionalInputs: ["domain", "enable_logging", "endpoint_type", "log_retention_days", "server_name", "tags"], notes: "AWS-IA Transfer Family server module." },
  { resourceType: "datasync", provider: "aws", moduleSource: "aws-ia/datasync/aws", version: "0.1.0", requiredInputs: [], optionalInputs: ["tags"], notes: "AWS-IA DataSync task module." },
  { resourceType: "sagemaker", provider: "aws", moduleSource: "aws-ia/sagemaker-endpoint/aws", version: "0.0.1", requiredInputs: [], optionalInputs: ["endpoint_name", "name_prefix", "tags"], notes: "AWS-IA SageMaker endpoint module." },
  { resourceType: "bedrock", provider: "aws", moduleSource: "aws-ia/bedrock/aws", version: "0.0.33", requiredInputs: [], optionalInputs: ["agent_name", "collection_name", "guardrail_name", "kb_name", "tags"], notes: "AWS-IA Bedrock generative AI module." },
  { resourceType: "shield", provider: "aws", moduleSource: "aws-ia/shield-advanced/aws", version: "0.0.1", requiredInputs: ["name", "protection_group_config", "resource_arn"], optionalInputs: ["health_check_configuration", "tags"], notes: "AWS-IA Shield Advanced protection module." },
  ...awsComponentDefinitions
    .filter((definition) => !["vpc", "vpc-endpoint", "eks", "ecs", "fargate-service", "rds", "aurora", "opensearch", "guardduty", "security-hub", "cloudwatch", "codebuild", "amplify", "connect", "transfer-family", "datasync", "sagemaker", "bedrock", "shield"].includes(definition.type))
    .map((definition): ModuleMapping => ({
      resourceType: definition.type,
      provider: "aws",
      moduleSource: `./modules/aws-${definition.type}`,
      version: "local",
      requiredInputs: ["name", "region"],
      optionalInputs: ["sku", "capacity", "public_access_enabled", "private_connectivity_enabled", "tags"],
      notes: "Local AWS service template placeholder. Replace with a selected registry module or hardened aws provider resources for production."
    }))
];

export const defaultProject: ProjectState = {
  id: "project_aws_saas",
  name: "startup-saas",
  provider: "aws",
  environment: "prod",
  region: "us-east-1",
  remoteStateBucket: "company-terraform-state",
  owner: "platform",
  costCenter: "cc-1001",
  components: [
    { id: "cmp_vpc", type: "vpc", name: "network", enabled: true, config: { cidr: "10.40.0.0/16", azCount: 3, enableNatGateway: true } },
    { id: "cmp_sg", type: "security-group", name: "baseline-sg", enabled: true, config: { allowedCidrBlocks: ["10.40.0.0/16"], enableSsh: false } },
    { id: "cmp_eks", type: "eks", name: "app-cluster", enabled: true, config: { clusterVersion: "1.31", nodeInstanceType: "m7i.large", minNodes: 3, maxNodes: 12, privateEndpoint: true } },
    { id: "cmp_rds", type: "rds", name: "postgres", enabled: true, config: { engineVersion: "16", instanceClass: "db.t4g.medium", allocatedStorage: 100, multiAz: true } }
  ]
};
