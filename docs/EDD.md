# Engineering Design Document (EDD): `plinth`

**Status:** APPROVED & LOCKED (Phase 1 Exit Gate Passed)  
**Canonical Name:** `plinth` (CLI & `@plinth/*` workspace packages)  
**Runtime & Toolchain:** Node.js 24+ / 26 LTS (Pure ESM) · **TypeScript 7.0** (Go-native `tsc`) · **Biome** · **Vitest** · **`pnpm` 12+** (exact `catalog:` pinning)

---

## 1. Goals & Explicit Non-Goals

### Goals
- **Zero-Friction Product Launch:** Run `plinth init`, pick tenancy mode, SQL database, HTTP adapter, cache/queue, billing provider, compliance pack, and deploy target, and receive a clean, dependency-trimmed, production-ready TypeScript backend.
- **Strict Hexagonal Architecture (Ports & Adapters):** Core domain and business modules have zero imports from HTTP frameworks, SQL dialects, cache/queue clients, or payment SDKs—enforced automatically by CI **Architectural Fitness Tests**.
- **Zero-Account Local Dev:** Every external dependency ships with a realistic local **Stub Adapter** (SQLite, In-Memory LRU, DB Job Runner, Local Email Catcher, Local Object Storage, Fake Billing Checkout + Webhook Simulator, Mock OIDC) paired with a 1-page **Swap-to-Production Handbook**.
- **Defense-in-Depth Security & Visibility:** Fail-fast config, compile-time + RLS tenant isolation, `O(1)` `BigInt` bitmask RBAC, encrypted runtime admin configs, mandatory dual-layer PII masking, and full OTLP telemetry.
- **Human + AI Native:** Canonical rules, session-continuity docs, live-research mandates, native skills for Gemini/Antigravity, Claude Code, Codex, and Cursor, plus end-to-end deployment handbooks covering Render/Railway, VPS, AWS, and GCP.

### Explicit Non-Goals (v1)
- No NoSQL databases (MongoDB, DynamoDB, Firestore).
- No GraphQL, gRPC, WebSockets, or WebRTC (REST/JSON + SSE/polling only in v1).
- No Merchant-of-Record billing adapters (Paddle/Dodo deferred past v1) and no usage-metering/proration engine.
- No Magic Link, Email OTP, Passkeys/WebAuthn, or Scoped API Keys in v1 (clean `AuthStrategy` plugin boundary preserved for drop-in v2 additions).
- No visual drag-and-drop email builder (branded code-driven HTML/text templates only).
- No Kubernetes Helm charts or live runtime toggling of multi-tenancy on a populated database.

---

## 2. Architecture Overview & Module Boundaries

`plinth` is maintained as a **typed workspace monorepo** where every adapter compiles and passes a shared **Black-Box Contract Test Suite** in CI. `plinth init` assembles a clean standalone repository containing only the selected adapters plus local stubs.

```text
plinth (Monorepo Source of Truth)
├── packages/
│   ├── core/                     # Zero-framework domain kernel, ports, Zod contracts, bitmask RBAC, redaction, errors
│   ├── modules/                  # Vertical domain slices (auth, tenants, rbac, users, billing, admin, compliance, brand)
│   ├── adapter-http-fastify/     # Default HTTP driver
│   ├── adapter-http-express/     # Express 5 HTTP driver
│   ├── adapter-db-postgres/      # Drizzle PG + optional RLS defense-in-depth
│   ├── adapter-db-mysql/         # Drizzle MySQL
│   ├── adapter-db-sqlite/        # Drizzle SQLite (zero-config local & lightweight prod)
│   ├── adapter-cache-memory/     # Bounded LRU in-memory stub
│   ├── adapter-cache-redis/      # Redis / Valkey production cache
│   ├── adapter-queue-db/         # DB-backed polling queue + transactional outbox worker (free-tier friendly)
│   ├── adapter-queue-bullmq/     # Redis-backed BullMQ worker for offloading heavy async jobs
│   ├── adapter-storage-local/    # Local disk bucket stub with signed-URL emulation
│   ├── adapter-storage-s3/       # S3-compatible (AWS S3, Cloudflare R2, MinIO, GCS S3-interop)
│   ├── adapter-billing-stub/     # Local checkout page + one-click webhook simulator
│   ├── adapter-billing-razorpay/ # India (INR, UPI, cards, subscriptions, GST/HSN invoice metadata)
│   ├── adapter-billing-stripe/   # Global payments & subscriptions
│   ├── adapter-email-stub/       # Local Email Catcher rendered in Admin/Dev UI
│   ├── adapter-email-smtp/       # SMTP / Resend / SES-compatible adapter
│   ├── adapter-analytics-stub/   # Consent-aware masked event logger + PostHog/OTLP adapter hook
│   ├── contract-tests/           # Shared compliance suite every adapter MUST pass
│   └── cli/                      # Interactive `plinth init`, `plinth add`, `plinth deploy:add`, `plinth admin:*`
├── blueprints/                   # IaC & deployment handbooks (render-railway, vps-caddy, aws-terraform, gcp-terraform)
└── ai-kit/                       # Canonical rules + Gemini/Antigravity, Claude Code, Codex, Cursor skills
```

