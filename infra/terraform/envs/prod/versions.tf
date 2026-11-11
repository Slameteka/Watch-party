terraform {
  required_version = ">= 1.15.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.70"
    }
    archive = {
      source  = "hashicorp/archive"
      version = ">= 2.0"
    }
  }

  backend "s3" {
    bucket       = "watchparty-tfstate-944551807382"
    key          = "prod/terraform.tfstate"
    region       = "ap-southeast-1"
    profile      = "cheshire-944551807382"
    use_lockfile = true
  }
}

provider "aws" {
  region  = var.aws_region
  profile = "cheshire-944551807382"

  default_tags {
    tags = {
      Project   = var.project_name
      Env       = var.env
      Owner     = "platform"
      ManagedBy = "terraform"
    }
  }
}
