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

output "vpc_id" {
  description = "ID of the VPC"
  value       = module.network.vpc_id
}

output "public_subnet_id" {
  description = "ID of the public subnet"
  value       = module.network.public_subnet_id
}

output "route53_zone_id" {
  description = "Route 53 Hosted Zone ID"
  value       = module.dns.zone_id
}
output "route53_name_servers" {
  description = "Route 53 Nameservers untuk delegasi Cloudflare"
  value       = module.dns.name_servers
}
output "acm_certificate_arn" {
  description = "ARN Sertifikat SSL ACM di us-east-1"
  value       = module.dns.acm_certificate_arn
}

output "cloudfront_distribution_id" {
  description = "CloudFront Distribution ID"
  value       = module.edge.cloudfront_distribution_id
}

output "cloudfront_domain_name" {
  description = "CloudFront Domain Name"
  value       = module.edge.cloudfront_distribution_domain_name
}

output "web_bucket_name" {
  description = "S3 Web Bucket Name"
  value       = module.edge.web_bucket_name
}

output "media_bucket_name" {
  description = "S3 Media Bucket Name"
  value       = module.edge.media_bucket_name
}

output "cloudfront_key_group_id" {
  description = "CloudFront Signed Cookies Key Group ID"
  value       = module.edge.cloudfront_key_group_id
}

output "cloudwatch_dashboard_name" {
  description = "CloudWatch Operational Dashboard Name"
  value       = module.observability.dashboard_name
}

output "rtc_instance_id" {
  description = "LiveKit EC2 instance ID"
  value       = module.rtc.instance_id
}

output "rtc_public_ip" {
  description = "LiveKit Elastic IP"
  value       = module.rtc.public_ip
}

output "rtc_url" {
  description = "LiveKit WebRTC WSS endpoint"
  value       = module.rtc.rtc_url
}

