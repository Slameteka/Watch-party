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

# --- RTC (LiveKit EC2) ---

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID for app_domain. When null, the rtc. and turn. records are not created (set after DNS delegation)."
  type        = string
  default     = null
}

variable "rtc_instance_type" {
  description = "EC2 instance type for LiveKit; only AWS Free plan eligible types (ADR-0004)"
  type        = string
  default     = "t3.small"

  validation {
    condition = contains(
      ["t3.micro", "t3.small", "t4g.micro", "t4g.small", "c7i-flex.large", "m7i-flex.large"],
      var.rtc_instance_type
    )
    error_message = "rtc_instance_type must be one of: t3.micro, t3.small, t4g.micro, t4g.small, c7i-flex.large, m7i-flex.large."
  }
}

variable "rtc_schedule_enabled" {
  description = "Start/stop the LiveKit instance on a schedule (EventBridge Scheduler). Required when using c7i-flex.large (ADR-0004)."
  type        = bool
  default     = false
}
