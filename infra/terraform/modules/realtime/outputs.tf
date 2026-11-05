output "websocket_api_id" {
  description = "ID of the WebSocket API Gateway"
  value       = aws_apigatewayv2_api.ws.id
}

output "websocket_api_endpoint" {
  description = "Default endpoint URL of the WebSocket API Gateway"
  value       = aws_apigatewayv2_api.ws.api_endpoint
}

output "websocket_api_execution_arn" {
  description = "Execution ARN of the WebSocket API Gateway"
  value       = aws_apigatewayv2_api.ws.execution_arn
}

output "ws_management_endpoint" {
  description = "Callback URL for ManageConnections API calls"
  value       = "https://${aws_apigatewayv2_api.ws.id}.execute-api.${var.aws_region}.amazonaws.com/${var.env}"
}

output "custom_domain_name" {
  description = "Custom domain name configured for WebSocket API"
  value       = var.acm_certificate_arn != null ? aws_apigatewayv2_domain_name.ws[0].domain_name : null
}

output "ws_authorizer_lambda_arn" {
  description = "ARN of ws-authorizer Lambda"
  value       = aws_lambda_function.ws_authorizer.arn
}

output "ws_connect_lambda_arn" {
  description = "ARN of ws-connect Lambda"
  value       = aws_lambda_function.ws_connect.arn
}

output "ws_disconnect_lambda_arn" {
  description = "ARN of ws-disconnect Lambda"
  value       = aws_lambda_function.ws_disconnect.arn
}

output "ws_message_lambda_arn" {
  description = "ARN of ws-message Lambda"
  value       = aws_lambda_function.ws_message.arn
}
