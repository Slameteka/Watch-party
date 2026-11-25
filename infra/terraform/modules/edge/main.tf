# =============================================================================
# Edge Module: S3 Hosting, Media Delivery & CloudFront CDN
# Architecture reference: docs/architecture.md §12.5 & ADR-0005, ADR-0006
# =============================================================================

data "aws_caller_identity" "current" {}

# -----------------------------------------------------------------------------
# 1. S3 Buckets: Web (SPA) & Media (HLS Streams)
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "web" {
  bucket        = "${var.project_name}-${var.env}-web-${data.aws_caller_identity.current.account_id}"
  force_destroy = false

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.env}-web-bucket"
  })
}

resource "aws_s3_bucket_versioning" "web" {
  bucket = aws_s3_bucket.web.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "web" {
  bucket = aws_s3_bucket.web.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket                  = aws_s3_bucket.web.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket" "media" {
  bucket        = "${var.project_name}-${var.env}-media-${data.aws_caller_identity.current.account_id}"
  force_destroy = false

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.env}-media-bucket"
  })
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["https://${var.app_domain}"]
    expose_headers  = ["ETag", "Content-Length", "Date"]
    max_age_seconds = 3600
  }
}

# -----------------------------------------------------------------------------
# 2. Origin Access Control (OAC) & Bucket Policies
# -----------------------------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "s3_oac" {
  name                              = "${var.project_name}-${var.env}-s3-oac"
  description                       = "OAC for Watch Party S3 Web and Media Buckets"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontServicePrincipalReadOnly"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.web.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.main.arn
          }
        }
      }
    ]
  })
}

resource "aws_s3_bucket_policy" "media" {
  bucket = aws_s3_bucket.media.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontServicePrincipalReadOnly"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.media.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.main.arn
          }
        }
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# 3. CloudFront Key Group for Signed Cookies Protection (/media/*)
# -----------------------------------------------------------------------------

resource "aws_cloudfront_public_key" "media" {
  name        = "${var.project_name}-${var.env}-media-key"
  encoded_key = file("${path.module}/keys/cloudfront-signing-public.pem")
  comment     = "Public key for CloudFront Signed Cookies on HLS media streams"
}

resource "aws_cloudfront_key_group" "media" {
  name    = "${var.project_name}-${var.env}-media-key-group"
  comment = "Key group for protecting /media/* HLS endpoints"
  items   = [aws_cloudfront_public_key.media.id]
}

# -----------------------------------------------------------------------------
# 4. CloudFront Function (SPA URL Rewrite) & Response Security Headers
# -----------------------------------------------------------------------------

resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "${var.project_name}-${var.env}-spa-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Rewrite non-file client-side SPA routes to /index.html"
  publish = true
  code    = <<-EOT
    function handler(event) {
        var request = event.request;
        var uri = request.uri;
        if (!uri.includes('.') && !uri.startsWith('/media/')) {
            request.uri = '/index.html';
        }
        return request;
    }
  EOT
}

resource "aws_cloudfront_response_headers_policy" "security" {
  name    = "${var.project_name}-${var.env}-security-headers"
  comment = "Security headers policy for Watch Party web app"

  security_headers_config {
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "SAMEORIGIN"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
  }
}

# -----------------------------------------------------------------------------
# 5. CloudFront Distribution
# -----------------------------------------------------------------------------

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.project_name} production distribution"
  aliases             = [var.app_domain]
  price_class         = "PriceClass_100"
  default_root_object = "index.html"

  origin {
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_id                = "S3-Web"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3_oac.id
  }

  origin {
    domain_name              = aws_s3_bucket.media.bucket_regional_domain_name
    origin_id                = "S3-Media"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3_oac.id
  }

  dynamic "origin" {
    for_each = var.api_endpoint != null ? [var.api_endpoint] : []
    content {
      domain_name = replace(replace(origin.value, "https://", ""), "http://", "")
      origin_id   = "API-Gateway"

      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  # Default behavior -> Frontend Web SPA
  default_cache_behavior {
    target_origin_id       = "S3-Web"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]

    # AWS Managed CachingOptimized Policy
    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }
  }

  # Ordered behavior -> /media/* (Protected by Signed Cookies Key Group)
  ordered_cache_behavior {
    path_pattern           = "/media/*"
    target_origin_id       = "S3-Media"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]

    # AWS Managed CachingOptimized Policy
    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    trusted_key_groups = [aws_cloudfront_key_group.media.id]
  }

  dynamic "ordered_cache_behavior" {
    for_each = var.api_endpoint != null ? ["/rooms*", "/catalog"] : []
    content {
      path_pattern           = ordered_cache_behavior.value
      target_origin_id       = "API-Gateway"
      viewer_protocol_policy = "redirect-to-https"
      allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
      cached_methods         = ["GET", "HEAD"]

      # AWS Managed CachingDisabled Policy
      cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
      # AWS Managed AllViewerExceptHostHeader Policy
      origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.env}-cloudfront"
  })
}

# -----------------------------------------------------------------------------
# 6. Route 53 DNS Alias Records (Apex Subdomain -> CloudFront)
# -----------------------------------------------------------------------------

resource "aws_route53_record" "apex_a" {
  zone_id = var.route53_zone_id
  name    = var.app_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "apex_aaaa" {
  zone_id = var.route53_zone_id
  name    = var.app_domain
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}

