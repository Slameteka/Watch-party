variable "project_name" {
  description = "Project name identifier"
  type        = string
}

variable "env" {
  description = "Deployment environment (e.g. prod, dev)"
  type        = string
}

variable "aws_region" {
  description = "AWS region of the SSM parameters"
  type        = string
  default     = "ap-southeast-1"
}

variable "app_domain" {
  description = "Application domain; LiveKit uses rtc.<app_domain> and turn.<app_domain>"
  type        = string

  validation {
    condition     = can(regex("^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$", var.app_domain))
    error_message = "app_domain must be a lowercase DNS name without scheme or path."
  }
}

variable "subnet_id" {
  description = "Public subnet (route to an internet gateway) for the LiveKit instance. Until the network module exists, pass a default VPC subnet."
  type        = string
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID for app_domain. When null, the rtc. and turn. records are not created."
  type        = string
  default     = null
}

variable "rtc_instance_type" {
  description = "EC2 instance type; only AWS Free plan eligible types (architecture.md §3.4, ADR-0004)"
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

variable "room_max_participants" {
  description = "Platform limit per room, also enforced by LiveKit (architecture.md §3.2)"
  type        = number
  default     = 10

  validation {
    condition     = var.room_max_participants >= 2 && var.room_max_participants <= 10
    error_message = "room_max_participants must be between 2 and 10."
  }
}

variable "livekit_image" {
  description = "Pinned LiveKit server image (tag and digest; never latest)"
  type        = string
  default     = "livekit/livekit-server:v1.13.11@sha256:25cd902de7cacbd5f1f779f6a6ac1eae20ba8f56b0935934ce6b0ab80d1e3d20"

  validation {
    condition     = can(regex("^[a-z0-9./-]+:v[0-9][^@]*(@sha256:[0-9a-f]{64})?$", var.livekit_image)) && !strcontains(var.livekit_image, ":latest")
    error_message = "livekit_image must be pinned to a version tag (optionally with a digest), not latest."
  }
}

variable "caddy_image" {
  description = "Pinned Caddy image with the layer4 module, as used by LiveKit's VM deployment"
  type        = string
  default     = "livekit/caddyl4:v2.11.3@sha256:9dd090159a6042a907dbff0ce9dda27a21d2a559dc7b03b60a8e6b1b60b8348e"

  validation {
    condition     = can(regex("^[a-z0-9./-]+:v[0-9][^@]*(@sha256:[0-9a-f]{64})?$", var.caddy_image)) && !strcontains(var.caddy_image, ":latest")
    error_message = "caddy_image must be pinned to a version tag (optionally with a digest), not latest."
  }
}

variable "rtc_schedule_enabled" {
  description = "Stop and start the instance on a schedule (EventBridge Scheduler). Required when using c7i-flex.large (ADR-0004)."
  type        = bool
  default     = false
}

variable "schedule_timezone" {
  description = "IANA time zone for the start/stop schedule"
  type        = string
  default     = "Asia/Jakarta"
}

variable "schedule_start_expression" {
  description = "EventBridge Scheduler expression that starts the instance"
  type        = string
  default     = "cron(0 8 * * ? *)"
}

variable "schedule_stop_expression" {
  description = "EventBridge Scheduler expression that stops the instance"
  type        = string
  default     = "cron(0 0 * * ? *)"
}

variable "tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}
