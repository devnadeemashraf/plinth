# `plinth` — Living Project State (Source of Truth for Session Continuity)

> **AI INSTRUCTION:** Read this file at the start of EVERY session and update it at the end of EVERY chunk or work session.

**Last Updated:** 2026-11-21  
**Current Phase:** Phase 3/4 Execution — **Chunk C02 Complete**; Ready to build **Chunk C03**  
**Active Branch / Repo Status:** C01 and C02 materialized, verified, and pre-/post-audited. Universal path aliases (`@plinth/core`, `@/*`, `#/*`) enforced throughout. `pnpm verify` passes with 107 tests and 97.9% coverage.

---

## Verified Local Environment & Toolchain Baseline

> Before modifying versions, follow `docs/ai/DEPENDENCY_AND_VERSION_POLICY.md` and check live npm versions!

| Tool / Package | Pinned Version | Notes |
|---|---|---|
| **Node.js** | `v24.22.0` (24 LTS / 26 LTS) | Pure ESM, `erasableSyntaxOnly: true` |
| **pnpm** | `12.21.0` | `saveExact: true`, `catalogMode: strict`, `minimumReleaseAge: 1440` (with `minimumReleaseAgeExclude: ["typescript"]`) |
| **TypeScript** | `7.0.2` (exact catalog pin) | `tsc --build --noEmit`, strict `NodeNext` |
| **Biome** | `2.6.8` (exact catalog pin) | `$schema` URL matched to `2.6.8`, preset `recommended`, zero-warning pass |
| **Vitest** | `5.1.1` (exact catalog pin) | Matched to `@vitest/coverage-v8@5.1.1` |
| **Zod** | `4.6.7` (exact catalog pin) | Zod 4 tree-shakeable API (`strictObject`, `error: ...`) |
| **Pino** | `10.4.0` (exact catalog pin) | Structured logging with custom stream destination & child bindings |
| **@opentelemetry/api** | `1.10.0` (exact catalog pin) | Tracing standard context & attributes |
| **@types/node** | `26.6.6` (exact catalog pin) | Modern Node stdlib types |

---

## Chunk Progress Board

| Chunk | Wave | Status | TDD Tests | `pnpm verify` | Phase 4 Audit | Notes |
|---|---|---|---|---|---|---|
| **C01** | Wave 1 | `DONE` | 50 / 50 passing | Green (lint, tsc, fitness, 96.3% coverage) | Verified & Remediated | Monorepo toolchain, `brand-types`, `result`, RFC 9562 `uuidv7`, fail-fast `schema`/`loader`, string-aware fitness `scanner`, and universal path alias enforcement |
| **C02** | Wave 1 | `DONE` | 107 / 107 passing | Green (lint, tsc, fitness, 97.9% coverage) | Verified & Remediated | Telemetry, Dual-Layer PII Redaction (`Redacted<T>`, `RedactionEngine`), RED/USE metrics, W3C AsyncLocalStorage tracing, and RFC 9457 Problem Details |
| **C03** | Wave 1 | `NOT_STARTED` | — | — | — | Core Ports, Fastify + SQLite Vertical Slice & Lifecycle (OpenAPI 3.1 + Scalar API Reference) |
| **C04** | Wave 2 | `NOT_STARTED` | — | — | — | Multi-Tenancy Engine, Bounds, Rate Limits, SSRF & Idempotency |
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
2. Query live npm registry for any new dependencies needed for **Chunk C03** (Fastify v5, `@fastify/cors`, `@fastify/sensible`, `better-sqlite3`, Scalar, etc.) and pin exact versions in `pnpm-workspace.yaml` `catalog:`.
3. Design and build **Chunk C03** (`packages/core/src/ports/{http,database,lifecycle}.ts`, `packages/core/src/contracts/{route,openapi,pagination}.ts`, `packages/adapter-http-fastify/*`, `packages/adapter-db-sqlite/*`, `apps/reference-api/*`) with OpenAPI 3.1 + Scalar API Reference (`/docs`) using strict 5-category TDD.
4. Run `pnpm verify`, perform Phase 4 Adversarial Audit, and update project state.
