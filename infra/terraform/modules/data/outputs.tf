output "main_table_name" {
  description = "Name of the main DynamoDB table"
  value       = aws_dynamodb_table.main.name
}

output "main_table_arn" {
  description = "ARN of the main DynamoDB table"
  value       = aws_dynamodb_table.main.arn
}

output "connections_table_name" {
  description = "Name of the WebSocket connections DynamoDB table"
  value       = aws_dynamodb_table.connections.name
}

output "connections_table_arn" {
  description = "ARN of the WebSocket connections DynamoDB table"
  value       = aws_dynamodb_table.connections.arn
}

output "connections_by_room_gsi_name" {
  description = "Name of the GSI byRoom on the connections table"
  value       = "byRoom"
}
