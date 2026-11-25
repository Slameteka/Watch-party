variable "project_name" {
  description = "project name identifier"
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

variable "tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}