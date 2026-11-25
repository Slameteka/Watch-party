# 1. Route 53 Public Hosted Zone
resource "aws_route53_zone" "main" {
  name = var.app_domain

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.env}-hosted-zone"
  })
}

# 2. ACM Certificate di us-east-1 (wajib untuk CloudFront)
resource "aws_acm_certificate" "cloudfront" {
  provider          = aws.us_east_1
  domain_name       = var.app_domain
  validation_method = "DNS"
  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.env}-cf-cert"
  })
  lifecycle {
    create_before_destroy = true
  }
}

# 3. DNS Validation Record otomatis di Route 53
resource "aws_route53_record" "cert_validation" {
  allow_overwrite = true
  name            = tolist(aws_acm_certificate.cloudfront.domain_validation_options)[0].resource_record_name
  records         = [tolist(aws_acm_certificate.cloudfront.domain_validation_options)[0].resource_record_value]
  ttl             = 60
  type            = tolist(aws_acm_certificate.cloudfront.domain_validation_options)[0].resource_record_type
  zone_id         = aws_route53_zone.main.zone_id
}

# 4. Validasi Sertifikat ACM
resource "aws_acm_certificate_validation" "cloudfront" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.cloudfront.arn
  validation_record_fqdns = [aws_route53_record.cert_validation.fqdn]
}