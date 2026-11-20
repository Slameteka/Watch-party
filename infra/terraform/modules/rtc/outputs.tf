output "instance_id" {
  description = "LiveKit EC2 instance ID (for Session Manager and the runbook)"
  value       = aws_instance.rtc.id
}

output "public_ip" {
  description = "Elastic IP of the LiveKit instance"
  value       = aws_eip.rtc.public_ip
}

output "livekit_url" {
  description = "WebSocket URL for clients; pass to the api module as livekit_url"
  value       = "wss://${local.rtc_domain}"
}

output "rtc_domain" {
  description = "Signaling hostname"
  value       = local.rtc_domain
}

output "turn_domain" {
  description = "TURN/TLS hostname"
  value       = local.turn_domain
}

output "security_group_id" {
  description = "Security group of the LiveKit instance"
  value       = aws_security_group.rtc.id
}
