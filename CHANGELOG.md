# Changelog

All notable changes to the Plinth project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-11-22

### Added

#### Core Architecture & Primitives (`@plinth/core`)
- Type-safe branded primitives: `Brand<K, T>`, `Result<T, E>`, and monotonic sub-millisecond RFC 9562 `UUIDv7`.
- Fail-fast configuration loader (`packages/core/src/config`) with Zod v4 validation and sensitive credential redaction.
- Hexagonal architecture fitness scanner (`packages/core/src/fitness`) enforcing zero infrastructure imports in core and canonical path aliases.

#### Telemetry, Redaction & Uniform Errors
- Dual-layer PII redaction engine (`packages/core/src/redaction`) with `Redacted<T>` encapsulation, circular object handling, and pre-compiled regex text scrubbers.
- Structured Pino logging port with contextual child loggers and automatic PII masking.
- W3C trace context propagation via `@opentelemetry/api` with RED and USE operational metrics.
- RFC 9457 compliant Problem Details error kernel with production stack trace stripping.

#### Multi-Tenancy & Edge Defense
- Compile-time branded `TenantContext` enforcing zero cross-tenant data leaks.
- Pluggable tenant resolution strategies supporting headers, subdomains, and URL path prefixes.
- Sliding-window in-memory rate limiter with RFC 6585 headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`).
- SSRF BlockList guard protecting against loopback, RFC 1918, IPv6 ULA, and cloud metadata (`169.254.169.254`) requests.
- Canonicalized `Idempotency-Key` manager with payload fingerprinting and race condition locks.

#### Discord-Style $O(1)$ BigInt Bitmask RBAC
- Bitwise permission engine with canonical hex persistence and sub-microsecond evaluation.
- Hierarchical role evaluation supporting global and tenant-isolated authorization modes.
- Strict rank and subset anti-escalation invariants blocking privilege elevation.

#### Slim Auth & Envelope Encryption
- Feature-flagged authentication supporting Argon2id passwords and OAuth2/OIDC.
- AES-256-GCM envelope encryption for runtime application secrets.
- Ed25519 asymmetric JWT access tokens with rotating refresh tokens and family reuse revocation.
- Append-only structured audit logging for security and compliance tracking.

#### 10 Production Feature Modules (`@plinth/modules-*`)
- `@plinth/modules-brand`: Tenant-aware branding customization.
- `@plinth/modules-tenants`: Multi-tenant organization lifecycle management.
- `@plinth/modules-rbac`: Role definition, assignment, and permission evaluation.
- `@plinth/modules-auth`: Dual session lifecycle, credentials, and tokens.
- `@plinth/modules-config-store`: Encrypted dynamic runtime settings.
- `@plinth/modules-audit`: Tamper-evident audit logging.
- `@plinth/modules-users`: User profile management and secure avatar uploads.
- `@plinth/modules-compliance`: GDPR and India DPDP consent ledgers with right-to-erasure and export.
- `@plinth/modules-billing`: Universal payment checkout, webhook handling, and entitlement tracking.
- `@plinth/modules-admin`: Zero-build SSR HTML5/CSS administrative dashboard with strict CSP, CSRF protection, and CIDR fencing.

#### 17 Swappable Port Adapters (`@plinth/adapters-*`)
- **HTTP:** Fastify 5 (`adapter-http-fastify`) and Express 5 (`adapter-http-express`).
- **Database:** SQLite WAL (`adapter-db-sqlite`), PostgreSQL with RLS (`adapter-db-postgres`), and MySQL 2 (`adapter-db-mysql`).
- **Cache:** Bounded In-Memory LRU (`adapter-cache-memory`) and Redis (`adapter-cache-redis`) with fail-open circuit breaking.
- **Queue:** Database Polling Worker (`adapter-queue-db`) and BullMQ Redis (`adapter-queue-bullmq`) with exponential backoff and DLQ.
- **Storage:** Local Disk (`adapter-storage-local`) and AWS S3 / Cloudflare R2 (`adapter-storage-s3`) with SigV4 pre-signing.
- **Email:** Local HTML Catcher (`adapter-email-stub`) and SMTP Transport (`adapter-email-smtp`).
- **Billing:** Local Checkout Simulator (`adapter-billing-stub`), Razorpay INR/UPI (`adapter-billing-razorpay`), and Stripe Global (`adapter-billing-stripe`).
- **Analytics:** Privacy-preserving Scrubbed Analytics Stub (`adapter-analytics-stub`).

#### Tooling, Scaffolder CLI & Examples
- Interactive scaffolding CLI (`@plinth/cli`): `plinth init`, `plinth add`, `plinth deploy:add`, and `plinth admin:create-superuser`.
- 4 production deployment blueprints: Render/Railway, VPS + Caddy, AWS Terraform, and GCP Terraform.
- Shared adapter contract test suite (`@plinth/contract-tests`).
- Self-contained, fully-tested Notes API reference example (`examples/notes-api/`).
- CossUI monochrome documentation and marketing website (`website/`) with automated GitHub Pages deployment.
