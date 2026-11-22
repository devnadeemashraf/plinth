# AWS Production Infrastructure & Terraform Operator Handbook

This handbook details deploying `plinth` on AWS using the Terraform blueprint in `blueprints/aws-terraform/`.

---

## 1. Architectural Components

```
                   ┌───────────────────────────────┐
                   │ Application Load Balancer    │
                   │ (TLS / Route53 / WAF v2)     │
                   └───────────────┬───────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              │                                         │
    ┌─────────▼──────────────┐                ┌─────────▼──────────────┐
    │ ECS Fargate Task (AZ-a)│                │ ECS Fargate Task (AZ-b)│
    │ Plinth Ingress         │                │ Plinth Ingress         │
    └─────────┬──────────────┘                └─────────┬──────────────┘
              │                                         │
              └────────────────────┬────────────────────┘
                                   │
     ┌─────────────────────────────┼─────────────────────────────┐
     │                             │                             │
┌────▼─────────────────────┐ ┌─────▼────────────────────┐ ┌──────▼─────────────────────┐
│ RDS PostgreSQL 17        │ │ ElastiCache (Redis 7)    │ │ S3 Storage Bucket           │
│ Multi-AZ + Private SG    │ │ Multi-AZ Cluster         │ │ SigV4 Presigned Uploads     │
└──────────────────────────┘ └──────────────────────────┘ └─────────────────────────────┘
```

- **VPC**: 2 Availability Zones, 2 public subnets (ALB, NAT), 2 private subnets (ECS, RDS, Redis).
- **ECS Fargate**: Serverless container execution with auto-scaling based on CPU (70%) and Memory (80%).
- **RDS PostgreSQL 17**: Dedicated database with automated snapshots (7-day retention) and gp3 storage.
- **ElastiCache**: Redis / Valkey cluster in private subnets with encryption in transit.
- **S3 Bucket**: Private bucket with public access block for avatar storage and file attachments.

---

## 2. Secrets Management
Secrets are managed in **AWS Secrets Manager** and injected into ECS task definitions:
- `MASTER_ENCRYPTION_KEY`: 32-byte envelope encryption key.
- `JWT_SECRET`: Ed25519 or HMAC JWT signing secret.
- `DATABASE_URL`: Retrieved via RDS credentials integration.

---

## 3. Cost Breakdown (Monthly Estimates)

| Component | Starter Tier (~50 req/s) | Growth Tier (~1,000 req/s) |
|---|---|---|
| **ALB (Load Balancer)** | ~$18.00 | ~$25.00 |
| **ECS Fargate** | 2 tasks (0.5 vCPU, 1 GB) ~$22.00 | 4-8 tasks (1 vCPU, 2 GB) ~$140.00 |
| **RDS PostgreSQL** | `db.t4g.micro` (Single-AZ) ~$15.00 | `db.r7g.large` (Multi-AZ) ~$260.00 |
| **ElastiCache Redis** | `cache.t4g.micro` ~$13.00 | `cache.m7g.large` ~$110.00 |
| **S3 & Data Transfer** | ~$5.00 | ~$35.00 |
| **NAT Gateway (1x)** | ~$32.00 | ~$65.00 (2x Multi-AZ) |
| **Estimated Total** | **~$105 / month** | **~$635 / month** |

*Tip: For ultra-lean AWS staging, consider AWS App Runner with RDS `db.t4g.micro` to eliminate NAT Gateway costs ($32/mo).*

---

## 4. Disaster Recovery & Zero-Downtime Rolling Deploys
- **Rolling Deploys**: ECS updates tasks using `minimumHealthyPercent = 100` and `maximumPercent = 200`. New tasks must pass `/health/live` and `/health/ready` before old tasks receive `SIGTERM`.
- **Database Failover**: RDS Multi-AZ automatically detects primary failure and completes synchronous failover within 60-120 seconds.
- **S3 Versioning**: Enable versioning on S3 storage bucket to prevent accidental object deletion.
