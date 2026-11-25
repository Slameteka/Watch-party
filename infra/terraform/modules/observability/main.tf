# =============================================================================
# Observability Module: SNS Alerts, AWS Budgets Guardrail & CloudWatch Dashboard
# Architecture reference: docs/architecture.md §10 & §12.5
# =============================================================================

# 1. SNS Topic for Platform Alerts
resource "aws_sns_topic" "alerts" {
  name = "${var.project_name}-${var.env}-platform-alerts"

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.env}-platform-alerts"
  })
}

resource "aws_sns_topic_policy" "alerts" {
  arn = aws_sns_topic.alerts.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowBudgetsToPublish"
        Effect = "Allow"
        Principal = {
          Service = "budgets.amazonaws.com"
        }
        Action   = "sns:Publish"
        Resource = aws_sns_topic.alerts.arn
      }
    ]
  })
}

# 2. AWS Budget Guardrail ($50/month with 25%, 50%, 75%, 90% alerts)
resource "aws_budgets_budget" "monthly_cost" {
  name         = "${var.project_name}-${var.env}-monthly-budget"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_types {
    include_credit             = false
    include_discount           = true
    include_other_subscription = true
    include_recurring          = true
    include_refund             = false
    include_subscription       = true
    include_support            = true
    include_tax                = true
    include_upfront            = true
    use_blended                = false
  }

  dynamic "notification" {
    for_each = [25, 50, 75, 90]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = var.alert_emails
      subscriber_sns_topic_arns  = [aws_sns_topic.alerts.arn]
    }
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.env}-monthly-budget"
  })
}

# 3. CloudWatch Dashboard for Service Monitoring
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project_name}-${var.env}-operational-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/ApiGateway", "5XXError", "ApiId", var.api_gateway_http_name, { stat = "Sum", period = 60 }],
            [".", "4XXError", ".", ".", { stat = "Sum", period = 60 }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = "ap-southeast-1"
          title   = "HTTP API Gateway Error Rates"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/ApiGateway", "ConnectCount", { stat = "Sum", period = 60 }],
            [".", "IntegrationError", { stat = "Sum", period = 60 }],
            [".", "ExecutionError", { stat = "Sum", period = 60 }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = "ap-southeast-1"
          title   = "WebSocket API Gateway Activity"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 24
        height = 6
        properties = {
          metrics = [
            ["AWS/Lambda", "Errors", "FunctionName", "${var.project_name}-${var.env}-rest-api", { stat = "Sum", period = 60 }],
            [".", "Errors", "FunctionName", "${var.project_name}-${var.env}-ws-message", { stat = "Sum", period = 60 }],
            [".", "Errors", "FunctionName", "${var.project_name}-${var.env}-ws-connect", { stat = "Sum", period = 60 }],
            [".", "Errors", "FunctionName", "${var.project_name}-${var.env}-ws-disconnect", { stat = "Sum", period = 60 }],
            [".", "Errors", "FunctionName", "${var.project_name}-${var.env}-ws-authorizer", { stat = "Sum", period = 60 }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = "ap-southeast-1"
          title   = "Lambda Function Errors Across All Handlers"
        }
      }
    ]
  })
}

