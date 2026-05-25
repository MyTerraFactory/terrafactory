export type CloudProvider = "aws" | "azure" | "gcp";

export type ComponentType =
  | "vpc"
  | "eks"
  | "rds"
  | "redis"
  | "alb"
  | "security-group"
  | "vm"
  | "vmss"
  | "storage-account"
  | "key-vault"
  | "app-service"
  | "function-app"
  | "container-app"
  | "container-registry"
  | "aci"
  | "aks-node-pool"
  | "front-door"
  | "cdn"
  | "dns-zone"
  | "private-dns-zone"
  | "private-endpoint"
  | "public-ip"
  | "nat-gateway"
  | "bastion"
  | "vpn-gateway"
  | "expressroute"
  | "firewall"
  | "route-table"
  | "load-balancer"
  | "traffic-manager"
  | "mysql"
  | "mssql"
  | "cosmos-db"
  | "storage-queue"
  | "event-hub"
  | "service-bus"
  | "api-management"
  | "logic-app"
  | "data-factory"
  | "synapse"
  | "databricks"
  | "stream-analytics"
  | "event-grid"
  | "log-analytics"
  | "app-insights"
  | "monitor-action-group"
  | "dashboard"
  | "managed-identity"
  | "role-assignment"
  | "policy-assignment"
  | "defender"
  | "recovery-services-vault"
  | "backup-policy"
  | "automation-account"
  | "cognitive-services"
  | "azure-openai"
  | "ai-search"
  | "machine-learning"
  | "maps"
  | "communication-services"
  | "ec2"
  | "autoscaling-group"
  | "lambda"
  | "ecs"
  | "ecr"
  | "fargate-service"
  | "batch"
  | "lightsail"
  | "s3-bucket"
  | "efs"
  | "fsx"
  | "backup-vault"
  | "dynamodb"
  | "aurora"
  | "documentdb"
  | "neptune"
  | "redshift"
  | "opensearch"
  | "memorydb"
  | "msk"
  | "sqs"
  | "sns"
  | "eventbridge"
  | "step-functions"
  | "api-gateway"
  | "appsync"
  | "cloudfront"
  | "route53"
  | "acm"
  | "waf"
  | "shield"
  | "transit-gateway"
  | "direct-connect"
  | "client-vpn"
  | "vpc-endpoint"
  | "iam-role"
  | "kms-key"
  | "secrets-manager"
  | "ssm-parameter"
  | "cognito"
  | "guardduty"
  | "security-hub"
  | "config"
  | "cloudtrail"
  | "cloudwatch"
  | "xray"
  | "managed-prometheus"
  | "managed-grafana"
  | "glue"
  | "athena"
  | "emr"
  | "kinesis"
  | "firehose"
  | "lake-formation"
  | "quicksight"
  | "sagemaker"
  | "bedrock"
  | "textract"
  | "comprehend"
  | "rekognition"
  | "lex"
  | "polly"
  | "codebuild"
  | "codepipeline"
  | "codecommit"
  | "codedeploy"
  | "cloudformation-stack"
  | "service-catalog"
  | "organizations-account"
  | "backup-plan"
  | "elastic-beanstalk"
  | "app-runner"
  | "amplify"
  | "ses"
  | "connect"
  | "pinpoint"
  | "iot-core"
  | "greengrass"
  | "transfer-family"
  | "datasync"
  | "migration-hub"
  | "dms";

export type Environment = "dev" | "staging" | "prod";

export interface FieldOption {
  label: string;
  value: string;
}

export interface ComponentField {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "boolean" | "tags" | "cidr-list";
  required?: boolean;
  placeholder?: string;
  help: string;
  min?: number;
  max?: number;
  options?: FieldOption[];
}

export interface ComponentDefinition {
  type: ComponentType;
  label: string;
  description: string;
  provider: CloudProvider;
  icon: string;
  estimatedResources: number;
  fields: ComponentField[];
  dependsOn?: ComponentType[];
}

export interface InfraComponent {
  id: string;
  type: ComponentType;
  name: string;
  enabled: boolean;
  config: Record<string, string | number | boolean | string[]>;
}

export interface ModuleMapping {
  resourceType: ComponentType;
  provider: CloudProvider;
  moduleSource: string;
  version: string;
  requiredInputs: string[];
  optionalInputs: string[];
  notes: string;
}

export interface ProjectState {
  id: string;
  name: string;
  provider: CloudProvider;
  environment: Environment;
  region: string;
  remoteStateBucket: string;
  owner: string;
  costCenter: string;
  components: InfraComponent[];
}

export interface GeneratedFile {
  path: string;
  language: "hcl" | "markdown" | "json";
  content: string;
}

export interface ValidationIssue {
  path: string;
  message: string;
  severity: "info" | "warning" | "error";
}
