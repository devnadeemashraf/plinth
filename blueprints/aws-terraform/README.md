# AWS Production Terraform Blueprint

This blueprint provisions a scalable, production-ready AWS infrastructure using Terraform:
- **Networking**: Multi-AZ VPC with public and private subnets + NAT Gateway.
- **Compute**: ECS Fargate cluster with Application Load Balancer and auto-scaling.
- **Database**: Amazon RDS PostgreSQL 17 in private subnets with automated backups.
- **Caching**: Amazon ElastiCache (Redis 7) cluster.
- **Storage**: Amazon S3 bucket with public access block and SigV4 presigned upload support.
- **Secrets & Logs**: AWS CloudWatch logs and integration with AWS Secrets Manager.

## Quickstart

1. Configure AWS credentials:
   ```bash
   aws configure
   ```

2. Initialize and validate Terraform:
   ```bash
   cd deploy/aws
   terraform init
   terraform validate
   ```

3. Plan and apply:
   ```bash
   terraform plan -out=tfplan
   terraform apply tfplan
   ```
