output "alb_dns" {
  description = "ALB DNS name"
  value       = aws_lb.main.dns_name
}

output "backend_service_url" {
  description = "Backend service URL"
  value = local.use_https
    ? "https://${var.domain_name}/api/v1"
    : "http://${aws_lb.main.dns_name}/api/v1"
}

output "frontend_url" {
  description = "Frontend URL"
  value = local.use_https
    ? "https://${var.domain_name}"
    : "http://${aws_lb.main.dns_name}"
}

output "rds_endpoint" {
  description = "RDS endpoint"
  value       = aws_db_instance.main.endpoint
}

output "ecr_backend_repo" {
  description = "Backend ECR repository name"
  value       = aws_ecr_repository.backend.name
}

output "ecr_frontend_repo" {
  description = "Frontend ECR repository name"
  value       = aws_ecr_repository.frontend.name
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "ecs_backend_service" {
  description = "Backend ECS service name"
  value       = aws_ecs_service.backend.name
}

output "ecs_frontend_service" {
  description = "Frontend ECS service name"
  value       = aws_ecs_service.frontend.name
}
