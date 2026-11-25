variable "project_name" {
  description = "Project name identifier"
  type        = string
}

variable "env" {
  description = "Deployment environment (e.g. prod, dev)"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidr" {
  description = "CIDR block for the public subnet"
  type        = string
  default     = "10.0.1.0/24"
}

variable "availability_zone" {
  description = "Availability zone for the public subnet"
  type        = string
  default     = "ap-southeast-1a"
}

variable "tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}

