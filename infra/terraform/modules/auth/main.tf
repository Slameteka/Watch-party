terraform {
  required_version = ">= 1.15.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

locals {
  default_callback_urls = [
    "https://${var.app_domain}/callback",
    "http://localhost:5173/callback"
  ]
  default_logout_urls = [
    "https://${var.app_domain}",
    "http://localhost:5173"
  ]

  callback_urls = var.callback_urls != null ? var.callback_urls : local.default_callback_urls
  logout_urls   = var.logout_urls != null ? var.logout_urls : local.default_logout_urls
}

# Cognito User Pool: Host identity only (managed login with email)
resource "aws_cognito_user_pool" "main" {
  name                     = "${var.project_name}-${var.env}-users"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OFF"

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = false
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  tags = merge(
    var.tags,
    {
      Name  = "${var.project_name}-${var.env}-users"
      Owner = "backend"
    }
  )
}

# Cognito User Pool Client: Public SPA Client (No secret, PKCE Code flow)
resource "aws_cognito_user_pool_client" "web" {
  name                                 = "${var.project_name}-${var.env}-web"
  user_pool_id                         = aws_cognito_user_pool.main.id
  generate_secret                      = false
  explicit_auth_flows                  = ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = local.callback_urls
  logout_urls                          = local.logout_urls
  prevent_user_existence_errors        = "ENABLED"

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30
}

# Cognito User Pool Domain Prefix
resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${var.project_name}-${var.env}-auth"
  user_pool_id = aws_cognito_user_pool.main.id
}
