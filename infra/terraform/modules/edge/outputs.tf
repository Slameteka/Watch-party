output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.id
}

output "cloudfront_distribution_domain_name" {
  description = "Domain name of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.domain_name
}

output "cloudfront_distribution_arn" {
  description = "ARN of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.arn
}

output "web_bucket_name" {
  description = "Name of the S3 web bucket"
  value       = aws_s3_bucket.web.id
}

output "web_bucket_arn" {
  description = "ARN of the S3 web bucket"
  value       = aws_s3_bucket.web.arn
}

output "media_bucket_name" {
  description = "Name of the S3 media bucket"
  value       = aws_s3_bucket.media.id
}

output "media_bucket_arn" {
  description = "ARN of the S3 media bucket"
  value       = aws_s3_bucket.media.arn
}

output "cloudfront_key_group_id" {
  description = "ID of the CloudFront key group for signed cookies"
  value       = aws_cloudfront_key_group.media.id
}

