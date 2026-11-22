locals {
  lambda_zip = "${path.root}/../../../../backend/dist/backend.zip"
}

# 1. Modul Data: DynamoDB Main & Connections Tables
module "data" {
  source       = "../../modules/data"
  project_name = var.project_name
  env          = var.env
  tags         = var.tags
}

# 2. Modul Auth: Cognito User Pool & App Client
module "auth" {
  source       = "../../modules/auth"
  project_name = var.project_name
  env          = var.env
  app_domain   = var.app_domain
  tags         = var.tags
}

# 3. Modul Realtime: WebSocket API Gateway & 4 Lambda Functions
module "realtime" {
  source                 = "../../modules/realtime"
  project_name           = var.project_name
  env                    = var.env
  aws_region             = var.aws_region
  app_domain             = var.app_domain
  main_table_name        = module.data.main_table_name
  main_table_arn         = module.data.main_table_arn
  connections_table_name = module.data.connections_table_name
  connections_table_arn  = module.data.connections_table_arn
  room_max_participants  = var.room_max_participants
  lambda_zip_path        = local.lambda_zip
  tags                   = var.tags
}

# 4. Modul API: HTTP API Gateway & REST Lambda Function
module "api" {
  source                 = "../../modules/api"
  project_name           = var.project_name
  env                    = var.env
  aws_region             = var.aws_region
  app_domain             = var.app_domain
  main_table_name        = module.data.main_table_name
  main_table_arn         = module.data.main_table_arn
  connections_table_name = module.data.connections_table_name
  connections_table_arn  = module.data.connections_table_arn
  cognito_user_pool_id   = module.auth.user_pool_id
  cognito_endpoint       = module.auth.user_pool_endpoint
  cognito_client_id      = module.auth.user_pool_client_id
  room_max_participants  = var.room_max_participants
  ws_management_endpoint = module.realtime.ws_management_endpoint
  ws_execution_arn       = module.realtime.websocket_api_execution_arn
  livekit_url            = module.rtc.livekit_url
  lambda_zip_path        = local.lambda_zip
  tags                   = var.tags
}

# Subnet publik untuk instance LiveKit. Selama modul network belum ada, pakai
# subnet default VPC (lihat README modul rtc). Ganti ke module.network saat tersedia.
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default_public" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

# 5. Modul RTC: EC2 LiveKit (SFU), TURN, dan Caddy TLS
# Pemilik modul: RTC/Media. Wiring di envs/ oleh Platform (RACI PRD §11.2).
# Prasyarat apply: parameter SSM livekit-api-key & livekit-api-secret (bootstrap §7)
# dan DNS rtc./turn. mengarah ke EIP agar Caddy bisa menerbitkan sertifikat.
module "rtc" {
  source                = "../../modules/rtc"
  project_name          = var.project_name
  env                   = var.env
  aws_region            = var.aws_region
  app_domain            = var.app_domain
  subnet_id             = sort(data.aws_subnets.default_public.ids)[0]
  route53_zone_id       = var.route53_zone_id
  rtc_instance_type     = var.rtc_instance_type
  room_max_participants = var.room_max_participants
  rtc_schedule_enabled  = var.rtc_schedule_enabled
  tags                  = var.tags
}
