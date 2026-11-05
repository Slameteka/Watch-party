data "archive_file" "rest_api_dummy" {
  count       = var.lambda_zip_path == null ? 1 : 0
  type        = "zip"
  output_path = "${path.module}/.dummy_rest_api.zip"

  source {
    content  = "def lambda_handler(event, context):\n    return {'statusCode': 200, 'body': 'OK'}\n"
    filename = "handler.py"
  }
}

resource "aws_lambda_function" "rest_api" {
  function_name = "${var.project_name}-${var.env}-rest-api"
  role          = aws_iam_role.rest_api.arn
  handler       = "src.handlers.rest_api.app.lambda_handler"
  runtime       = "python3.14"
  architectures = ["arm64"]
  memory_size   = 256
  timeout       = 30

  filename         = var.lambda_zip_path != null ? var.lambda_zip_path : data.archive_file.rest_api_dummy[0].output_path
  source_code_hash = var.lambda_zip_path != null ? filebase64sha256(var.lambda_zip_path) : data.archive_file.rest_api_dummy[0].output_base64sha256

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      MAIN_TABLE_NAME             = var.main_table_name
      CONNECTIONS_TABLE_NAME      = var.connections_table_name
      ROOM_MAX_PARTICIPANTS       = tostring(var.room_max_participants)
      ROOM_TOKEN_SECRET_NAME      = "/${var.project_name}/${var.env}/room-token-signing-key"
      CLOUDFRONT_PRIVATE_KEY_NAME = "/${var.project_name}/${var.env}/cloudfront-signing-private-key"
      LIVEKIT_API_KEY_NAME        = "/${var.project_name}/${var.env}/livekit-api-key"
      LIVEKIT_API_SECRET_NAME     = "/${var.project_name}/${var.env}/livekit-api-secret"
      CLOUDFRONT_KEY_PAIR_ID      = var.cloudfront_key_pair_id
      CLOUDFRONT_DOMAIN           = var.app_domain
      LIVEKIT_URL                 = var.livekit_url != "" ? var.livekit_url : "wss://rtc.${var.app_domain}"
      COGNITO_USER_POOL_ID        = var.cognito_user_pool_id
      COGNITO_APP_CLIENT_ID       = var.cognito_client_id
      WS_MANAGEMENT_ENDPOINT      = var.ws_management_endpoint
      POWERTOOLS_SERVICE_NAME     = "rest-api"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.rest_api
  ]

  tags = merge(
    var.tags,
    {
      Name  = "${var.project_name}-${var.env}-rest-api"
      Owner = "backend"
    }
  )
}
