resource "aws_db_subnet_group" "main" {
  name       = "${var.app_name}-${var.environment}"
  subnet_ids = aws_subnet.private[*].id

  tags = {
    Name = "${var.app_name}-${var.environment}"
  }
}

resource "aws_db_instance" "main" {
  identifier        = "${var.app_name}-${var.environment}"
  engine            = "postgres"
  engine_version    = "16.3"
  instance_class    = "db.t3.medium"
  allocated_storage = 20
  storage_type      = "gp3"

  db_name  = "sentellent"
  username = "sentellent"
  password = random_password.db_password.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"

  skip_final_snapshot     = false
  final_snapshot_identifier = "${var.app_name}-${var.environment}-final"

  auto_minor_version_upgrade = true

  tags = {
    Name = "${var.app_name}-${var.environment}"
  }
}
