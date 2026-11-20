# ------------------------------------------------------------------ instance profile

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "rtc" {
  name               = "${local.name}-instance"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json

  tags = local.tags
}

data "aws_iam_policy_document" "rtc" {
  # Only the two LiveKit parameters (architecture.md §9.9). They use the AWS managed
  # aws/ssm key, which every principal in the account may use, so no kms:Decrypt is needed.
  statement {
    sid     = "ReadLiveKitKeys"
    actions = ["ssm:GetParameter"]
    resources = [
      "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.api_key_parameter}",
      "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.api_secret_parameter}",
    ]
  }

  # Session Manager shell instead of SSH. AWS requires "*" for these actions
  # (minimal Session Manager instance profile, AWS Systems Manager User Guide).
  statement {
    sid = "SessionManager"
    actions = [
      "ssm:UpdateInstanceInformation",
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "rtc" {
  name   = "${local.name}-instance"
  role   = aws_iam_role.rtc.id
  policy = data.aws_iam_policy_document.rtc.json
}

resource "aws_iam_instance_profile" "rtc" {
  name = "${local.name}-instance"
  role = aws_iam_role.rtc.name

  tags = local.tags
}

# ------------------------------------------------------------------ stop/start schedule

data "aws_iam_policy_document" "scheduler_assume" {
  count = var.rtc_schedule_enabled ? 1 : 0

  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  count = var.rtc_schedule_enabled ? 1 : 0

  name               = "${local.name}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume[0].json

  tags = local.tags
}

data "aws_iam_policy_document" "scheduler" {
  count = var.rtc_schedule_enabled ? 1 : 0

  statement {
    actions   = ["ec2:StartInstances", "ec2:StopInstances"]
    resources = [aws_instance.rtc.arn]
  }
}

resource "aws_iam_role_policy" "scheduler" {
  count = var.rtc_schedule_enabled ? 1 : 0

  name   = "${local.name}-scheduler"
  role   = aws_iam_role.scheduler[0].id
  policy = data.aws_iam_policy_document.scheduler[0].json
}

resource "aws_scheduler_schedule" "rtc" {
  for_each = var.rtc_schedule_enabled ? {
    start = { expression = var.schedule_start_expression, action = "startInstances" }
    stop  = { expression = var.schedule_stop_expression, action = "stopInstances" }
  } : {}

  name                         = "${local.name}-${each.key}"
  schedule_expression          = each.value.expression
  schedule_expression_timezone = var.schedule_timezone

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:ec2:${each.value.action}"
    role_arn = aws_iam_role.scheduler[0].arn
    input    = jsonencode({ InstanceIds = [aws_instance.rtc.id] })
  }
}
