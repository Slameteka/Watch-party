variable "project_name" {
  description = "Project name identifier"
  type        = string
}

variable "env" {
  description = "Deployment environment (e.g. prod, dev)"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-southeast-1"
}

variable "aws_account_id" {
  description = "AWS Account ID"
  type        = string
  default     = ""
}

variable "app_domain" {
  description = "Application domain (e.g. watchparty.chescloud.my.id)"
  type        = string
}

variable "main_table_name" {
  description = "Name of the main DynamoDB table"
  type        = string
}

variable "main_table_arn" {
  description = "ARN of the main DynamoDB table"
  type        = string
}

variable "connections_table_name" {
  description = "Name of the WebSocket connections DynamoDB table"
  type        = string
}

variable "connections_table_arn" {
  description = "ARN of the WebSocket connections DynamoDB table"
  type        = string
}

variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  type        = string
}

variable "cognito_endpoint" {
  description = "Cognito User Pool Endpoint (without https://)"
  type        = string
}

variable "cognito_client_id" {
  description = "Cognito App Client ID"
  type        = string
}

variable "room_max_participants" {
  description = "Maximum participants platform limit per room (2-10)"
  type        = number
  default     = 10

  validation {
    condition     = var.room_max_participants >= 2 && var.room_max_participants <= 10
    error_message = "room_max_participants must be between 2 and 10."
  }
}

variable "cloudfront_key_pair_id" {
  description = "CloudFront Key Pair ID for signed cookies"
  type        = string
  default     = ""
}

variable "livekit_url" {
  description = "LiveKit server WebSocket URL"
  type        = string
  default     = ""
}

variable "ws_management_endpoint" {
  description = "WebSocket management endpoint URL for sending messages to connections"
  type        = string
  default     = ""
}

variable "ws_execution_arn" {
  description = "Execution ARN of the WebSocket API"
  type        = string
  default     = ""
}

variable "lambda_zip_path" {
  description = "Path to packaged Lambda zip (optional, defaults to dummy for validation)"
  type        = string
  default     = null
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID for custom domain (optional)"
  type        = string
  default     = null
}

variable "acm_certificate_arn" {
  description = "Regional ACM certificate ARN for custom domain (optional)"
  type        = string
  default     = null
}

variable "tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}
