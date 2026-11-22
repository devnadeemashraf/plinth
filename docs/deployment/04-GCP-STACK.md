# Google Cloud Platform (GCP) Production Operator Handbook

This handbook details deploying `plinth` on GCP using Google Cloud Run, Cloud SQL, Memorystore Redis, and Cloud Storage via the Terraform blueprint in `blueprints/gcp-terraform/`.

---

## 1. Architecture Overview

```
                      ┌───────────────────────────────┐
                      │ Google Cloud Armor / CDN / DNS │
                      └───────────────┬───────────────┘
                                      │ HTTPS
                      ┌───────────────▼───────────────┐
                      │ Google Cloud Run v2           │
                      │ (Auto-scale 1-10 instances)   │
                      └───────┬───────────────┬───────┘
                              │ Serverless    │
                              │ VPC Access    │
            ┌─────────────────┴───────┐       │
            │                         │       │
   ┌────────▼─────────┐    ┌──────────▼─────┐ │
   │ Cloud SQL        │    │ Memorystore    │ │
   │ PostgreSQL 17    │    │ for Redis      │ │
   └──────────────────┘    └────────────────┘ │
                                              │
                                   ┌──────────▼─────────┐
                                   │ Cloud Storage      │
                                   │ GCS Bucket         │
                                   └────────────────────┘
```

- **Cloud Run v2**: Serverless containers running Node 24 Alpine. Minimum instances set to `1` in production to eliminate cold starts.
- **Serverless VPC Access**: Connects Cloud Run instances directly to private RFC 1918 addresses in VPC.
- **Cloud SQL PostgreSQL 17**: Dedicated PostgreSQL instance with automated daily backups and high availability option.
- **Memorystore for Redis**: Managed Redis instance for caching and job queue coordination.
- **Cloud Storage (GCS)**: S3-compatible or native object storage with uniform bucket-level access.

---

## 2. Secrets Management
Secrets are managed in **Google Secret Manager**:
- Injected into Cloud Run as container environment variables:
  - `projects/$PROJECT_ID/secrets/master-encryption-key/versions/latest` -> `MASTER_ENCRYPTION_KEY`
  - `projects/$PROJECT_ID/secrets/jwt-secret/versions/latest` -> `JWT_SECRET`
  - `projects/$PROJECT_ID/secrets/database-url/versions/latest` -> `DATABASE_URL`

---

## 3. Cost Breakdown (Monthly Estimates)

| Component | Starter Tier (~50 req/s) | Growth Tier (~1,000 req/s) |
|---|---|---|
| **Cloud Run (CPU/RAM/Requests)** | 1 min-instance ~$15.00 | 3-6 avg instances ~$85.00 |
| **Cloud SQL PostgreSQL** | `db-custom-1-3840` ~$45.00 | `db-custom-4-16384` (HA) ~$210.00 |
| **Memorystore Redis** | 1 GB Basic ~$35.00 | 5 GB Standard (HA) ~$180.00 |
| **Cloud Storage & Egress** | ~$4.00 | ~$30.00 |
| **Serverless VPC Connector** | 2 e2-micro ~$8.00 | ~$15.00 |
| **Estimated Total** | **~$107 / month** | **~$520 / month** |

---

## 4. Operational Best Practices
- **Graceful Termination**: Cloud Run sends `SIGTERM` 10 seconds before forcibly killing an instance. `plinth` handles `SIGTERM` within `packages/core/src/ports/lifecycle.ts` to cleanly drain active HTTP connections and flush outbox events.
- **Health Probes**:
  - `startup_probe`: Uses `/health/ready` with 5s period to verify DB connectivity before serving live requests.
  - `liveness_probe`: Uses `/health/live` with 15s period (zero I/O).
- **Log Correlation**: Cloud Run automatically captures Pino JSON stdout and correlates logs into Google Cloud Logging using `traceId`.
