data "aws_caller_identity" "current" {}

locals {
  account_id = var.aws_account_id != "" ? var.aws_account_id : data.aws_caller_identity.current.account_id
}

# CloudWatch Log Group with 14-day retention
resource "aws_cloudwatch_log_group" "rest_api" {
  name              = "/aws/lambda/${var.project_name}-${var.env}-rest-api"
  retention_in_days = 14

  tags = merge(
    var.tags,
    {
      Name  = "/aws/lambda/${var.project_name}-${var.env}-rest-api"
      Owner = "backend"
    }
  )
}

# IAM Role for rest-api Lambda
resource "aws_iam_role" "rest_api" {
  name = "${var.project_name}-${var.env}-rest-api-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(
    var.tags,
    {
      Name  = "${var.project_name}-${var.env}-rest-api-role"
      Owner = "backend"
    }
  )
}

# Least-privilege IAM Policy for rest-api Lambda
resource "aws_iam_policy" "rest_api" {
  name        = "${var.project_name}-${var.env}-rest-api-policy"
  description = "Least-privilege policy for rest-api Lambda handler"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # CloudWatch Logs permissions scoped to log group
      {
        Sid    = "CloudWatchLogsAccess"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.rest_api.arn}:*"
      },
      # AWS X-Ray daemon telemetry (AWS requires * resource for PutTraceSegments)
      {
        Sid    = "XRayTelemetry"
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords"
        ]
        Resource = "*"
      },
      # DynamoDB Main Table permissions
      {
        Sid    = "DynamoDBMainTableAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
          "dynamodb:ConditionCheckItem"
        ]
        Resource = var.main_table_arn
      },
      # DynamoDB Connections Table permissions (Query index and delete stale connection)
      {
        Sid    = "DynamoDBConnectionsAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:Query",
          "dynamodb:DeleteItem"
        ]
        Resource = [
          var.connections_table_arn,
          "${var.connections_table_arn}/index/*"
        ]
      },
      # SSM Parameter Store SecureString reading for 4 backend secrets
      {
        Sid    = "SSMParametersAccess"
        Effect = "Allow"
        Action = [
          "ssm:GetParameter"
        ]
        Resource = "arn:aws:ssm:${var.aws_region}:${local.account_id}:parameter/${var.project_name}/${var.env}/*"
      },
      # WebSocket API connection management for broadcasts on grant/kick/close
      {
        Sid    = "ManageWebSocketConnections"
        Effect = "Allow"
        Action = [
          "execute-api:ManageConnections"
        ]
        # Scoped to WebSocket execution ARN when configured, or wildcards if execution ARN not provided
        Resource = var.ws_execution_arn != "" ? "${var.ws_execution_arn}/*" : "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "rest_api" {
  role       = aws_iam_role.rest_api.name
  policy_arn = aws_iam_policy.rest_api.arn
}
