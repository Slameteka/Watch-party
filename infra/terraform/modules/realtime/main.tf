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

# WebSocket API Gateway: Realtime Playback Sync, Presence, Chat, and Reactions
resource "aws_apigatewayv2_api" "ws" {
  name                       = "${var.project_name}-${var.env}-websocket-api"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"

  tags = merge(
    var.tags,
    {
      Name  = "${var.project_name}-${var.env}-websocket-api"
      Owner = "backend"
    }
  )
}

# Lambda REQUEST Authorizer for WebSocket $connect
resource "aws_apigatewayv2_authorizer" "ws_auth" {
  api_id           = aws_apigatewayv2_api.ws.id
  authorizer_type  = "REQUEST"
  authorizer_uri   = aws_lambda_function.ws_authorizer.invoke_arn
  identity_sources = ["route.request.querystring.token"]
  name             = "${var.project_name}-${var.env}-ws-authorizer"
}

# Integrations
resource "aws_apigatewayv2_integration" "ws_connect" {
  api_id           = aws_apigatewayv2_api.ws.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.ws_connect.invoke_arn
}

resource "aws_apigatewayv2_integration" "ws_disconnect" {
  api_id           = aws_apigatewayv2_api.ws.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.ws_disconnect.invoke_arn
}

resource "aws_apigatewayv2_integration" "ws_message" {
  api_id           = aws_apigatewayv2_api.ws.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.ws_message.invoke_arn
}

# Routes
resource "aws_apigatewayv2_route" "connect" {
  api_id             = aws_apigatewayv2_api.ws.id
  route_key          = "$connect"
  target             = "integrations/${aws_apigatewayv2_integration.ws_connect.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.ws_auth.id
  authorization_type = "CUSTOM"
}

resource "aws_apigatewayv2_route" "disconnect" {
  api_id    = aws_apigatewayv2_api.ws.id
  route_key = "$disconnect"
  target    = "integrations/${aws_apigatewayv2_integration.ws_disconnect.id}"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.ws.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.ws_message.id}"
}

# Lambda Permissions for API Gateway
resource "aws_lambda_permission" "ws_authorizer" {
  statement_id  = "AllowAPIGatewayInvokeWSAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ws_authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ws.execution_arn}/*/*"
}

resource "aws_lambda_permission" "ws_connect" {
  statement_id  = "AllowAPIGatewayInvokeWSConnect"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ws_connect.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ws.execution_arn}/*/*"
}

resource "aws_lambda_permission" "ws_disconnect" {
  statement_id  = "AllowAPIGatewayInvokeWSDisconnect"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ws_disconnect.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ws.execution_arn}/*/*"
}

resource "aws_lambda_permission" "ws_message" {
  statement_id  = "AllowAPIGatewayInvokeWSMessage"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ws_message.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ws.execution_arn}/*/*"
}

# CloudWatch Log Group for WebSocket Access Logs (14-day retention)
resource "aws_cloudwatch_log_group" "ws_access_logs" {
  name              = "/aws/apigateway/${var.project_name}-${var.env}-websocket-access-logs"
  retention_in_days = 14

  tags = merge(
    var.tags,
    {
      Name  = "/aws/apigateway/${var.project_name}-${var.env}-websocket-access-logs"
      Owner = "backend"
    }
  )
}

# Stage (named after env, e.g. prod) with Throttling & Secure Access Logging
resource "aws_apigatewayv2_stage" "ws" {
  api_id      = aws_apigatewayv2_api.ws.id
  name        = var.env
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = 100
    throttling_burst_limit = 200
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.ws_access_logs.arn
    # NOTE: Query string is explicitly excluded to prevent leaking room tokens into logs (ADR-0007 / NFR-3.4)
    format = jsonencode({
      requestId               = "$context.requestId"
      ip                      = "$context.identity.sourceIp"
      requestTime             = "$context.requestTime"
      eventType               = "$context.eventType"
      routeKey                = "$context.routeKey"
      status                  = "$context.status"
      connectionId            = "$context.connectionId"
      integrationErrorMessage = "$context.integrationErrorMessage"
    })
  }

  tags = merge(
    var.tags,
    {
      Name  = "${var.project_name}-${var.env}-ws-stage"
      Owner = "backend"
    }
  )
}

# Custom Domain ws.<app_domain> (Optional)
resource "aws_apigatewayv2_domain_name" "ws" {
  count       = var.acm_certificate_arn != null ? 1 : 0
  domain_name = "ws.${var.app_domain}"

  domain_name_configuration {
    certificate_arn = var.acm_certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  tags = merge(
    var.tags,
    {
      Name  = "ws.${var.app_domain}"
      Owner = "backend"
    }
  )
}

# API Mapping for Custom Domain
resource "aws_apigatewayv2_api_mapping" "ws" {
  count       = var.acm_certificate_arn != null ? 1 : 0
  api_id      = aws_apigatewayv2_api.ws.id
  domain_name = aws_apigatewayv2_domain_name.ws[0].id
  stage       = aws_apigatewayv2_stage.ws.id
}

# Route 53 A Alias Record for ws.<app_domain>
resource "aws_route53_record" "ws" {
  count   = (var.route53_zone_id != null && var.acm_certificate_arn != null) ? 1 : 0
  zone_id = var.route53_zone_id
  name    = "ws.${var.app_domain}"
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.ws[0].domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.ws[0].domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}
