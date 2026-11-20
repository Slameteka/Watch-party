locals {
  name        = "${var.project_name}-${var.env}-rtc"
  rtc_domain  = "rtc.${var.app_domain}"
  turn_domain = "turn.${var.app_domain}"

  param_prefix         = "/${var.project_name}/${var.env}"
  api_key_parameter    = "${local.param_prefix}/livekit-api-key"
  api_secret_parameter = "${local.param_prefix}/livekit-api-secret"

  # t4g is Graviton (arm64); the other Free plan types are x86_64.
  architecture = startswith(var.rtc_instance_type, "t4g.") ? "arm64" : "x86_64"
  burstable    = startswith(var.rtc_instance_type, "t3.") || startswith(var.rtc_instance_type, "t4g.")

  tags = merge(var.tags, { Owner = "rtc-media" })

  # Ports from LiveKit's VM deployment and firewall docs (architecture.md §9.9).
  # Rule descriptions must stay in the EC2 charset (no apostrophes).
  ingress_rules = {
    acme_http = { protocol = "tcp", from = 80, to = 80, description = "Lets Encrypt HTTP-01 challenge" }
    tls       = { protocol = "tcp", from = 443, to = 443, description = "Caddy: WSS signaling (rtc.) and TURN/TLS (turn.) by SNI" }
    ice_tcp   = { protocol = "tcp", from = 7881, to = 7881, description = "WebRTC ICE over TCP" }
    turn_udp  = { protocol = "udp", from = 3478, to = 3478, description = "TURN/UDP and STUN" }
    ice_udp   = { protocol = "udp", from = 50000, to = 60000, description = "WebRTC ICE over UDP (media)" }
  }
}

data "aws_caller_identity" "current" {}

data "aws_subnet" "selected" {
  id = var.subnet_id
}

# Latest Amazon Linux 2023 AMI from the public SSM parameter. lifecycle.ignore_changes on the
# instance keeps a new AMI release from replacing a running instance.
data "aws_ssm_parameter" "al2023_ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-${local.architecture}"
}

# ------------------------------------------------------------------ network

resource "aws_security_group" "rtc" {
  name        = local.name
  description = "LiveKit SFU, TURN, and Caddy TLS; no SSH"
  vpc_id      = data.aws_subnet.selected.vpc_id

  tags = merge(local.tags, { Name = local.name })
}

resource "aws_vpc_security_group_ingress_rule" "rtc" {
  for_each = local.ingress_rules

  security_group_id = aws_security_group.rtc.id
  description       = each.value.description
  ip_protocol       = each.value.protocol
  from_port         = each.value.from
  to_port           = each.value.to
  cidr_ipv4         = "0.0.0.0/0"

  tags = merge(local.tags, { Name = "${local.name}-${each.key}" })
}

# Outbound is open: Docker image pulls, SSM, Let's Encrypt, and WebRTC media to any viewer.
resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.rtc.id
  description       = "All outbound"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"

  tags = merge(local.tags, { Name = "${local.name}-egress" })
}

# The ENI exists before the instance so the Elastic IP is attached when the instance boots.
resource "aws_network_interface" "rtc" {
  subnet_id       = var.subnet_id
  security_groups = [aws_security_group.rtc.id]
  description     = "LiveKit primary interface"

  tags = merge(local.tags, { Name = local.name })
}

resource "aws_eip" "rtc" {
  domain            = "vpc"
  network_interface = aws_network_interface.rtc.id

  tags = merge(local.tags, { Name = local.name })
}

# ------------------------------------------------------------------ instance

resource "aws_instance" "rtc" {
  ami                  = data.aws_ssm_parameter.al2023_ami.insecure_value
  instance_type        = var.rtc_instance_type
  iam_instance_profile = aws_iam_instance_profile.rtc.name
  monitoring           = false

  primary_network_interface {
    network_interface_id = aws_network_interface.rtc.id
  }

  # Standard credits avoid surprise charges from T-instance unlimited mode.
  dynamic "credit_specification" {
    for_each = local.burstable ? [1] : []
    content {
      cpu_credits = "standard"
    }
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 8
    encrypted             = true
    delete_on_termination = true
  }

  user_data = templatefile("${path.module}/templates/user_data.sh.tftpl", {
    aws_region           = var.aws_region
    api_key_parameter    = local.api_key_parameter
    api_secret_parameter = local.api_secret_parameter
    livekit_image        = var.livekit_image
    caddy_image          = var.caddy_image
    livekit_yaml = templatefile("${path.module}/templates/livekit.yaml.tftpl", {
      public_ip        = aws_eip.rtc.public_ip
      turn_domain      = local.turn_domain
      max_participants = var.room_max_participants
    })
    caddy_yaml = templatefile("${path.module}/templates/caddy.yaml.tftpl", {
      rtc_domain  = local.rtc_domain
      turn_domain = local.turn_domain
      private_ip  = aws_network_interface.rtc.private_ip
    })
  })
  # A config or version change builds a fresh instance instead of editing it in place.
  user_data_replace_on_change = true

  lifecycle {
    ignore_changes = [ami]
  }

  tags = merge(local.tags, { Name = local.name })
}

# ------------------------------------------------------------------ DNS

resource "aws_route53_record" "rtc" {
  for_each = var.route53_zone_id == null ? toset([]) : toset([local.rtc_domain, local.turn_domain])

  zone_id = var.route53_zone_id
  name    = each.value
  type    = "A"
  ttl     = 300
  records = [aws_eip.rtc.public_ip]
}
