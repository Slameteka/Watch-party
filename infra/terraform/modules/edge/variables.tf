variable "project_name" {
  description = "Project name identifier"
  type        = string
}

variable "env" {
  description = "Deployment environment (e.g. prod, dev)"
  type        = string
}

variable "app_domain" {
  description = "Application domain name (e.g. watchparty.chescloud.my.id)"
  type        = string
}

variable "acm_certificate_arn" {
  description = "ARN of the ACM certificate in us-east-1 for CloudFront"
  type        = string
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID for the domain"
  type        = string
}

variable "api_endpoint" {
  description = "Regional API Gateway endpoint URL (e.g. https://8idyfamh69.execute-api.ap-southeast-1.amazonaws.com) or null"
  type        = string
  default     = null
}

variable "tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}

