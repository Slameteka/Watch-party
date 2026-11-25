variable "project_name" {
  description = "Project name identifier"
  type        = string
}

variable "env" {
  description = "Deployment environment (e.g. prod, dev)"
  type        = string
}

variable "monthly_budget_usd" {
  description = "Monthly budget limit in USD"
  type        = number
  default     = 50
}

variable "alert_emails" {
  description = "List of email addresses for budget and alarm notifications"
  type        = list(string)
  default     = []
}

variable "api_gateway_http_name" {
  description = "Name of the HTTP API Gateway"
  type        = string
  default     = ""
}

variable "api_gateway_ws_name" {
  description = "Name of the WebSocket API Gateway"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}

