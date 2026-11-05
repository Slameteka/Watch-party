terraform {
  required_version = ">= 1.15.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = ">= 2.0"
    }
  }
}

# HTTP API Gateway: REST Endpoints (Catalog, Room, Join, Media Cookies, RTC Token)
resource "aws_apigatewayv2_api" "http" {
  name          = "${var.project_name}-${var.env}-http-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins     = ["https://${var.app_domain}"]
    allow_credentials = true
    allow_methods     = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers     = ["Authorization", "Content-Type"]
    max_age           = 600
  }

  tags = merge(
    var.tags,
    {
      Name  = "${var.project_name}-${var.env}-http-api"
      Owner = "backend"
    }
  )
}

# Cognito JWT Authorizer for HTTP API (used on POST /rooms)
resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.http.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${var.project_name}-${var.env}-cognito-jwt-authorizer"

  jwt_configuration {
    audience = [var.cognito_client_id]
    issuer   = "https://${var.cognito_endpoint}"
  }
}

# Lambda Integration for rest-api
resource "aws_apigatewayv2_integration" "rest_api" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.rest_api.invoke_arn
  payload_format_version = "2.0"
}

# Route POST /rooms (Requires Cognito Access Token from Host)
resource "aws_apigatewayv2_route" "post_rooms" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /rooms"
  target             = "integrations/${aws_apigatewayv2_integration.rest_api.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

# Route $default: All other REST routes
resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.rest_api.id}"
}

# Permission for API Gateway to invoke rest-api Lambda
resource "aws_lambda_permission" "http_api" {
  statement_id  = "AllowAPIGatewayInvokeRestApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.rest_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

# CloudWatch Log Group for HTTP API Access Logs (14-day retention per architecture §3.4)
resource "aws_cloudwatch_log_group" "http_access_logs" {
  name              = "/aws/apigateway/${var.project_name}-${var.env}-http-api-access-logs"
  retention_in_days = 14

  tags = merge(
    var.tags,
    {
      Name  = "/aws/apigateway/${var.project_name}-${var.env}-http-api-access-logs"
      Owner = "backend"
    }
  )
}

# Stage $default with Architecture-compliant throttling (Rate 20, Burst 40) and Access Logging
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = 20
    throttling_burst_limit = 40
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.http_access_logs.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
    })
  }

  tags = merge(
    var.tags,
    {
      Name  = "${var.project_name}-${var.env}-http-api-default-stage"
      Owner = "backend"
    }
  )
}

# Custom Domain Name: api.<app_domain> (Optional)
resource "aws_apigatewayv2_domain_name" "api" {
  count       = var.acm_certificate_arn != null ? 1 : 0
  domain_name = "api.${var.app_domain}"

  domain_name_configuration {
    certificate_arn = var.acm_certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  tags = merge(
    var.tags,
    {
      Name  = "api.${var.app_domain}"
      Owner = "backend"
    }
  )
}

# API Mapping for Custom Domain
resource "aws_apigatewayv2_api_mapping" "api" {
  count       = var.acm_certificate_arn != null ? 1 : 0
  api_id      = aws_apigatewayv2_api.http.id
  domain_name = aws_apigatewayv2_domain_name.api[0].id
  stage       = aws_apigatewayv2_stage.default.id
}

# Route 53 A Alias Record for api.<app_domain>
resource "aws_route53_record" "api" {
  count   = (var.route53_zone_id != null && var.acm_certificate_arn != null) ? 1 : 0
  zone_id = var.route53_zone_id
  name    = "api.${var.app_domain}"
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.api[0].domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api[0].domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}
