# Render & Railway Deployment Operator Handbook

This handbook covers deploying `plinth` on managed container PaaS platforms (Render and Railway), from zero-cost survival mode to high-scale production.

---

## 1. Zero-Cost Free-Tier Survival Mode ($0/mo)

For side projects, hackathons, and early MVPs:

### Recommended Configuration
- **Compute**: Single container web service on Render Free Tier or Railway Starter.
- **Database**: SQLite with persistent disk mount (or free managed PostgreSQL on Render/Railway).
- **Cache**: In-Memory LRU Cache (`adapter-cache-memory`).
- **Queues & Async Jobs**: Database Polling Worker (`adapter-queue-db`). Zero extra Redis instance needed.
- **Email**: Local Dev Catcher (`adapter-email-stub`) viewable in Admin Panel `/_admin`.
- **Storage**: Local Storage Adapter (`adapter-storage-local`) mounted to persistent volume `/data`.

### Cold-Start Expectations
- Render free-tier web services spin down after 15 minutes of inactivity.
- Expect cold start delays of 30-50 seconds when waking up.
- To prevent false alarms, ensure healthcheck `start_period` is set to at least 15s.

---

## 2. Scaled PaaS Production Mode

For growing production applications:

### Recommended Topology
```
           ┌──────────────────────┐
           │ Cloudflare / CDN     │
           └──────────┬───────────┘
                      │
           ┌──────────▼───────────┐
           │ Render / Railway Web │ (2+ instances, auto-scaling)
           └─────┬──────────┬─────┘
                 │          │
   ┌─────────────▼───┐  ┌───▼─────────────┐
   │ Managed DB      │  │ Managed Redis   │
   │ PostgreSQL 17   │  │ Valkey / Redis  │
   └─────────────▲───┘  └───▲─────────────┘
                 │          │
           ┌─────┴──────────┴─────┐
           │ Dedicated Worker     │ (BullMQ asynchronous job runner)
           └──────────────────────┘
```

### Steps to Scale
1. Split web and queue worker services:
   - **Web Service Command**: `node apps/reference-api/dist/src/server.js`
   - **Worker Service Command**: `node apps/reference-api/dist/src/worker.js`
2. Attach Managed PostgreSQL: Set `DATABASE_URL` with connection pooling enabled (`?pgbouncer=true` if using high concurrency).
3. Attach Managed Redis: Set `REDIS_URL`. Switch cache to `@plinth/adapter-cache-redis` and queue to `@plinth/adapter-queue-bullmq`.
4. Switch Storage to Cloud: Configure AWS S3 or Cloudflare R2 bucket credentials.

---

## 3. Environment Variables & Secrets Injection

Configure these variables in Render Environment / Railway Variables:

| Variable | Description | Example |
|---|---|---|
| `NODE_ENV` | Runtime environment | `production` |
| `PORT` | Listening port | `3000` |
| `HOST` | Binding address | `0.0.0.0` |
| `MASTER_ENCRYPTION_KEY` | 32-byte hex key for envelope encryption | Generate: `openssl rand -hex 32` |
| `JWT_SECRET` | 32-byte secret for session signing | Generate: `openssl rand -hex 32` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/db` |
| `REDIS_URL` | Redis connection string | `redis://default:pass@host:6379` |
| `STORAGE_DRIVER` | Active storage provider | `s3` |
| `S3_BUCKET` | S3 or R2 bucket name | `my-prod-storage` |
| `S3_REGION` | S3 bucket region | `auto` (for R2) or `us-east-1` |

---

## 4. Zero-Downtime Migration Runbook
1. Prepare database migration scripts in Drizzle or raw SQL.
2. In Render / Railway, run the migration step as a **Pre-Deploy Command**:
   ```bash
   pnpm run db:migrate
   ```
3. Deploy new container versions:
   - Render and Railway maintain old containers active until new containers pass the `/health/live` probe.
   - Once healthy, traffic is routed to new instances and old containers receive `SIGTERM` to drain.
