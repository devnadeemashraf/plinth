# `plinth` — Living Project State (Source of Truth for Session Continuity)

> **AI INSTRUCTION:** Read this file at the start of EVERY session and update it at the end of EVERY chunk or work session.

**Last Updated:** 2026-11-21  
**Current Phase:** Phase 3/4 Execution — **Chunk C04 Complete**; Ready to build **Chunk C05**  
**Active Branch / Repo Status:** C01, C02, C03, and C04 materialized, verified, and pre-/post-audited. Multi-Tenancy Engine (`AsyncLocalStorage` context, resolvers, guards), Security Engine (net.BlockList SSRF filter, sliding-window rate limiter, canonicalized Idempotency-Key manager, hardened security headers), and vertical module `@plinth/modules-tenants` fully implemented. Reference API wires both Brand and Tenants with OpenAPI 3.1 & interactive Scalar API Reference UI at `/docs`. Universal path aliases (`@plinth/core`, `@plinth/modules-brand`, `@plinth/modules-tenants`, `@plinth/adapter-*`, `@plinth/reference-api`, `@/*`, `#/*`) enforced throughout. `pnpm verify` passes with 261 tests and 94.8% coverage.

---

## Verified Local Environment & Toolchain Baseline

> Before modifying versions, follow `docs/ai/DEPENDENCY_AND_VERSION_POLICY.md` and check live npm versions!

| Tool / Package | Pinned Version | Notes |
|---|---|---|
| **Node.js** | `v24.22.0` (24 LTS / 26 LTS) | Pure ESM, `erasableSyntaxOnly: true` |
| **pnpm** | `12.21.0` | `saveExact: true`, `catalogMode: strict`, `minimumReleaseAge: 1440` (with `allowBuilds: { better-sqlite3: true, esbuild: true }`) |
| **TypeScript** | `7.0.2` (exact catalog pin) | Composite project references (`tsc --build`), strict `NodeNext` |
| **Biome** | `2.6.8` (exact catalog pin) | `$schema` URL matched to `2.6.8`, preset `recommended`, zero-warning pass |
| **Vitest** | `5.1.1` (exact catalog pin) | Matched to `@vitest/coverage-v8@5.1.1` |
| **Zod** | `4.6.7` (exact catalog pin) | Zod 4 tree-shakeable API (`strictObject`, `error: ...`) |
| **Pino** | `10.4.0` (exact catalog pin) | Structured logging with custom stream destination & child bindings |
| **@opentelemetry/api** | `1.10.0` (exact catalog pin) | Tracing standard context & attributes |
| **Fastify** | `5.12.8` (exact catalog pin) | Pure ESM HTTP framework with explicit 1MB body limit & safe CORS |
| **@fastify/cors** | `11.4.3` (exact catalog pin) | Production-hardened CORS plugin |
| **@scalar/fastify-api-reference** | `1.82.1` (exact catalog pin) | Interactive modern OpenAPI 3.1 documentation UI |
| **better-sqlite3** | `13.2.0` (exact catalog pin) | High-performance synchronous SQLite client with WAL mode & bounded ping |
| **drizzle-orm** | `0.45.4` (exact catalog pin) | Type-safe SQL builder & ORM client |
| **drizzle-kit** | `0.31.11` (exact catalog pin) | Drizzle schema migration toolkit |
| **fastify-plugin** | `6.0.1` (exact catalog pin) | Fastify plugin encapsulator |
| **@types/node** | `26.6.6` (exact catalog pin) | Modern Node stdlib types |

---

## Chunk Progress Board

| Chunk | Wave | Status | TDD Tests | `pnpm verify` | Phase 4 Audit | Notes |
|---|---|---|---|---|---|---|
| **C01** | Wave 1 | `DONE` | 50 / 50 passing | Green (lint, tsc, fitness, 96.3% coverage) | Verified & Remediated | Monorepo toolchain, `brand-types`, `result`, RFC 9562 `uuidv7`, fail-fast `schema`/`loader`, string-aware fitness `scanner`, and universal path alias enforcement |
| **C02** | Wave 1 | `DONE` | 107 / 107 passing | Green (lint, tsc, fitness, 97.9% coverage) | Verified & Remediated | Telemetry, Dual-Layer PII Redaction (`Redacted<T>`, `RedactionEngine`), RED/USE metrics, W3C AsyncLocalStorage tracing, and RFC 9457 Problem Details |
| **C03** | Wave 1 | `DONE` | 168 / 168 passing | Green (lint, tsc, fitness, 96.7% coverage) | Verified & Remediated | Core Ports (`http`, `database`, `lifecycle`), Fastify + SQLite Vertical Slice (`@plinth/modules-brand`, `apps/reference-api`), OpenAPI 3.1 + Scalar API Reference (`/docs`), Graceful Shutdown & Production Multi-Stage `Dockerfile` |
| **C04** | Wave 2 | `DONE` | 261 / 261 passing | Green (lint, tsc, fitness, 94.8% coverage) | Verified & Remediated | Multi-Tenancy Isolation (`TenantContext` AsyncLocalStorage, resolvers, guards), Security Engine (BlockList SSRF guard, sliding-window rate limiter, canonicalized Idempotency-Key manager, hardened security headers), `@plinth/modules-tenants` |
| **C05** | Wave 2 | `NOT_STARTED` | — | — | — | Discord-Style `BigInt` Bitmask RBAC Engine (`O(1)`) |
| **C06** | Wave 2 | `NOT_STARTED` | — | — | — | Slim Auth Core, Encrypted Config, Dual Sessions & Audit Log |
| **C07** | Wave 3 | `NOT_STARTED` | — | — | — | Shared Contract Tests + Express 5, Postgres (RLS) & MySQL |
| **C08** | Wave 3 | `NOT_STARTED` | — | — | — | Cache, Transactional Outbox, Queues (DB/BullMQ), Email Catcher & SSE |
| **C09** | Wave 4 | `NOT_STARTED` | — | — | — | User Profiles, Hardened Avatar Storage & GDPR/India DPDP Compliance |
| **C10** | Wave 4 | `NOT_STARTED` | — | — | — | Billing Engine (Stub, Razorpay INR/UPI/GST & Stripe) |
| **C11** | Wave 4 | `NOT_STARTED` | — | — | — | Zero-Build SSR Admin Panel, Super User CLI & Dev/Ops Inspector |
| **C12** | Wave 5 | `NOT_STARTED` | — | — | — | Interactive `plinth init` CLI, Deploy Handbooks & Multi-Editor AI Kit |

---

## Open Deferred Items (P2/P3 Backlog)
- None.

---

## Next Session Exact Starting Point
1. Activate `plinth-chunk-builder` skill.
2. Query live npm registry for any new dependencies needed for **Chunk C05** (Discord-Style `BigInt` Bitmask RBAC Engine, canonical hex persistence, depth <= 4 overwrites, rank + subset anti-escalation invariant).
3. Design and build **Chunk C05** with strict 5-category TDD (`packages/core/src/rbac/*`, `packages/modules/rbac/*`).
4. Run `pnpm verify`, perform Phase 4 Adversarial Audit, and update project state.
