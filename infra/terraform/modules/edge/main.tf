data "aws_caller_identity" "current" {}

locals {
  name_prefix = "${var.project_name}-${var.env}"
  account_id  = data.aws_caller_identity.current.account_id

  buckets = {
    web   = { name = "${local.name_prefix}-web-${local.account_id}", owner = "platform" }
    media = { name = "${local.name_prefix}-media-${local.account_id}", owner = "rtc-media" }
  }
}

# Private buckets behind CloudFront (architecture.md §9.5). web = SPA build, media = HLS + posters.
resource "aws_s3_bucket" "this" {
  for_each = local.buckets

  bucket = each.value.name

  tags = merge(var.tags, {
    Name  = each.value.name
    Owner = each.value.owner
  })
}

resource "aws_s3_bucket_ownership_controls" "this" {
  for_each = aws_s3_bucket.this

  bucket = each.value.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "this" {
  for_each = aws_s3_bucket.this

  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  for_each = aws_s3_bucket.this

  bucket = each.value.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Only this distribution (OAC) may read objects; plain HTTP is denied.
data "aws_iam_policy_document" "bucket" {
  for_each = aws_s3_bucket.this

  statement {
    sid       = "AllowCloudFrontReadViaOAC"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${each.value.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.this.arn]
    }
  }

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [each.value.arn, "${each.value.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "this" {
  for_each = aws_s3_bucket.this

  bucket = each.value.id
  policy = data.aws_iam_policy_document.bucket[each.key].json

  depends_on = [aws_s3_bucket_public_access_block.this]
}
