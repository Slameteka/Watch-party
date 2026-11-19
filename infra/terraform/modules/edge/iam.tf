# Policy for whoever runs media/scripts/publish_media.py (RTC/Media). Attach it to the
# rtc-media IAM group in envs/prod (IAM users/groups are owned by Platform, architecture.md §12.5).
data "aws_iam_policy_document" "media_publisher" {
  statement {
    sid       = "ListMediaPrefixes"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.this["media"].arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["media/*", "posters/*"]
    }
  }

  statement {
    sid    = "WriteMediaObjects"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:AbortMultipartUpload",
    ]
    resources = [
      "${aws_s3_bucket.this["media"].arn}/media/*",
      "${aws_s3_bucket.this["media"].arn}/posters/*",
    ]
  }

  dynamic "statement" {
    for_each = var.catalog_table_arn == null ? [] : [var.catalog_table_arn]
    content {
      sid       = "WriteCatalogItems"
      effect    = "Allow"
      actions   = ["dynamodb:PutItem"]
      resources = [statement.value]

      # Only catalog items (PK = CATALOG), never room data.
      condition {
        test     = "ForAllValues:StringEquals"
        variable = "dynamodb:LeadingKeys"
        values   = ["CATALOG"]
      }
    }
  }
}

resource "aws_iam_policy" "media_publisher" {
  name        = "${local.name_prefix}-media-publisher"
  description = "Upload HLS/posters to the media bucket and write catalog items"
  policy      = data.aws_iam_policy_document.media_publisher.json

  tags = merge(var.tags, {
    Name  = "${local.name_prefix}-media-publisher"
    Owner = "rtc-media"
  })
}

# Apex alias records (ADR-0006). Created only with a custom domain certificate.
resource "aws_route53_record" "apex" {
  for_each = (var.route53_zone_id != null && local.use_custom_domain) ? toset(["A", "AAAA"]) : toset([])

  zone_id = var.route53_zone_id
  name    = var.app_domain
  type    = each.value

  alias {
    name                   = aws_cloudfront_distribution.this.domain_name
    zone_id                = aws_cloudfront_distribution.this.hosted_zone_id
    evaluate_target_health = false
  }
}