**Dependency Direction Law (CI-Enforced):**
1. `packages/core` imports **zero** infrastructure libraries.
2. `packages/modules/*` (and user business modules) import **only** `@plinth/core` ports and contracts.
3. `packages/adapter-*` implement `@plinth/core` ports and are wired solely inside the **Composition Root** (`src/bootstrap/container.ts`).

---

## 3. Tech Stack & Core Dependencies

| Layer | Selection | Rationale |
|---|---|---|
| **Runtime & Compiler** | Node.js 24+ / 26 LTS · Pure ESM · **TypeScript 7.0** | Go-native `tsc` delivers fast typechecking across monorepo CI and AI-agent loops. |
| **Lint & Format** | **Biome** | Rust-native, zero dependency on legacy JS TS compiler APIs deferred past TS 7.0. |
| **Testing & Packages** | **Vitest** · **`pnpm` 12+** | Native ESM parallel tests + coverage; strict phantom-free isolation + `catalog:` exact version pins. |
| **Contracts & Docs** | **Zod v4** -> OpenAPI 3.1 + **Scalar** | Single source of truth for boundary validation, TS types, and generated interactive API docs (`/docs`). |
| **SQL Layer** | **Drizzle ORM** | Type-safe, zero binary engine overhead, fast PaaS cold starts, thin PG/MySQL/SQLite schemas. |
| **HTTP Drivers** | **Fastify** (default) · **Express 5** | Thin adapters mapping framework req/res to `plinth` `RouteContract` + `RequestContext`. |
| **Cryptography** | **Argon2id** · Node `crypto` (`Ed25519`, `AES-256-GCM`, `SHA-256`, `HMAC-SHA1` TOTP) | Memory-hard password hashing + stdlib crypto for JWTs, envelope encryption, and Super Admin TOTP. |
| **Observability** | **Pino** + **OpenTelemetry (OTLP)** | Low-overhead structured JSON logs + vendor-neutral traces & RED/USE metrics. |
| **Admin UI** | **Zero-build SSR HTML + CSS** | Served directly by `plinth` with Brand CSS custom properties, strict CSP, and CSRF tokens. |

---

## 4. Core Domain Contracts, Auth & Data Architecture

### 4.1 API Contracts, Idempotency & Async Offloading
- **Versioning & Errors:** URI path versioning (`/api/v1/...`), uniform **RFC 9457 Problem Details** (`application/problem+json`) with `traceId` and sanitized field errors. Stack traces and raw SQL errors are never exposed in production.
- **Pagination & Streaming:** Cursor-based pagination (`limit` default `20`, hard cap `100`). First-class `StreamResponse` port for **SSE** with heartbeat pings, `AbortSignal` disconnect cleanup, and connection caps.
- **Idempotency:** Reusable `Idempotency-Key` middleware backed by DB/Redis with concurrency lock (`409 Conflict` on payload mismatch or in-flight duplicate)—mandatory on billing mutations and opt-in per route.
- **Transactional Outbox & Heavy Job Offloading:** Business writes and async job intents (`outbox_events`) commit in the **same SQL transaction**. Workers (`adapter-queue-db` for $0 free-tier PaaS, or `adapter-queue-bullmq` for Redis-backed horizontal scaling) drain emails, webhooks, avatar re-encoding, and custom heavy tasks with retries, exponential backoff, and an Admin-visible Dead-Letter Queue (DLQ).

