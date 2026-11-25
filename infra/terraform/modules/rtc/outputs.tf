output "instance_id" {
  description = "ID of the LiveKit EC2 instance"
  value       = aws_instance.rtc.id
}

output "public_ip" {
  description = "Elastic IP of the LiveKit EC2 instance"
  value       = aws_eip.rtc.public_ip
}

output "rtc_url" {
  description = "Public WSS URL for LiveKit"
  value       = "wss://rtc.${var.app_domain}"
}

output "turn_domain" {
  description = "TURN domain for LiveKit"
  value       = "turn.${var.app_domain}"
}

output "security_group_id" {
  description = "Security group ID for LiveKit instance"
  value       = aws_security_group.rtc.id
}

output "livekit_api_key_ssm_name" {
  description = "SSM parameter name for LiveKit API key"
  value       = aws_ssm_parameter.livekit_api_key.name
}

output "livekit_api_secret_ssm_name" {
  description = "SSM parameter name for LiveKit API secret"
  value       = aws_ssm_parameter.livekit_api_secret.name
}
