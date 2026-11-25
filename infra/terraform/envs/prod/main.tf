locals {
  lambda_zip = "${path.root}/../../../../backend/dist/backend.zip"
}

# 0. Modul Network: VPC, 1 Public Subnet, IGW (No NAT Gateway, Zero Cost)
module "network" {
  source       = "../../modules/network"
  project_name = var.project_name
  env          = var.env
  tags         = var.tags
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
  lambda_zip_path        = local.lambda_zip
  tags                   = var.tags
}

# 5. Modul DNS: Route 53 Hosted Zone & ACM Certificate di us-east-1
module "dns" {
  source       = "../../modules/dns"
  project_name = var.project_name
  env          = var.env
  app_domain   = var.app_domain
  tags         = var.tags
  providers = {
    aws.us_east_1 = aws.us_east_1
  }
}

# 6. Modul Edge: S3 Web & Media Buckets, CloudFront CDN, Signed Cookies & Route 53 Alias
module "edge" {
  source              = "../../modules/edge"
  project_name        = var.project_name
  env                 = var.env
  app_domain          = var.app_domain
  acm_certificate_arn = module.dns.acm_certificate_arn
  route53_zone_id     = module.dns.zone_id
  api_endpoint        = module.api.api_endpoint
  tags                = var.tags
}

# 7. Modul Observability: AWS Budgets Alert, SNS Topic & CloudWatch Dashboard
module "observability" {
  source                = "../../modules/observability"
  project_name          = var.project_name
  env                   = var.env
  api_gateway_http_name = module.api.api_id
  api_gateway_ws_name   = module.realtime.websocket_api_id
  tags                  = var.tags
}

# 8. Modul RTC: LiveKit EC2, Elastic IP, Security Group & Route 53 Records
module "rtc" {
  source           = "../../modules/rtc"
  project_name     = var.project_name
  env              = var.env
  aws_region       = var.aws_region
  vpc_id           = module.network.vpc_id
  public_subnet_id = module.network.public_subnet_id
  route53_zone_id  = module.dns.zone_id
  app_domain       = var.app_domain
  instance_type    = var.rtc_instance_type
  tags             = var.tags
}
