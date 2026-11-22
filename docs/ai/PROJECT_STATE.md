# `plinth` — Living Project State (Source of Truth for Session Continuity)

> **AI INSTRUCTION:** Read this file at the start of EVERY session and update it at the end of EVERY chunk or work session.

**Last Updated:** 2026-11-22  
**Current Phase:** Phase 4 Verification Complete — **All 12 Chunks (C01–C12) Complete**  
**Active Branch / Repo Status:** All 12 chunks materialized, verified, and pre-/post-audited. Interactive `plinth init`, `plinth add`, and `plinth deploy:add` CLI commands operational. 4 deployment blueprints (`render-railway`, `vps-caddy`, `aws-terraform`, `gcp-terraform`), 5 operator deployment handbooks, 8 1-page adapter swap handbooks, and multi-editor AI kit (`ai-kit/`) integrated cleanly. `pnpm verify` passes with 851 tests across 96 test suites, 100% Biome/tsc/fitness clean, and statement/branch coverage exceeding 85%.

---

## Verified Local Environment & Toolchain Baseline

> Before modifying versions, follow `docs/ai/DEPENDENCY_AND_VERSION_POLICY.md` and check live npm versions!

| Tool / Package | Pinned Version | Notes |
|---|---|---|
| **Node.js** | `v24.22.0` (24 LTS / 26 LTS) | Pure ESM, `erasableSyntaxOnly: true` |
| **pnpm** | `12.21.0` | `saveExact: true`, `catalogMode: strict`, `minimumReleaseAge: 1440` (with `allowBuilds: { better-sqlite3: true, esbuild: true, @node-rs/argon2: true, msgpackr-extract: true }`) |
| **TypeScript** | `7.0.2` (exact catalog pin) | Composite project references (`tsc --build`), strict `NodeNext` |
| **Biome** | `2.6.8` (exact catalog pin) | `$schema` URL matched to `2.6.8`, preset `recommended`, zero-warning pass |
| **Vitest** | `5.1.1` (exact catalog pin) | Matched to `@vitest/coverage-v8@5.1.1` |
| **Zod** | `4.6.7` (exact catalog pin) | Zod 4 tree-shakeable API (`strictObject`, `error: ...`) |
| **Pino** | `10.4.0` (exact catalog pin) | Structured logging with custom stream destination & child bindings |
| **@opentelemetry/api** | `1.10.0` (exact catalog pin) | Tracing standard context & attributes |
| **Fastify** | `5.12.8` (exact catalog pin) | Pure ESM HTTP framework with explicit 1MB body limit & safe CORS |
| **@fastify/cors** | `11.4.3` (exact catalog pin) | Production-hardened CORS plugin |
| **@fastify/cookie** | `11.1.5` (exact catalog pin) | Signed/encrypted HTTP cookie parser |
| **Express** | `5.3.0` (exact catalog pin) | Modern Express 5 HTTP framework with promise error propagation |
| **@types/express** | `5.0.6` (exact catalog pin) | TypeScript definitions for Express 5 |
| **cors** | `2.8.6` (exact catalog pin) | Hardened CORS middleware for Express |
| **@types/cors** | `2.8.19` (exact catalog pin) | TypeScript definitions for cors |
| **pg** | `8.23.1` (exact catalog pin) | PostgreSQL pure Node client & pool |
| **@types/pg** | `8.23.1` (exact catalog pin) | TypeScript definitions for pg |
| **mysql2** | `3.24.6` (exact catalog pin) | High-performance MySQL client with promise pool |
| **@electric-sql/pglite** | `0.5.17` (exact catalog pin) | In-memory WASM PostgreSQL for RLS & contract test validation |
| **@node-rs/argon2** | `2.2.2` (exact catalog pin) | Zero-dependency N-API memory-hard Argon2id password hashing |
| **@scalar/fastify-api-reference** | `1.82.1` (exact catalog pin) | Interactive modern OpenAPI 3.1 documentation UI |
| **better-sqlite3** | `13.2.0` (exact catalog pin) | High-performance synchronous SQLite client with WAL mode & bounded ping |
| **drizzle-orm** | `0.45.4` (exact catalog pin) | Type-safe SQL builder & ORM client |
| **drizzle-kit** | `0.31.11` (exact catalog pin) | Drizzle schema migration toolkit |
| **fastify-plugin** | `6.0.1` (exact catalog pin) | Fastify plugin encapsulator |
| **@types/node** | `26.6.6` (exact catalog pin) | Modern Node stdlib types |
| **ioredis** | `5.11.1` (exact catalog pin) | Redis client for caching and pub/sub |
| **ioredis-mock** | `8.13.1` (exact catalog pin) | High-fidelity in-memory Redis client for contract tests |
| **@types/ioredis-mock** | `8.2.8` (exact catalog pin) | TypeScript definitions for ioredis-mock |
| **lru-cache** | `11.5.3` (exact catalog pin) | High-performance bounded in-memory LRU cache |
| **bullmq** | `6.7.8` (exact catalog pin) | Redis-backed distributed message queue with backoff and DLQ |
| **nodemailer** | `10.6.1` (exact catalog pin) | Secure SMTP email transport client |
| **@aws-sdk/client-s3** | `3.1175.0` (exact catalog pin) | Modular AWS SDK v3 S3 client for cloud storage adapter |
| **@aws-sdk/s3-request-presigner** | `3.1175.0` (exact catalog pin) | SigV4 offline pre-signer for secure direct upload/download URLs |
| **stripe** | `23.2.0` (exact catalog pin) | Official Stripe Node.js SDK for billing and subscription lifecycle |
| **razorpay** | `2.9.8` (exact catalog pin) | Official Razorpay Node.js SDK for INR, UPI, and GST billing |

---

