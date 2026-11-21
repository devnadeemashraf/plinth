# `plinth` — MVP-First Chunked Roadmap (Approved Phase 2 Plan)

Build **strictly one chunk at a time** using the `plinth-chunk-builder` skill:
1. Verify latest package versions & live official docs (`LIVE_RESEARCH_PROTOCOL.md`).
2. Write the 5-category Test Matrix & failing Vitest tests first (**Red**).
3. Write minimal, clean production implementation (**Green -> Refactor**).
4. Run `pnpm verify` (`lint`, `typecheck`, `test:fitness`, `test:coverage`).
5. Execute Phase 4 Adversarial Audit (`AUDIT_CHECKLIST.md`) and remediate all P0/P1 findings with regression tests.
6. Update `docs/ai/PROJECT_STATE.md` and `docs/ai/SESSION_LOG.md`.

---

## Master Roadmap Table

| Chunk | Wave | Name | Dependencies | Primary Value Delivered |
|---|---|---|---|---|
| **C01** | Wave 1: MVP Skeleton | Monorepo, Toolchain, Fail-Fast Config & Fitness Harness | None | TS 7.0 + Biome + Vitest + pnpm 12 `catalog:`, typed env validation, UUIDv7, CI architectural fitness checks |
| **C02** | Wave 1: MVP Skeleton | Telemetry, Dual-Layer PII Redaction & RFC 9457 Errors | C01 | `Redacted<T>`, deterministic Pino/OTel masking engine, RED/USE metric hooks, uniform Problem Details |
| **C03** | Wave 1: MVP Skeleton | Core Ports, Fastify + SQLite Vertical Slice & Lifecycle | C01, C02 | First runnable end-to-end service (`/health/live`, `/health/ready`, `/api/v1/brand`), Zod->OpenAPI 3.1 + Scalar API Reference (`/docs`), Dockerfile, graceful `SIGTERM` drain |
| **C04** | Wave 2: Security & Resilience | Multi-Tenancy Engine, Bounds, Rate Limits & Idempotency | C03 | `single`/`multi` tenant resolvers, branded `TenantContext`, timeouts/caps, security headers, rate limiter, SSRF guard, `Idempotency-Key` |
| **C05** | Wave 2: Security & Resilience | Discord-Style `BigInt` Bitmask RBAC Engine | C01, C04 | `O(1)` `BigInt` permission engine, scope overwrites (depth <= 4), rank anti-escalation invariant, global/tenant roles, Zod role metadata |
| **C06** | Wave 2: Security & Resilience | Slim Auth Core, Encrypted Config, Dual Sessions & Audit Log | C02, C04, C05 | AES-256-GCM runtime secrets, feature-flagged Email/Username+Argon2id & OAuth2/OIDC (+ Mock OIDC stub), opaque cookies + EdDSA JWTs/rotating refresh, `audit_logs` |
| **C07** | Wave 3: Adapters & Async | Contract Test Suite + Express 5, Postgres (RLS) & MySQL | C03, C04, C06 | Shared black-box HTTP/DB compliance tests proving drop-in parity across Express 5, Postgres (with `SET LOCAL` RLS), and MySQL |
| **C08** | Wave 3: Adapters & Async | Cache, Outbox/Job Queues, Email Catcher & SSE Port | C03, C04, C07 | LRU + Redis cache (fail-open breaker), transactional `outbox_events` + DB/BullMQ workers + DLQ, local Email Catcher + SMTP, bounded SSE |
| **C09** | Wave 4: Product Modules | Profiles, Hardened Avatar Storage & Compliance/Analytics | C06, C08 | Local + S3 Storage Port, magic-byte EXIF-stripped avatars, GDPR/India DPDP Consent Ledger + export/erasure, consent-aware Analytics Port |
| **C10** | Wave 4: Product Modules | Billing Engine (Stub, Razorpay & Stripe) | C04, C06, C08 | Normalized checkout/subscriptions/entitlements, raw-body HMAC webhook dedupe, local checkout + webhook simulator, Razorpay (INR/UPI/GST) & Stripe |
| **C11** | Wave 4: Product Modules | Zero-Build SSR Admin Panel, Super User CLI & Dev Inspector | C05, C06, C08–C10 | Brand-themed SSR `/_admin` UI (CSP+CSRF+CIDR), `plinth admin:create-superuser` + mandatory TOTP, live flag/secret editor, Dev/Ops Inspector |
| **C12** | Wave 5: CLI, Ops & AI Kit | `plinth init` CLI, Deploy Handbooks & Multi-Editor AI Kit | C01–C11 | Interactive scaffolder, Render/Railway/VPS/AWS/GCP IaC & handbooks, adapter swap docs, GitHub Actions CI, and Gemini/Claude/Codex/Cursor skills |