### 4.2 Data Lifecycle & Multi-Tenancy Isolation
- **Keys & Auditability:** **UUIDv7** (RFC 9562 monotonic) primary keys across all 3 SQL dialects; `created_at` / `updated_at` / soft-delete `deleted_at`; append-only `audit_logs` table (actor, tenant, action, masked diff, IP, trace ID).
- **Scaffold-Time Tenancy (`single` | `multi`):**
  - `single` mode transparently pins an internal `default_tenant` at the middleware boundary so 100% of schemas and repositories remain identical.
  - `multi` mode supports 3 configurable resolvers: `X-Tenant-ID` header, subdomain (`{slug}.app.com`), or path prefix (`/api/v1/t/:slug/...`).
- **100% Isolation Guarantee:** Every tenant-scoped repository method requires an opaque branded **`TenantContext`** minted exclusively by verified membership middleware (compile-time TS guard + CI fitness check), backed by **PostgreSQL RLS** (`SET LOCAL app.current_tenant_id = $1`) when running Postgres.

### 4.3 Slim v1 Auth Matrix & Dual Session Architecture
- **Enabled Methods (Live Admin-Configurable Feature Flags):**
  1. **Email or Username + Password:** Case-insensitive normalized lookup (`email` or `username`), **Argon2id** hashing, min-entropy check, mandatory email verification flow, and hashed time-boxed password reset tokens.
  2. **OAuth2 / OIDC:** Google, GitHub, Apple, and generic OIDC (plus **Local Mock OIDC** stub for offline testing), with PKCE (`S256`), `state` CSRF verification, and safe account-linking rules (never auto-link unverified emails).
- **Encrypted Runtime Config:** OAuth client IDs/secrets, SMTP creds, and payment gateway keys configured in the Admin Panel are encrypted at rest with **AES-256-GCM envelope encryption** (DEK wrapped by master KEK from env/KMS), with env-var bootstrap overrides and audit logging.
- **Dual Session & Token Strategy:**
  - **Browsers & Admin Panel:** `HttpOnly`, `Secure`, `SameSite=Lax` opaque session cookies (SHA-256 hashed in DB/Redis) + CSRF Origin/double-submit token verification -> instant server-side revocation.
  - **Mobile / API Clients:** Short-lived **EdDSA (`Ed25519`) JWT** access tokens (15m TTL, strict `iss`/`aud`, JWKS rotation support) + **rotating opaque refresh tokens** with **reuse detection** (replaying a rotated token revokes the entire token family).
- **Super User Bootstrapping & Admin Isolation:** CLI-only `plinth admin:create-superuser` (zero public admin signup route), mandatory strong password + lightweight stdlib **TOTP MFA** (RFC 6238) + recovery codes for Super Admins, optional `ADMIN_ALLOWED_CIDRS` IP allowlist, configurable mount path (`/_admin`), strict CSP (`default-src 'self'`, zero inline `<script>`).

### 4.4 Discord-Style `BigInt` Bitmask RBAC (`O(1)` Resolution)
- **Arbitrary-Width `BigInt` Bitmasks:** All permission masks use native **`BigInt`** (`1n << 0n`, `1n << 1n`, ...) persisted across Postgres, MySQL, and SQLite as canonical hex strings (no 63-bit ceiling, zero cross-dialect overflow bugs).
- **System & Product Bit Registry (`plinth.permissions.ts`):** Core permissions reserve bits `0..63` (including `ADMINISTRATOR = 1n << 0n`); product business logic registers custom permissions from bit `64+` via typed helpers.
- **`O(1)` Effective Permission Resolution (Discord Overwrite Algorithm):**
  1. Compute base mask by `OR`-ing assigned tenant roles: `base = r1 | r2 | ... | rk`.
  2. If `(base & ADMINISTRATOR) === ADMINISTRATOR`, short-circuit `ALL_BITS`.
  3. For hierarchical resource scopes (optional depth <= 4, e.g., `org -> workspace -> project`), apply scope-level bitmask overwrites in deterministic precedence order:
     - `@everyone` overwrite: `mask = (mask & ~everyoneDeny) | everyoneAllow`
     - Role overwrites (combined): `mask = (mask & ~rolesDeny) | rolesAllow`
     - Member-specific overwrite: `mask = (mask & ~memberDeny) | memberAllow`
  4. **Final `O(1)` Check:** `(mask & requiredBits) === requiredBits`.
