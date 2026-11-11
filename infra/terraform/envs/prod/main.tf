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
  lambda_zip_path        = local.lambda_zip
  tags                   = var.tags
}
