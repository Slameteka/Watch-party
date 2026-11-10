output "http_api_endpoint" {
  description = "Default URL endpoint of the HTTP API Gateway"
  value       = module.api.api_endpoint
}

output "http_api_id" {
  description = "ID of the HTTP API Gateway"
  value       = module.api.api_id
}

output "websocket_api_endpoint" {
  description = "Default URL endpoint of the WebSocket API Gateway"
  value       = module.realtime.websocket_api_endpoint
}

output "websocket_api_id" {
  description = "ID of the WebSocket API Gateway"
  value       = module.realtime.websocket_api_id
}

output "ws_management_endpoint" {
  description = "Callback URL for ManageConnections API"
  value       = module.realtime.ws_management_endpoint
}

output "cognito_user_pool_id" {
  description = "ID of Cognito User Pool"
  value       = module.auth.user_pool_id
}

output "cognito_user_pool_client_id" {
  description = "ID of Cognito User Pool Web Client"
  value       = module.auth.user_pool_client_id
}

output "cognito_user_pool_endpoint" {
  description = "Cognito User Pool Endpoint"
  value       = module.auth.user_pool_endpoint
}

output "main_table_name" {
  description = "Name of the main DynamoDB table"
  value       = module.data.main_table_name
}

output "connections_table_name" {
  description = "Name of the WebSocket connections DynamoDB table"
  value       = module.data.connections_table_name
}
