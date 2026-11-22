# Production Architecture & Observability Operator Handbook

This handbook details the end-to-end runtime lifecycle, multi-layer architecture, telemetry instrumentation, and operational runbooks for `plinth` backends.

---

## 1. Multi-Layer Runtime Anatomy

```
┌────────────────────────────────────────────────────────────────────────┐
│ Edge Layer: TLS Termination / CDN / Reverse Proxy (Caddy / Cloudflare)  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ HTTPS / HTTP/3
┌──────────────────────────────────▼─────────────────────────────────────┐
│ Application Layer: Node.js 24+ LTS (Plinth Pure ESM Service)           │
│  - Ingress: Fastify 5 / Express 5 HTTP Server Adapter                   │
│  - Middleware: CORS, CSP, Rate Limiter, SSRF Guard, CIDR Check         │
│  - Tenancy Context: AsyncLocalStorage TenantContext propagation        │
│  - Telemetry: Pino JSON Logger + OTel Distributed Tracing               │
│  - Hexagonal Ports: HTTP, Database, Cache, Queue, Email, Storage, ...  │
└───────────────────┬─────────────────┬─────────────────┬────────────────┘
                    │                 │                 │
┌───────────────────▼───────┐  ┌──────▼───────┐  ┌──────▼───────────────┐
│ Database Layer            │  │ Cache/Queue  │  │ Storage & Transports │
│ - SQLite (WAL mode)       │  │ - Memory LRU │  │ - Local Storage / S3 │
│ - PostgreSQL 17 (with RLS)│  │ - Redis 7    │  │ - Local Catcher /    │
│ - MySQL 8                 │  │ - Outbox DB/ │  │   SMTP Transport     │
│                           │  │   BullMQ     │  │ - Stripe / Razorpay  │
└───────────────────────────┘  └──────────────┘  └──────────────────────┘
```

---

## 2. Observability & Telemetry Standards

### 2.1 RED Metrics (Rate, Errors, Duration)
Every HTTP route in `plinth` reports RED metrics:
- **Rate**: Measured in requests per second (req/s). Tracked per route contract and status code.
- **Errors**: Ratio of 5xx HTTP responses to total requests.
  - **Healthy**: Error rate < 0.05% (99.95% availability).
  - **Degraded**: Error rate between 0.1% and 1.0% (triggers Warning alert).
  - **Incident**: Error rate > 1.0% over a 5-minute rolling window (triggers P1 On-Call Page).
- **Duration**: Latency percentiles (p50, p95, p99).
  - **Target SLO**: p50 <= 25ms, p95 <= 100ms, p99 <= 250ms for OLTP routes.

### 2.2 USE Metrics (Utilization, Saturation, Errors)
Internal system resources:
- **Node.js Event Loop Lag**: Tracked via `perf_hooks.monitorEventLoopDelay`. Event loop lag > 50ms signals synchronous CPU bottlenecks.
- **Heap Usage & RSS**: Monitored against container memory limits (default 512MB / 1GB). Alert on heap utilization > 80%.
- **Database Connection Pool**: Pool utilization (`total - idle / max`). Alert when saturation exceeds 90% or pool wait queue depth > 5 requests.
- **Redis Cache Hit Ratio**: Target >= 85% hit ratio on read caches. Cache circuit breaker state transitions (`CLOSED` -> `OPEN` -> `HALF_OPEN`) logged with error stack.
- **Transactional Outbox & Job Queues**: Queue depth and Dead Letter Queue (DLQ) count. Alert immediately if DLQ count > 0.

---

## 3. Distributed Tracing & PII Redaction Correlation

### 3.1 Trace ID Propagation
Every request receives or extracts an RFC 9457 compliant `traceId`:
1. Extracted from incoming W3C `traceparent` or generated via RFC 9562 UUIDv7.
2. Injected into `AsyncLocalStorage` context.
3. Automatically attached to:
   - Outgoing HTTP responses: `X-Trace-Id: <uuidv7>`.
   - Error bodies: `{"type": "...", "title": "...", "status": 500, "traceId": "<uuidv7>"}`.
   - Structured Pino JSON logs: `{"level": 30, "traceId": "...", "tenantId": "...", "msg": "..."}`.
   - OpenTelemetry span context.

### 3.2 Dual-Layer PII Redaction
- Sensitive keys (`password`, `token`, `secret`, `authorization`, `cookie`, `creditCard`) are automatically masked to `[REDACTED]`.
- Pattern-based maskers scrub emails, credit card numbers, and phone numbers in unstructured log strings.
- In-memory secrets wrapped in `Redacted<T>` never leak via `JSON.stringify`, `util.inspect`, or console output.

---

## 4. Health Probes & Rolling Deployments

### 4.1 Liveness Probe (`/health/live`)
- **Purpose**: Verifies that the Node.js event loop is running and responsive.
- **I/O Overhead**: **Zero**. Does not touch databases, Redis, or external networks.
- **Orchestrator Action**: If `/health/live` fails 3 times consecutively, the orchestrator terminates and replaces the container instance.

### 4.2 Readiness Probe (`/health/ready`)
- **Purpose**: Verifies that downstream dependencies (Database connection pool, Redis, Storage) are reachable and healthy.
- **Execution**: Runs a bounded 2-second timeout ping against the database adapter.
- **Orchestrator Action**: If `/health/ready` returns HTTP 503, the load balancer temporarily stops routing inbound traffic to the instance without restarting the process.

---

## 5. Graceful Drain Lifecycle
On receiving `SIGINT` or `SIGTERM`:
1. Server marks itself unready (readiness probe returns 503).
2. Closes listening socket to reject new inbound connections.
3. Allows in-flight HTTP requests to complete within a 15-second grace window.
4. Pauses queue workers and drains pending outbox batches.
5. Closes database connection pools and Redis clients.
6. Terminates process with code 0.
