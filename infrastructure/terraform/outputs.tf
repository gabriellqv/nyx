output "alb_dns_name" {
  description = "Publicly accessible DNS hostname of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "rds_endpoint" {
  description = "Connection endpoint address for the PostgreSQL instance"
  value       = aws_db_instance.postgres.endpoint
}

output "rds_database_name" {
  description = "Name of the primary financial database"
  value       = aws_db_instance.postgres.db_name
}

output "ecs_cluster_name" {
  description = "Name of the provisioned ECS container cluster"
  value       = aws_ecs_cluster.main.name
}

output "cloudwatch_api_log_group" {
  description = "CloudWatch log group destination for API container standard output"
  value       = aws_cloudwatch_log_group.api.name
}
