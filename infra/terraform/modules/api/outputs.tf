output "api_id" {
  description = "ID of the HTTP API Gateway"
  value       = aws_apigatewayv2_api.http.id
}

output "api_endpoint" {
  description = "Default endpoint URL of the HTTP API Gateway"
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "api_execution_arn" {
  description = "Execution ARN of the HTTP API Gateway"
  value       = aws_apigatewayv2_api.http.execution_arn
}

output "rest_api_lambda_name" {
  description = "Name of the rest-api Lambda function"
  value       = aws_lambda_function.rest_api.function_name
}

output "rest_api_lambda_arn" {
  description = "ARN of the rest-api Lambda function"
  value       = aws_lambda_function.rest_api.arn
}

output "rest_api_role_arn" {
  description = "ARN of the IAM role for rest-api Lambda"
  value       = aws_iam_role.rest_api.arn
}

output "custom_domain_name" {
  description = "Custom domain name configured for the HTTP API"
  value       = var.acm_certificate_arn != null ? aws_apigatewayv2_domain_name.api[0].domain_name : null
}