## Chunk Progress Board

| Chunk | Wave | Status | TDD Tests | `pnpm verify` | Phase 4 Audit | Notes |
|---|---|---|---|---|---|---|
| **C01** | Wave 1 | `DONE` | 50 / 50 passing | Green (lint, tsc, fitness, 96.3% coverage) | Verified & Remediated | Monorepo toolchain, `brand-types`, `result`, RFC 9562 `uuidv7`, fail-fast `schema`/`loader`, string-aware fitness `scanner`, and universal path alias enforcement |
| **C02** | Wave 1 | `DONE` | 107 / 107 passing | Green (lint, tsc, fitness, 97.9% coverage) | Verified & Remediated | Telemetry, Dual-Layer PII Redaction (`Redacted<T>`, `RedactionEngine`), RED/USE metrics, W3C AsyncLocalStorage tracing, and RFC 9457 Problem Details |
| **C03** | Wave 1 | `DONE` | 168 / 168 passing | Green (lint, tsc, fitness, 96.7% coverage) | Verified & Remediated | Core Ports (`http`, `database`, `lifecycle`), Fastify + SQLite Vertical Slice (`@plinth/modules-brand`, `apps/reference-api`), OpenAPI 3.1 + Scalar API Reference (`/docs`), Graceful Shutdown & Production Multi-Stage `Dockerfile` |
| **C04** | Wave 2 | `DONE` | 261 / 261 passing | Green (lint, tsc, fitness, 94.8% coverage) | Verified & Remediated | Multi-Tenancy Isolation (`TenantContext` AsyncLocalStorage, resolvers, guards), Security Engine (BlockList SSRF guard, sliding-window rate limiter, canonicalized Idempotency-Key manager, hardened security headers), `@plinth/modules-tenants` |
| **C05** | Wave 2 | `DONE` | 355 / 355 passing | Green (lint, tsc, fitness, 95.2% coverage) | Verified & Remediated | Discord-Style `BigInt` Bitmask RBAC Engine (`O(1)`), canonical hex serialization, depth <= 4 scope overwrites, rank + subset anti-escalation invariant, `@plinth/modules-rbac` |
| **C06** | Wave 2 | `DONE` | 469 / 469 passing | Green (lint, tsc, fitness, 95.1% Stmt / 85.4% Branch) | Verified & Remediated | Slim Auth Core, AES-256-GCM Envelope Encryption, Argon2id, Pure Ed25519 JWT, RFC 6238 TOTP, Dual Sessions, Family Replay Detection, Config Store, Append-Only Audit Log |
| **C07** | Wave 3 | `DONE` | 549 / 549 passing | Green (lint, tsc, fitness, 95.6% Stmt / 85.3% Branch) | Verified & Remediated | Shared Port Contract Tests (`HttpServerPort`, `DatabasePort`, PostgreSQL RLS), Express 5 Adapter, Postgres Adapter with RLS & Parameter Normalization, MySQL 2 Adapter |
| **C08** | Wave 3 | `DONE` | 645 / 645 passing | Green (lint, tsc, fitness, 96.1% Stmt / 85.9% Branch) | Verified & Remediated | Cache Engine (`CacheCircuitBreaker` fail-open state machine, Memory LRU, Redis), Transactional Outbox Pattern with DB Polling Worker, BullMQ Redis Worker, Local Email Catcher, SMTP Transport, and SSE Keep-Alive Broadcaster |
| **C09** | Wave 4 | `DONE` | 706 / 706 passing | Green (lint, tsc, fitness, 95.7% Stmt / 85.7% Branch) | Verified & Remediated | User Profiles, Hardened Avatar Storage Port (magic byte inspection, strict non-SVG, EXIF/metadata stripping), Local and S3 Storage Adapters, Stub Analytics with PII text/key scrubbing, and GDPR / India DPDP Compliance Engine (data portability export & right-to-erasure with financial record statutory preservation) |
| **C10** | Wave 4 | `DONE` | 778 / 778 passing | Green (lint, tsc, fitness, 95.51% Stmt / 85.50% Branch) | Verified & Remediated | Billing Engine (Stub, Razorpay INR/UPI/GST & Stripe), integer minor units, raw body HMAC verification, (provider, provider_event_id) idempotency deduplication, and 1-page Swap-to-Production handbooks |
| **C11** | Wave 4 | `DONE` | 806 / 806 passing | Green (lint, tsc, fitness, >85% coverage) | Verified & Remediated | Zero-Build SSR HTML5/CSS admin panel, CLI-only super user creation (`admin:create-superuser`), RFC 6238 TOTP MFA enforcement, strict CSP (`script-src 'none'`), CSRF validation, IP CIDR restriction, brand customization, runtime auth flag toggles, ConfigStore secret management, tenant organization controls, billing simulation, and Dev/Ops inspector |
| **C12** | Wave 5 | `DONE` | 851 / 851 passing | Green (lint, tsc, fitness, >85% coverage) | Verified & Remediated | Interactive `plinth init` CLI (interactive prompts, stack selection, clean standalone repo scaffolding, non-empty directory guard), `plinth add`, `plinth deploy:add`, 4 IaC blueprints (`render-railway`, `vps-caddy`, `aws-terraform`, `gcp-terraform`), 5 operator deployment handbooks, 8 1-page adapter swap handbooks, multi-editor AI kit (`ai-kit/`), and GitHub Actions CI workflow |

---

## Open Deferred Items (P2/P3 Backlog)
- None.

---

## Next Session Exact Starting Point
1. All 12 MVP Roadmap chunks (C01 through C12) are completely materialized, verified, and audited.
2. Run `plinth init` to scaffold a sample downstream application, run `pnpm verify` to confirm out-of-the-box readiness, or tag `v0.1.0` release.
