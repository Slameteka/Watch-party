variable "project_name" {
  description = "Project name identifier"
  type        = string
  default     = "watchparty"
}

variable "env" {
  description = "Deployment environment (e.g. prod, dev)"
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-southeast-1"
}

variable "app_domain" {
  description = "Application domain"
  type        = string
  default     = "watchparty.chescloud.my.id"
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

variable "tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}
