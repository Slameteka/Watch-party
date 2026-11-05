variable "project_name" {
  description = "Project name identifier"
  type        = string
}

variable "env" {
  description = "Deployment environment (e.g. prod, dev)"
  type        = string
}

variable "app_domain" {
  description = "Application domain (e.g. watchparty.chescloud.my.id)"
  type        = string
}

variable "callback_urls" {
  description = "List of allowed callback URLs for Cognito OAuth"
  type        = list(string)
  default     = null
}

variable "logout_urls" {
  description = "List of allowed logout URLs for Cognito OAuth"
  type        = list(string)
  default     = null
}

variable "tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}