- **Rank Hierarchy & Anti-Escalation Invariant:** Every role has a numeric `position` (`owner = 100 > admin = 80 > member = 40 > viewer = 10`). An actor can modify or assign role `R` *only if* `actorHighestPosition > R.position` AND `(R.permissions & ~actorEffectiveMask) === 0n`.
- **Admin Controls & Extensible Metadata:** Admin Panel toggles `allowCustomRoles` (on/off) and `roleScopeMode` (`global` templates vs. `tenant_isolated` roles). Roles carry Zod-validated `metadata` JSON (`colorHex`, `badgeLabel`, `icon`, `description`, `custom` <= 4 KB).

### 4.5 Billing, Brand Identity, Profiles & Compliance Packs
- **Billing (`Stub`, `Razorpay`, `Stripe`):** Normalized `CheckoutSession`, `Subscription`, `Entitlement`, and `BillingWebhookEvent` ports. Razorpay handles INR, UPI, cards, subscriptions, and GST/HSN metadata; Stripe handles global payments. Raw-body HMAC signature verification + `(provider, provider_event_id)` unique deduplication before async processing. Monetary amounts stored strictly as integer minor units (paise/cents).
- **Brand Identity:** Versioned `BrandConfig` (name, tagline, primary/secondary/accent hex colors, light/dark logos, favicon, support email, legal URLs, email footer) managed in Admin Panel, served via `GET /api/v1/brand`, and injected into Admin SSR CSS variables and transactional email templates.
- **User Profiles & Avatars:** `displayName`, optional unique `username`, `avatarUrl`, `locale`, `timezone`, `bio`, plus validated `metadata` JSON (<= 8 KB). Avatars enforce 5 MB cap, raw magic-byte verification (PNG/JPEG/WebP), EXIF/GPS stripping, re-encoding, and non-executable Storage Port delivery.
- **Init-Time Compliance Packs (`none` | `gdpr` | `india-dpdp` | `both`):** Lean wiring for a versioned **Consent Ledger**, self-service **JSON Data Export**, and **Right-to-Erasure / PII Anonymization** (preserving financial/GST audit integrity).

---

## 5. Threat Model & Security Controls

| Threat Vector | Concrete Control |
|---|---|
| **Cross-Tenant IDOR** | Branded `TenantContext` compile-time guard + CI fitness test + Postgres RLS `SET LOCAL`. |
| **Super Admin Takeover** | CLI-only `plinth admin:create-superuser`, mandatory TOTP MFA, optional `ADMIN_ALLOWED_CIDRS`, strict CSP + CSRF. |
| **Privilege Escalation** | `O(1)` bitmask subset check `(target & ~actor) === 0n` + strict role `position` comparison. |
| **Brute Force & Credential Stuffing** | Argon2id + multi-dimensional rate limits (IP, user, tenant) with progressive lockout on login/reset. |
| **Refresh Token Replay** | Rotating opaque refresh tokens with automatic family-wide revocation on reuse. |
| **Webhook Spoofing / Replay** | Raw-body cryptographic signature check + timestamp window + unique event-ID dedupe. |
| **PII / Secret Leakage** | Dual-layer `RedactionEngine` (deterministic path/pattern masking + `Redacted<T>` TS wrapper) across Pino, OTel, and RFC 9457 errors. |
| **SSRF** | Egress DNS/IP validator blocking loopback, RFC 1918, IPv6 ULA, IPv4-mapped IPv6, and cloud metadata (`169.254.169.254`). |
| **Malicious Uploads** | 5 MB cap, magic-byte inspection, EXIF strip + re-encode, randomized keys, `X-Content-Type-Options: nosniff`. |

---

## 6. Latency Budgets, SLOs & Resource Bounds

| Dimension | Target / Hard Bound |
|---|---|
| **Throughput Envelope** | 10–5,000 RPS stateless horizontal scaling |
| **Latency Budgets** | p50 < 25 ms · **p95 < 100 ms** · **p99 < 250 ms** (RBAC check < 0.1 ms in memory) |
| **Availability SLO** | 99.9% |
| **Payload Caps** | 1 MB JSON body · 5 MB avatar · 4 KB role metadata · 8 KB profile metadata |
| **Bounded Timeouts** | 10 s HTTP request · 5 s DB query · 3 s outbound HTTP · 2 s `/health/ready` · 15 s graceful `SIGTERM` drain |
| **Pool & Query Bounds** | Explicit DB pool `min`/`max` · cursor pagination max `100` · RBAC scope depth max `4` |
| **Redis / Cache Failure Mode** | Read caches **fail open** behind circuit breaker; rate-limiting & revocation fall back to bounded local in-memory store with high-severity alerts. |
