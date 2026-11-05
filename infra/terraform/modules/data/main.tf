terraform {
  required_version = ">= 1.15.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

# Main Single-Table DynamoDB: Media catalog, Room meta, Playback state, Participants, Chat
resource "aws_dynamodb_table" "main" {
  name         = "${var.project_name}-${var.env}-main"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(
    var.tags,
    {
      Name  = "${var.project_name}-${var.env}-main"
      Owner = "backend"
    }
  )
}

# Connections DynamoDB Table: WebSocket active connections and room lookup
resource "aws_dynamodb_table" "connections" {
  name         = "${var.project_name}-${var.env}-connections"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "connectionId"

  attribute {
    name = "connectionId"
    type = "S"
  }

  attribute {
    name = "roomId"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  global_secondary_index {
    name            = "byRoom"
    projection_type = "INCLUDE"
    non_key_attributes = [
      "participantId"
    ]

    key_schema {
      attribute_name = "roomId"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "connectionId"
      key_type       = "RANGE"
    }
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(
    var.tags,
    {
      Name  = "${var.project_name}-${var.env}-connections"
      Owner = "backend"
    }
  )
}