---

## Chunk Acceptance Criteria & Edge Cases

### C01 — Monorepo Foundation, Toolchain, Fail-Fast Config & Fitness Harness
- **Files:** `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `vitest.config.ts`, `packages/core/src/{config,primitives,fitness}/*`.
- **DoD:** `pnpm verify` green; bad/missing/low-entropy env vars fail fast without leaking raw secrets; fitness harness catches static, dynamic (including backticks), `require()`, relative adapter escapes, and `process.env` / `node:process` outside config. (See `docs/specs/C01-FOUNDATION-SPEC.md`.)

### C02 — Telemetry, Dual-Layer PII Redaction & RFC 9457 Error Kernel
- **Files:** `packages/core/src/redaction/{redacted,engine,maskers}.ts`, `packages/core/src/observability/{logger,metrics,tracing}.ts`, `packages/core/src/errors/{app-error,problem-details}.ts`.
- **DoD:** `Redacted<T>` never leaks via `JSON.stringify`, `util.inspect`, `String()`, or Pino; `RedactionEngine` deterministically masks emails, phones, PAN/Aadhaar, cards, tokens, and circular nested objects; all `AppError` subclasses serialize to valid RFC 9457 Problem Details without stack traces in production.
- **Edge Cases:** Circular references, mixed-case sensitive headers (`X-Api-Key`, `authorization`), `Redacted<T>` inside `Error.cause`, raw unhandled `Error` objects containing DB URLs.

### C03 — Core Ports, Fastify + SQLite Reference Vertical Slice & Graceful Lifecycle
- **Files:** `packages/core/src/ports/{http,database,lifecycle}.ts`, `packages/core/src/contracts/{route,openapi,pagination}.ts`, `packages/modules/brand/*`, `packages/adapter-http-fastify/*`, `packages/adapter-db-sqlite/*`, `apps/reference-api/*`, `Dockerfile`.
- **DoD:** Reference API boots against SQLite, serves OpenAPI 3.1 JSON (`/openapi.json`) + interactive Scalar API Reference UI (`/docs`), passes `/health/live` (zero I/O) and `/health/ready` (bounded 2s DB ping), completes Brand CRUD with RFC 9457 errors, and drains in-flight requests cleanly on `SIGTERM` within 15s.
- **Edge Cases:** Malformed JSON, unknown extra fields rejected strictly, DB unreachable returning `503` within 2s, `SIGTERM` draining active requests while rejecting new ones with `503`, cursor limit > 100 rejected.

### C04 — Multi-Tenancy Isolation Engine, Bounds, Rate Limits, SSRF Guard & Idempotency
- **Files:** `packages/core/src/tenancy/{context,resolver,guard}.ts`, `packages/core/src/security/{rate-limiter,ssrf-guard,headers,idempotency}.ts`, `packages/modules/tenants/*`.
- **DoD:** Tenant repos require branded `TenantContext` at compile time; `single` pins `default_tenant`; `multi` resolves header/subdomain/path + verifies membership; `> 1 MB` returns `413`; SSRF guard blocks loopback, RFC 1918, IPv6 ULA, IPv4-mapped IPv6, and `169.254.169.254`; `Idempotency-Key` replays identical response or returns `409` on payload mismatch/in-flight race.
- **Edge Cases:** Cross-tenant IDOR, DNS rebinding / `::ffff:127.0.0.1` bypass, concurrent duplicate `Idempotency-Key`, spoofed `X-Forwarded-For`, mid-flight client abort cancelling DB query.

### C05 — Discord-Style `BigInt` Bitmask RBAC Engine
- **Files:** `packages/core/src/rbac/{bitmask,registry,evaluator,hierarchy,metadata}.ts`, `packages/modules/rbac/*`.
- **DoD:** `O(1)` bitwise evaluation with canonical hex DB serialization; `ADMINISTRATOR` (`1n << 0n`) short-circuits; rank + subset anti-escalation invariant blocks all privilege escalation; global vs. tenant-isolated mode + `allowCustomRoles` runtime toggles; Zod role metadata (<= 4 KB).
- **Edge Cases:** Bits > 64 (`1n << 128n`), malformed/negative hex masks, `@everyone -> role -> member` allow/deny overwrite precedence, granting a single unheld bit, editing equal/higher rank role, XSS/invalid hex in role metadata, scope depth > 4.

### C06 — Slim Auth Core, Encrypted Runtime Config, Dual Sessions & Audit Log
- **Files:** `packages/core/src/crypto/{envelope,password,jwt-ed25519,tokens,totp}.ts`, `packages/modules/auth/*`, `packages/modules/config-store/*`, `packages/modules/audit/*`.
- **DoD:** Live feature flags enable/disable Email/Username+Argon2id and OAuth2/OIDC (+ Mock OIDC stub) without restart; secrets encrypted at rest via AES-256-GCM envelope encryption; opaque cookies + CSRF for web; EdDSA JWT (15m) + rotating refresh tokens with reuse-detection family revocation; append-only masked `audit_logs`.
- **Edge Cases:** Timing-safe credential checks, case-insensitive collisions, unverified OAuth email linking attack, PKCE/state CSRF replay, `alg: none` / wrong `iss`/`aud` / expired JWT, concurrent refresh race, tampered AES-GCM auth tag.

### C07 — Shared Adapter Contract Test Suite + Express 5, Postgres (RLS) & MySQL Adapters
- **Files:** `packages/contract-tests/src/{http,repository,tenancy-rls}.contract.ts`, `packages/adapter-http-express/*`, `packages/adapter-db-postgres/*`, `packages/adapter-db-mysql/*`.
- **DoD:** Fastify & Express 5 pass 100% of HTTP contract tests (including raw-body preservation for webhooks); SQLite, Postgres, and MySQL pass 100% of Repository & Migration contract tests; Postgres RLS test proves even a broken raw query returns zero cross-tenant rows.

### C08 — Cache, Transactional Outbox, Heavy Job Queues, Email Catcher & SSE
- **Files:** `packages/core/src/ports/{cache,queue,email,sse}.ts`, `packages/adapter-cache-{memory,redis}/*`, `packages/adapter-queue-{db,bullmq}/*`, `packages/adapter-email-{stub,smtp}/*`.
- **DoD:** Read cache fails open behind circuit breaker when Redis dies; rate-limit/revocation degrades locally; transactional `outbox_events` commits atomically with business writes and drains to DB worker or BullMQ with exponential backoff + DLQ; Local Email Catcher renders branded HTML emails for Admin UI; SSE sends heartbeats and cleans up on abort.

### C09 — User Profiles, Hardened Avatar Storage Port & Compliance/Analytics Packs
- **Files:** `packages/core/src/ports/{storage,analytics}.ts`, `packages/adapter-storage-{local,s3}/*`, `packages/adapter-analytics-stub/*`, `packages/modules/{users,compliance}/*`.
- **DoD:** Magic-byte verified (PNG/JPEG/WebP only), EXIF-stripped, re-encoded avatars (<= 5 MB) via Storage Port; GDPR / India DPDP versioned Consent Ledger, JSON export, and PII anonymization preserving financial/GST audit integrity; consent-respecting Analytics Port.

### C10 — Billing & Payments Engine (Stub, Razorpay & Stripe)
- **Files:** `packages/core/src/ports/billing.ts`, `packages/modules/billing/*`, `packages/adapter-billing-{stub,razorpay,stripe}/*`.
- **DoD:** All 3 adapters pass Billing Contract Suite; Razorpay supports INR/UPI/cards/subscriptions + GST/HSN metadata; Stripe supports global payments; raw-body HMAC verification + `(provider, provider_event_id)` deduplication + async outbox entitlement updates; integer minor-unit money only.

### C11 — Zero-Build SSR Admin Panel, Super User CLI & Dev/Ops Inspector
- **Files:** `packages/modules/admin/*`, `packages/cli/src/commands/create-superuser.ts`.
- **DoD:** CLI-only super user creation with mandatory TOTP MFA; Brand-themed SSR HTML/CSS `/_admin` panel with strict CSP (`default-src 'self'`, zero inline `<script>`), CSRF tokens, and optional `ADMIN_ALLOWED_CIDRS`; manages Brand, Auth flags/secrets, RBAC roles/metadata, Tenants, Billing simulator, and Dev Inspector (masked traces, queue/DLQ retry, caught local emails, audit logs).

### C12 — Interactive `plinth init` CLI, Deployment Blueprints/Handbooks & AI-Editor Kit
- **Files:** `packages/cli/src/commands/{init,add,deploy-add}.ts`, `blueprints/{render-railway,vps-caddy,aws-terraform,gcp-terraform}/*`, `docs/deployment/*`, `docs/adapters/*`, `ai-kit/*`, `.github/workflows/ci.yml`.
- **DoD:** `plinth init` generates a clean, dependency-trimmed standalone repo passing `pnpm install && pnpm verify` out of the box for any valid option matrix, including deployment blueprints/handbooks (per `docs/deployment/DEPLOYMENT_HANDBOOK_BLUEPRINT.md`), 1-page adapter swap guides, and AI-editor skills.
