data "aws_ssm_parameter" "al2023_ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

# 1. Credentials for LiveKit
resource "random_string" "livekit_api_key" {
  length  = 16
  special = false
}

resource "random_password" "livekit_api_secret" {
  length  = 32
  special = false
}

resource "aws_ssm_parameter" "livekit_api_key" {
  name        = "/${var.project_name}/${var.env}/livekit/api_key"
  description = "LiveKit API Key"
  type        = "String"
  value       = random_string.livekit_api_key.result
  tags        = var.tags
}

resource "aws_ssm_parameter" "livekit_api_secret" {
  name        = "/${var.project_name}/${var.env}/livekit/api_secret"
  description = "LiveKit API Secret"
  type        = "SecureString"
  value       = random_password.livekit_api_secret.result
  tags        = var.tags
}

resource "aws_ssm_parameter" "livekit_url" {
  name        = "/${var.project_name}/${var.env}/livekit/url"
  description = "LiveKit Server WSS URL"
  type        = "String"
  value       = "wss://rtc.${var.app_domain}"
  tags        = var.tags
}

# 2. IAM Role & Profile for SSM Session Manager (No port 22 needed)
resource "aws_iam_role" "rtc" {
  name = "${var.project_name}-${var.env}-rtc-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.rtc.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "rtc" {
  name = "${var.project_name}-${var.env}-rtc-profile"
  role = aws_iam_role.rtc.name
  tags = var.tags
}

# 3. Security Group for WebRTC and Caddy
resource "aws_security_group" "rtc" {
  name        = "${var.project_name}-${var.env}-rtc-sg"
  description = "Security group for LiveKit WebRTC and Caddy TLS"
  vpc_id      = var.vpc_id

  # HTTP (Let's Encrypt validation)
  ingress {
    description = "HTTP ACME challenge"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTPS (Caddy reverse proxy to LiveKit signaling)
  ingress {
    description = "HTTPS Caddy TLS & LiveKit WebRTC signaling"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # LiveKit WebRTC TCP fallback
  ingress {
    description = "LiveKit WebRTC TCP fallback"
    from_port   = 7881
    to_port     = 7881
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # LiveKit TURN UDP
  ingress {
    description = "LiveKit TURN UDP"
    from_port   = 3478
    to_port     = 3478
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # LiveKit WebRTC Media UDP range
  ingress {
    description = "LiveKit WebRTC media UDP range"
    from_port   = 50000
    to_port     = 60000
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Outbound
  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.env}-rtc-sg"
  })
}

# 4. Elastic IP
resource "aws_eip" "rtc" {
  domain = "vpc"
  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.env}-rtc-eip"
  })
}

# 5. EC2 Instance
resource "aws_instance" "rtc" {
  ami                    = data.aws_ssm_parameter.al2023_ami.value
  instance_type          = var.instance_type
  subnet_id              = var.public_subnet_id
  vpc_security_group_ids = [aws_security_group.rtc.id]
  iam_instance_profile   = aws_iam_instance_profile.rtc.name

  root_block_device {
    volume_size           = var.volume_size
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
    tags = merge(var.tags, {
      Name = "${var.project_name}-${var.env}-rtc-root"
    })
  }

  user_data = <<-EOF
    #!/bin/bash
    set -xe
    dnf update -y
    dnf install -y docker
    systemctl enable --now docker

    mkdir -p /opt/livekit

    cat << 'LKCONF' > /opt/livekit/livekit.yaml
    port: 7880
    bind_addresses:
      - ""
    rtc:
      tcp_port: 7881
      port_range_start: 50000
      port_range_end: 60000
      use_external_ip: true
    keys:
      ${random_string.livekit_api_key.result}: ${random_password.livekit_api_secret.result}
    turn:
      enabled: true
      domain: turn.${var.app_domain}
      udp_port: 3478
    LKCONF

    cat << 'CADCONF' > /opt/livekit/Caddyfile
    rtc.${var.app_domain} {
        reverse_proxy localhost:7880
    }
    CADCONF

    cat << 'COMPOSE' > /opt/livekit/docker-compose.yaml
    services:
      livekit:
        image: livekit/livekit-server:v1.8.3
        restart: unless-stopped
        network_mode: host
        volumes:
          - /opt/livekit/livekit.yaml:/etc/livekit.yaml
        command: --config /etc/livekit.yaml

      caddy:
        image: caddy:2.8.4-alpine
        restart: unless-stopped
        network_mode: host
        volumes:
          - /opt/livekit/Caddyfile:/etc/caddy/Caddyfile
          - /opt/caddy_data:/data
          - /opt/caddy_config:/config
    COMPOSE

    dnf install -y docker-compose-plugin || (curl -SL https://github.com/docker/compose/releases/download/v2.29.2/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose && chmod +x /usr/local/bin/docker-compose)

    cd /opt/livekit
    docker compose up -d || docker-compose up -d
  EOF

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.env}-rtc-instance"
  })

  lifecycle {
    ignore_changes = [ami]
  }
}

# 6. Associate Elastic IP
resource "aws_eip_association" "rtc" {
  instance_id   = aws_instance.rtc.id
  allocation_id = aws_eip.rtc.id
}

# 7. DNS Records in Route 53
resource "aws_route53_record" "rtc" {
  zone_id = var.route53_zone_id
  name    = "rtc.${var.app_domain}"
  type    = "A"
  ttl     = 300
  records = [aws_eip.rtc.public_ip]
}

resource "aws_route53_record" "turn" {
  zone_id = var.route53_zone_id
  name    = "turn.${var.app_domain}"
  type    = "A"
  ttl     = 300
  records = [aws_eip.rtc.public_ip]
}
