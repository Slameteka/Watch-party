data "aws_caller_identity" "current" {}

locals {
  account_id = var.aws_account_id != "" ? var.aws_account_id : data.aws_caller_identity.current.account_id
}

# -----------------------------------------------------------------------------
# CloudWatch Log Groups (14-day retention for all 4 Lambda functions)
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "ws_authorizer" {
  name              = "/aws/lambda/${var.project_name}-${var.env}-ws-authorizer"
  retention_in_days = 14

  tags = merge(
    var.tags,
    {
      Name  = "/aws/lambda/${var.project_name}-${var.env}-ws-authorizer"
      Owner = "backend"
    }
  )
}

resource "aws_cloudwatch_log_group" "ws_connect" {
  name              = "/aws/lambda/${var.project_name}-${var.env}-ws-connect"
  retention_in_days = 14

  tags = merge(
    var.tags,
    {
      Name  = "/aws/lambda/${var.project_name}-${var.env}-ws-connect"
      Owner = "backend"
    }
  )
}

resource "aws_cloudwatch_log_group" "ws_disconnect" {
  name              = "/aws/lambda/${var.project_name}-${var.env}-ws-disconnect"
  retention_in_days = 14

  tags = merge(
    var.tags,
    {
      Name  = "/aws/lambda/${var.project_name}-${var.env}-ws-disconnect"
      Owner = "backend"
    }
  )
}

resource "aws_cloudwatch_log_group" "ws_message" {
  name              = "/aws/lambda/${var.project_name}-${var.env}-ws-message"
  retention_in_days = 14

  tags = merge(
    var.tags,
    {
      Name  = "/aws/lambda/${var.project_name}-${var.env}-ws-message"
      Owner = "backend"
    }
  )
}

# -----------------------------------------------------------------------------
# 1. IAM Role & Policy: ws-authorizer
# -----------------------------------------------------------------------------

resource "aws_iam_role" "ws_authorizer" {
  name = "${var.project_name}-${var.env}-ws-authorizer-role"

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
      Name  = "${var.project_name}-${var.env}-ws-authorizer-role"
      Owner = "backend"
    }
  )
}

resource "aws_iam_policy" "ws_authorizer" {
  name        = "${var.project_name}-${var.env}-ws-authorizer-policy"
  description = "Least-privilege policy for ws-authorizer Lambda"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudWatchLogsAccess"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.ws_authorizer.arn}:*"
      },
      {
        Sid    = "XRayTelemetry"
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords"
        ]
        Resource = "*"
      },
      {
        Sid    = "DynamoDBMainTableAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem"
        ]
        Resource = var.main_table_arn
      },
      {
        Sid    = "SSMRoomTokenSigningKeyAccess"
        Effect = "Allow"
        Action = [
          "ssm:GetParameter"
        ]
        Resource = "arn:aws:ssm:${var.aws_region}:${local.account_id}:parameter/${var.project_name}/${var.env}/room-token-signing-key"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ws_authorizer" {
  role       = aws_iam_role.ws_authorizer.name
  policy_arn = aws_iam_policy.ws_authorizer.arn
}

# -----------------------------------------------------------------------------
# 2. IAM Role & Policy: ws-connect
# -----------------------------------------------------------------------------

resource "aws_iam_role" "ws_connect" {
  name = "${var.project_name}-${var.env}-ws-connect-role"

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
      Name  = "${var.project_name}-${var.env}-ws-connect-role"
      Owner = "backend"
    }
  )
}

resource "aws_iam_policy" "ws_connect" {
  name        = "${var.project_name}-${var.env}-ws-connect-policy"
  description = "Least-privilege policy for ws-connect Lambda"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudWatchLogsAccess"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.ws_connect.arn}:*"
      },
      {
        Sid    = "XRayTelemetry"
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords"
        ]
        Resource = "*"
      },
      {
        Sid    = "DynamoDBMainTableAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:ConditionCheckItem"
        ]
        Resource = var.main_table_arn
      },
      {
        Sid    = "DynamoDBConnectionsAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query"
        ]
        Resource = [
          var.connections_table_arn,
          "${var.connections_table_arn}/index/*"
        ]
      },
      {
        Sid    = "ManageWebSocketConnections"
        Effect = "Allow"
        Action = [
          "execute-api:ManageConnections"
        ]
        Resource = "${aws_apigatewayv2_api.ws.execution_arn}/*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ws_connect" {
  role       = aws_iam_role.ws_connect.name
  policy_arn = aws_iam_policy.ws_connect.arn
}

# -----------------------------------------------------------------------------
# 3. IAM Role & Policy: ws-disconnect
# -----------------------------------------------------------------------------

resource "aws_iam_role" "ws_disconnect" {
  name = "${var.project_name}-${var.env}-ws-disconnect-role"

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
      Name  = "${var.project_name}-${var.env}-ws-disconnect-role"
      Owner = "backend"
    }
  )
}

resource "aws_iam_policy" "ws_disconnect" {
  name        = "${var.project_name}-${var.env}-ws-disconnect-policy"
  description = "Least-privilege policy for ws-disconnect Lambda"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudWatchLogsAccess"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.ws_disconnect.arn}:*"
      },
      {
        Sid    = "XRayTelemetry"
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords"
        ]
        Resource = "*"
      },
      {
        Sid    = "DynamoDBMainTableAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:ConditionCheckItem"
        ]
        Resource = var.main_table_arn
      },
      {
        Sid    = "DynamoDBConnectionsAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:DeleteItem",
          "dynamodb:Query"
        ]
        Resource = [
          var.connections_table_arn,
          "${var.connections_table_arn}/index/*"
        ]
      },
      {
        Sid    = "ManageWebSocketConnections"
        Effect = "Allow"
        Action = [
          "execute-api:ManageConnections"
        ]
        Resource = "${aws_apigatewayv2_api.ws.execution_arn}/*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ws_disconnect" {
  role       = aws_iam_role.ws_disconnect.name
  policy_arn = aws_iam_policy.ws_disconnect.arn
}

# -----------------------------------------------------------------------------
# 4. IAM Role & Policy: ws-message
# -----------------------------------------------------------------------------

resource "aws_iam_role" "ws_message" {
  name = "${var.project_name}-${var.env}-ws-message-role"

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
      Name  = "${var.project_name}-${var.env}-ws-message-role"
      Owner = "backend"
    }
  )
}

resource "aws_iam_policy" "ws_message" {
  name        = "${var.project_name}-${var.env}-ws-message-policy"
  description = "Least-privilege policy for ws-message Lambda"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudWatchLogsAccess"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.ws_message.arn}:*"
      },
      {
        Sid    = "XRayTelemetry"
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords"
        ]
        Resource = "*"
      },
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
      {
        Sid    = "DynamoDBConnectionsAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query"
        ]
        Resource = [
          var.connections_table_arn,
          "${var.connections_table_arn}/index/*"
        ]
      },
      {
        Sid    = "ManageWebSocketConnections"
        Effect = "Allow"
        Action = [
          "execute-api:ManageConnections"
        ]
        Resource = "${aws_apigatewayv2_api.ws.execution_arn}/*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ws_message" {
  role       = aws_iam_role.ws_message.name
  policy_arn = aws_iam_policy.ws_message.arn
}
