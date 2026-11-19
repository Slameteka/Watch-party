locals {
  # AWS managed cache policies (verified (AWS docs): "Use managed cache policies").
  # Neither includes cookies, query strings, or headers in the cache key, so all viewers share
  # one cached copy (NFR-1.8, R-12). Signed cookies are still checked by CloudFront.
  cache_policy_caching_optimized              = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  cache_policy_caching_optimized_uncompressed = "b2884449-e4de-46a7-ac36-70bc7f1ddd6d"

  use_custom_domain       = var.acm_certificate_arn != null
  signing_public_key_path = coalesce(var.signing_public_key_path, "${path.module}/keys/cloudfront-signing-public.pem")
}

resource "aws_cloudfront_origin_access_control" "s3" {
  name                              = "${local.name_prefix}-s3-oac"
  description                       = "OAC for the web and media buckets"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Public half of the signed-cookie key pair. The private key is only in SSM
# (/<project_name>/<env>/cloudfront-signing-private-key, docs/runbooks/bootstrap.md §7).
resource "aws_cloudfront_public_key" "media_signing" {
  name_prefix = "${local.name_prefix}-media-"
  comment     = "Signed cookies for /media/* (ADR-0005)"
  encoded_key = file(local.signing_public_key_path)

  # A new key (rotation) is created before the old one is removed from the key group.
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_cloudfront_key_group" "media" {
  name    = "${local.name_prefix}-media"
  comment = "Trusted signers for /media/*"
  items   = [aws_cloudfront_public_key.media_signing.id]
}

resource "aws_cloudfront_function" "spa_routing" {
  name    = "${local.name_prefix}-spa-routing"
  runtime = "cloudfront-js-2.0"
  comment = "Rewrite SPA paths without a file extension to /index.html"
  publish = true
  code    = file("${path.module}/functions/spa-routing.js")
}

resource "aws_cloudfront_response_headers_policy" "security" {
  name    = "${local.name_prefix}-security-headers"
  comment = "Security headers for all responses (architecture.md §9.5)"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = false
      preload                    = false
      override                   = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    dynamic "content_security_policy" {
      for_each = var.content_security_policy == "" ? [] : [var.content_security_policy]
      content {
        content_security_policy = content_security_policy.value
        override                = true
      }
    }
  }
}

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  comment             = "${local.name_prefix} web app and HLS media"
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  price_class         = var.price_class
  default_root_object = "index.html"
  aliases             = local.use_custom_domain ? [var.app_domain] : []

  origin {
    origin_id                = "web"
    domain_name              = aws_s3_bucket.this["web"].bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  origin {
    origin_id                = "media"
    domain_name              = aws_s3_bucket.this["media"].bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  # Default: SPA, public.
  default_cache_behavior {
    target_origin_id           = "web"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = local.cache_policy_caching_optimized
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_routing.arn
    }
  }

  # HLS films: signed cookies required (trusted key group). Without valid cookies -> 403.
  ordered_cache_behavior {
    path_pattern               = "/media/*"
    target_origin_id           = "media"
    viewer_protocol_policy     = "https-only"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = false
    cache_policy_id            = local.cache_policy_caching_optimized_uncompressed
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
    trusted_key_groups         = [aws_cloudfront_key_group.media.id]
  }

  # Catalog posters: public.
  ordered_cache_behavior {
    path_pattern               = "/posters/*"
    target_origin_id           = "media"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = false
    cache_policy_id            = local.cache_policy_caching_optimized_uncompressed
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
  }

  # No custom_error_response on purpose: it applies to every behavior and would turn the
  # /media/* 403 into an HTML page (ADR-0005). SPA routing is done by the CloudFront Function.

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn            = local.use_custom_domain ? var.acm_certificate_arn : null
    ssl_support_method             = local.use_custom_domain ? "sni-only" : null
    minimum_protocol_version       = local.use_custom_domain ? "TLSv1.2_2021" : null
    cloudfront_default_certificate = !local.use_custom_domain
  }

  tags = merge(var.tags, {
    Name  = "${local.name_prefix}-cdn"
    Owner = "platform"
  })
}
