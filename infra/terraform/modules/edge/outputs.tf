output "distribution_id" {
  description = "CloudFront distribution ID (for invalidations)"
  value       = aws_cloudfront_distribution.this.id
}

output "distribution_arn" {
  description = "CloudFront distribution ARN"
  value       = aws_cloudfront_distribution.this.arn
}

output "distribution_domain_name" {
  description = "CloudFront domain name (*.cloudfront.net)"
  value       = aws_cloudfront_distribution.this.domain_name
}

output "web_bucket_name" {
  description = "S3 bucket for the SPA build"
  value       = aws_s3_bucket.this["web"].id
}

output "web_bucket_arn" {
  description = "ARN of the SPA bucket"
  value       = aws_s3_bucket.this["web"].arn
}

output "media_bucket_name" {
  description = "S3 bucket for HLS films and posters (MEDIA_BUCKET for publish_media.py)"
  value       = aws_s3_bucket.this["media"].id
}

output "media_bucket_arn" {
  description = "ARN of the media bucket"
  value       = aws_s3_bucket.this["media"].arn
}

output "cloudfront_public_key_id" {
  description = "Public key ID used as CloudFront-Key-Pair-Id (input cloudfront_key_pair_id of the api module)"
  value       = aws_cloudfront_public_key.media_signing.id
}

output "media_key_group_id" {
  description = "Trusted key group ID on /media/*"
  value       = aws_cloudfront_key_group.media.id
}

output "media_publisher_policy_arn" {
  description = "IAM policy ARN for the RTC/Media publisher (attach to the rtc-media group)"
  value       = aws_iam_policy.media_publisher.arn
}

output "app_url" {
  description = "Public URL of the app"
  value       = local.use_custom_domain ? "https://${var.app_domain}" : "https://${aws_cloudfront_distribution.this.domain_name}"
}
