variable "project_name" {
  description = "Project name identifier"
  type        = string
}

variable "env" {
  description = "Deployment environment (e.g. prod, dev)"
  type        = string
}

variable "app_domain" {
  description = "Application domain served by the distribution (e.g. watchparty.chescloud.my.id)"
  type        = string

  validation {
    condition     = can(regex("^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$", var.app_domain))
    error_message = "app_domain must be a lowercase DNS name without scheme or path."
  }
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN in us-east-1 for app_domain (from the dns module). When null, the distribution uses the default *.cloudfront.net certificate and no alias."
  type        = string
  default     = null
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID for app_domain. The A/AAAA alias records are created only when this and acm_certificate_arn are set."
  type        = string
  default     = null
}

variable "signing_public_key_path" {
  description = "Path to the PEM public key for CloudFront signed cookies. Defaults to keys/cloudfront-signing-public.pem in this module."
  type        = string
  default     = null
}

variable "price_class" {
  description = "CloudFront price class"
  type        = string
  default     = "PriceClass_200"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "price_class must be PriceClass_100, PriceClass_200, or PriceClass_All."
  }
}

variable "content_security_policy" {
  description = "Content-Security-Policy header value for all responses. Empty string = header not set (to be agreed with FE)."
  type        = string
  default     = ""
}

variable "catalog_table_arn" {
  description = "ARN of the main DynamoDB table. When set, the media publisher policy may write catalog items (PK = CATALOG)."
  type        = string
  default     = null
}

variable "tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}
