data "archive_file" "ws_dummy" {
  count       = var.lambda_zip_path == null ? 1 : 0
  type        = "zip"
  output_path = "${path.module}/.dummy_ws.zip"

  source {
    content  = "def lambda_handler(event, context):\n    return {'statusCode': 200, 'body': 'OK'}\n"
    filename = "handler.py"
  }
}

locals {
  ws_management_endpoint = "https://${aws_apigatewayv2_api.ws.id}.execute-api.${var.aws_region}.amazonaws.com/${var.env}"
  lambda_filename        = var.lambda_zip_path != null ? var.lambda_zip_path : data.archive_file.ws_dummy[0].output_path
  lambda_hash            = var.lambda_zip_path != null ? filebase64sha256(var.lambda_zip_path) : data.archive_file.ws_dummy[0].output_base64sha256
}

# 1. Lambda ws-authorizer
resource "aws_lambda_function" "ws_authorizer" {
  function_name    = "${var.project_name}-${var.env}-ws-authorizer"
  role             = aws_iam_role.ws_authorizer.arn
  handler          = "src.handlers.ws_authorizer.handler.lambda_handler"
  runtime          = "python3.14"
  architectures    = ["arm64"]
  memory_size      = 256
  timeout          = 10
  filename         = local.lambda_filename
  source_code_hash = local.lambda_hash

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      PYTHONPATH              = "/var/task/src"
      MAIN_TABLE_NAME         = var.main_table_name
      ROOM_TOKEN_SECRET_NAME  = "/${var.project_name}/${var.env}/room-token-signing-key"
      APP_ORIGIN              = "https://${var.app_domain}"
      POWERTOOLS_SERVICE_NAME = "ws-authorizer"
    }
  }

  depends_on = [aws_cloudwatch_log_group.ws_authorizer]

  tags = merge(
    var.tags,
    {
      Name  = "${var.project_name}-${var.env}-ws-authorizer"
      Owner = "backend"
    }
  )
}

# 2. Lambda ws-connect
resource "aws_lambda_function" "ws_connect" {
  function_name    = "${var.project_name}-${var.env}-ws-connect"
  role             = aws_iam_role.ws_connect.arn
  handler          = "src.handlers.ws_connect.handler.lambda_handler"
  runtime          = "python3.14"
  architectures    = ["arm64"]
  memory_size      = 256
  timeout          = 30
  filename         = local.lambda_filename
  source_code_hash = local.lambda_hash

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      PYTHONPATH              = "/var/task/src"
      MAIN_TABLE_NAME         = var.main_table_name
      CONNECTIONS_TABLE_NAME  = var.connections_table_name
      ROOM_TOKEN_SECRET_NAME  = "/${var.project_name}/${var.env}/room-token-signing-key"
      ROOM_MAX_PARTICIPANTS   = tostring(var.room_max_participants)
      WS_MANAGEMENT_ENDPOINT  = local.ws_management_endpoint
      POWERTOOLS_SERVICE_NAME = "ws-connect"
    }
  }

  depends_on = [aws_cloudwatch_log_group.ws_connect]

  tags = merge(
    var.tags,
    {
      Name  = "${var.project_name}-${var.env}-ws-connect"
      Owner = "backend"
    }
  )
}

# 3. Lambda ws-disconnect
resource "aws_lambda_function" "ws_disconnect" {
  function_name    = "${var.project_name}-${var.env}-ws-disconnect"
  role             = aws_iam_role.ws_disconnect.arn
  handler          = "src.handlers.ws_disconnect.handler.lambda_handler"
  runtime          = "python3.14"
  architectures    = ["arm64"]
  memory_size      = 256
  timeout          = 30
  filename         = local.lambda_filename
  source_code_hash = local.lambda_hash

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      PYTHONPATH              = "/var/task/src"
      MAIN_TABLE_NAME         = var.main_table_name
      CONNECTIONS_TABLE_NAME  = var.connections_table_name
      ROOM_TOKEN_SECRET_NAME  = "/${var.project_name}/${var.env}/room-token-signing-key"
      ROOM_MAX_PARTICIPANTS   = tostring(var.room_max_participants)
      WS_MANAGEMENT_ENDPOINT  = local.ws_management_endpoint
      POWERTOOLS_SERVICE_NAME = "ws-disconnect"
    }
  }

  depends_on = [aws_cloudwatch_log_group.ws_disconnect]

  tags = merge(
    var.tags,
    {
      Name  = "${var.project_name}-${var.env}-ws-disconnect"
      Owner = "backend"
    }
  )
}

# 4. Lambda ws-message
resource "aws_lambda_function" "ws_message" {
  function_name    = "${var.project_name}-${var.env}-ws-message"
  role             = aws_iam_role.ws_message.arn
  handler          = "src.handlers.ws_message.handler.lambda_handler"
  runtime          = "python3.14"
  architectures    = ["arm64"]
  memory_size      = 256
  timeout          = 30
  filename         = local.lambda_filename
  source_code_hash = local.lambda_hash

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      PYTHONPATH              = "/var/task/src"
      MAIN_TABLE_NAME         = var.main_table_name
      CONNECTIONS_TABLE_NAME  = var.connections_table_name
      ROOM_TOKEN_SECRET_NAME  = "/${var.project_name}/${var.env}/room-token-signing-key"
      ROOM_MAX_PARTICIPANTS   = tostring(var.room_max_participants)
      WS_MANAGEMENT_ENDPOINT  = local.ws_management_endpoint
      POWERTOOLS_SERVICE_NAME = "ws-message"
    }
  }

  depends_on = [aws_cloudwatch_log_group.ws_message]

  tags = merge(
    var.tags,
    {
      Name  = "${var.project_name}-${var.env}-ws-message"
      Owner = "backend"
    }
  )
}
