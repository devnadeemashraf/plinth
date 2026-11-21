# `plinth` Deployment & Observability Handbook Blueprint (Target: Chunk C12)

When building Chunk C12, Gemini MUST author deep, human-readable, operator-ready handbooks under `docs/deployment/` and `docs/adapters/` matching every requirement below. Always verify current provider CLI/IaC syntax online before writing Terraform/YAML configs.

---

## 1. Required Deployment Blueprints & Handbooks (`docs/deployment/`)

Each handbook must explain **every single layer**: what it does, why it exists, what traffic/cost to expect, exact deployment steps, secrets injection, zero-downtime DB migration flow, backup/restore (RPO & RTO), and troubleshooting.

1. **`docs/deployment/00-ARCHITECTURE-AND-OBSERVABILITY.md`**
   - Layer-by-layer anatomy: Edge TLS / Reverse Proxy -> Stateless Node.js App (`plinth`) -> Connection Pooling -> SQL Datastore -> Cache/Queue/Outbox Workers -> Object Storage -> Telemetry Pipeline.
   - **How to Read & Understand Observability:**
     - **RED Metrics** (Rate, Errors, Duration p50/p95/p99) — what healthy vs. degraded looks like, alerting thresholds against the 99.9% SLO error budget.
     - **USE Metrics** (CPU, Node.js event-loop lag, heap usage, DB pool saturation, Redis hit ratio, Outbox/BullMQ queue depth & DLQ count).
     - **Structured Logs & Traces:** How to correlate a user's RFC 9457 `traceId` from an HTTP 500 straight into Pino JSON logs, OTel spans, and SQL timings while PII remains masked.
     - **Health Probes:** Why `/health/live` does zero I/O while `/health/ready` checks DB/cache/queue within 2s, and how orchestrators use them during rolling deploys.
     - **Product Analytics Layer:** Reading consent-safe business events without violating GDPR / India DPDP.

2. **`docs/deployment/01-RENDER-AND-RAILWAY.md`** (`blueprints/render-railway/`)
   - Multi-stage lean `Dockerfile` + `render.yaml` + `railway.toml`.
   - **$0 Free-Tier Survival Mode:** Single-container app + `adapter-queue-db` polling worker + SQLite/managed free Postgres + In-Memory LRU cache. Cold-start expectations & limits.
   - **Scaled PaaS Mode:** Splitting web service + dedicated BullMQ worker + managed Postgres + managed Redis + S3/R2 storage.

3. **`docs/deployment/02-VPS-DOCKER-CADDY.md`** (`blueprints/vps-caddy/`)
   - `docker-compose.prod.yml` + `Caddyfile` (auto-HTTPS TLS, HTTP/3, security headers, `/_admin` IP restriction).
   - Firewall (`ufw`), SSH hardening, non-root container user, log rotation, automated encrypted `pg_dump` / SQLite backup cron to S3/R2, and restore drill instructions.

4. **`docs/deployment/03-AWS-STACK.md`** (`blueprints/aws-terraform/`)
   - Modular Terraform blueprint: VPC + ECS Fargate (or App Runner) + RDS PostgreSQL (Multi-AZ option + RDS Proxy/pooling) + ElastiCache (Valkey/Redis) + S3 (private bucket + IAM least-privilege) + AWS Secrets Manager + CloudWatch / OTLP Collector + ALB health checks.
   - Realistic monthly cost breakdown (Starter vs. Growth tier).

5. **`docs/deployment/04-GCP-STACK.md`** (`blueprints/gcp-terraform/`)
   - Modular Terraform blueprint: Cloud Run (min-instances trade-off, graceful `SIGTERM`) + Cloud SQL PostgreSQL (Auth Proxy / private VPC) + Memorystore (Redis) + GCS (S3-interop or native) + Secret Manager + Cloud Monitoring & Cloud Trace (OTLP).
   - Realistic monthly cost breakdown (Starter vs. Growth tier).

---

## 2. Required Local-Stub -> Production Swap Handbooks (`docs/adapters/`)

Every single adapter gets a crisp 1-page handbook covering: **Local Stub Behavior -> Required Production Env Vars -> Admin Panel Setup (if applicable) -> Verification Checklist -> Failure Modes & Rollback**:
- `docs/adapters/http-fastify-vs-express.md`
- `docs/adapters/database-sqlite-postgres-mysql.md` (including Postgres RLS verification)
- `docs/adapters/cache-memory-vs-redis.md`
- `docs/adapters/queue-db-vs-bullmq.md`
- `docs/adapters/storage-local-vs-s3.md`
- `docs/adapters/email-stub-vs-smtp.md`
- `docs/adapters/billing-stub-razorpay-stripe.md` (including India GST/HSN & webhook signature testing)
- `docs/adapters/analytics-stub-vs-posthog-otlp.md`
