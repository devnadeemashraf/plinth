variable "aws_region" {
  type        = string
  description = "AWS region for deployment"
  default     = "us-east-1"
}

variable "project_name" {
  type        = string
  description = "Project name identifier"
  default     = "plinth-service"
}

variable "environment" {
  type        = string
  description = "Deployment environment (staging, production)"
  default     = "production"
}

variable "db_instance_class" {
  type        = string
  description = "RDS Postgres instance class"
  default     = "db.t4g.micro"
}
