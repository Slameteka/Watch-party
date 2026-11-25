output "zone_id" {
  description = "Route 53 hosted zone ID"
  value       = aws_route53_zone.main.zone_id
}

output "zone_name" {
  description = "Route 53 hosted zone name"
  value       = aws_route53_zone.main.name
}

output "name_servers" {
  description = "Name servers of the Route 53 hosted zone"
  value       = aws_route53_zone.main.name_servers
}

output "acm_certificate_arn" {
  description = "ARN of the CloudFront ACM certificate in us-east-1"
  value       = aws_acm_certificate_validation.cloudfront.certificate_arn
}