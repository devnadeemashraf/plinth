# `plinth` — Living Project State (Source of Truth for Session Continuity)

> **AI INSTRUCTION:** Read this file at the start of EVERY session and update it at the end of EVERY chunk or work session.

**Last Updated:** 2026-11-21  
**Current Phase:** Phase 3/4 Execution — **Chunk C01 Complete**; Universal Path Aliases Configured; Ready to build **Chunk C02**  
**Active Branch / Repo Status:** C01 materialized, verified, and pre-/post-audited. Universal path aliases (`@plinth/core`, `@/*`, `#/*`) enabled throughout development and testing with fitness scanner enforcement. `pnpm verify` passes with 50 tests and 96.3% coverage.

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
| **@types/node** | `26.6.6` (exact catalog pin) | Modern Node stdlib types |

---

## Chunk Progress Board

| Chunk | Wave | Status | TDD Tests | `pnpm verify` | Phase 4 Audit | Notes |
|---|---|---|---|---|---|---|
| **C01** | Wave 1 | `DONE` | 50 / 50 passing | Green (lint, tsc, fitness, 96.3% coverage) | Verified & Remediated | Monorepo toolchain, `brand-types`, `result`, RFC 9562 `uuidv7`, fail-fast `schema`/`loader`, string-aware fitness `scanner`, and universal path alias enforcement |
| **C02** | Wave 1 | `NOT_STARTED` | — | — | — | Telemetry, Dual-Layer PII Redaction & RFC 9457 Errors |
| **C03** | Wave 1 | `NOT_STARTED` | — | — | — | Core Ports, Fastify + SQLite Vertical Slice & Lifecycle |
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
2. Query live npm registry for any new dependencies needed for **Chunk C02** (Pino, OpenTelemetry, etc.) and pin exact versions in `pnpm-workspace.yaml` `catalog:`.
3. Design and build **Chunk C02** (`packages/core/src/{redaction,observability,errors}/*`) using strict 5-category TDD (`Redacted<T>`, `RedactionEngine`, structured logging, RED metrics, RFC 9457 `ProblemDetails`).
4. Run `pnpm verify`, perform Phase 4 Adversarial Audit, and update project state.
