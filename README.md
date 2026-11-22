<div align="center">

# 🏛️ plinth

### **Production-grade backend primitives you own. Not a black-box framework.**

**The foundational TypeScript backend platform you would spend 6 months building—scaffolded in seconds, decoupled by design, and 100% yours.**

[![Node.js 24 LTS](https://img.shields.io/badge/node-%3E%3D24%20LTS-brightgreen.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![TypeScript 7.0](https://img.shields.io/badge/typescript-7.0%20(erasable)-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Pure ESM](https://img.shields.io/badge/modules-pure%20ESM-yellow.svg?style=flat-square)](https://nodejs.org/api/esm.html)
[![Zero Infra Leaks](https://img.shields.io/badge/architecture-hexagonal-success.svg?style=flat-square)](#-the-plinth-philosophy-code-ownership-over-framework-lock-in)
[![Biome Strict](https://img.shields.io/badge/lint%20%26%20format-biome-60a5fa.svg?style=flat-square&logo=biome)](https://biomejs.dev/)
[![Vitest 100%](https://img.shields.io/badge/coverage-%3E%3D95%25-emerald.svg?style=flat-square&logo=vitest)](https://vitest.dev/)
[![License MIT](https://img.shields.io/badge/license-MIT-purple.svg?style=flat-square)](#-license)

<br />

[**Explore the Roadmap**](./docs/ROADMAP.md) · [**Architecture Invariants**](./docs/ai/ARCHITECTURE_RULES.md) · [**Quickstart**](#-quickstart-in-60-seconds) · [**The Philosophy**](#-the-plinth-philosophy-code-ownership-over-framework-lock-in)

<br />

</div>

---

### What is `plinth`?

Modern engineering teams face a frustrating dilemma when building backends:

1. **The Black-Box Framework Trap:** You install an opinionated, monolithic backend framework via `npm`. It promises rapid velocity, but wraps your business domain in proprietary abstractions, reflection decorators, and hidden magic. When you hit a custom auth requirement, complex database edge case, or need zero-downtime migrations, you end up fighting the framework's black box or waiting for upstream patches.
2. **The Fragile Glue-Code Boilerplate:** You stitch together 40 unvetted packages from a GitHub template. The ORM leaks directly into HTTP handlers, multi-tenancy is an afterthought `WHERE` clause (one missed filter away from a cross-tenant data breach), and the codebase lacks strict architectural boundaries.

### The `plinth` Way: Code Ownership Over Black-Box Dependencies

**`plinth` rejects both extremes.**

It is not an opaque npm runtime you import as a black box. Instead, `plinth` provides beautifully engineered, battle-hardened backend primitives that are **scaffolded directly into your repository**:

- **You own the code.** Every service, port, adapter, and database schema lives directly in your codebase. No upstream lock-in.
- **Copy, customize, and evolve.** Need a custom Argon2 parameter? A custom session strategy? An unusual database index? Edit the code directly in your project without fighting an external abstraction.
- **Zero magic, zero decorators.** Pure, testable, dependency-injected TypeScript. No `reflect-metadata`, no hidden proxies, no runtime voodoo.
- **Guaranteed architectural boundaries.** Built-in fitness tests ensure infrastructure dependencies never leak into your core business domain.

---

### Key Capabilities

- 🛡️ **100% Multi-Tenant Isolation** — Unscoped tenant queries are compile-time TypeScript errors.
- ⚡ **Discord-Style `O(1)` Bitmask RBAC** — Millions of permission checks evaluated in `< 0.1ms` using `BigInt`.
- 🔑 **Hardened Auth & Dual Sessions** — Argon2id password hashing, pure Node.js Ed25519 JWTs, rotating refresh tokens with family reuse revocation, and RFC 6238 TOTP MFA.
- 🔒 **Zero-Leak Telemetry & PII Redaction** — Dual-layer `RedactionEngine` and `Redacted<T>` mask passwords, tokens, and PII before they ever touch logs or traces.
- 📖 **OpenAPI 3.1 + Interactive Scalar UI** — Native Zod-to-OpenAPI schema compiler with modern, beautiful documentation at `/docs` on Day One.
- 💻 **Zero-Account Local Development** — Runs 100% offline immediately against SQLite, in-memory caches, and local billing/email stubs. Swap to Postgres, Redis, and Stripe with 1-page adapter handbooks when you're ready to ship.

---

## ⚡ Quickstart in 60 Seconds

Experience the reference API with zero external dependencies (no Docker or cloud accounts required):

```bash
# 1. Clone the repository
git clone https://github.com/devnadeemashraf/plinth.git
cd plinth

# 2. Install dependencies with strict pnpm catalog pinning
pnpm install

# 3. Run the full verification suite (Biome + tsc + Architecture Fitness + Vitest)
pnpm verify

# 4. Boot the reference service against SQLite
pnpm dev
```

Visit:

- 📖 **Interactive Scalar API Docs:** [`http://localhost:3000/docs`](http://localhost:3000/docs)
- 📜 **OpenAPI 3.1 JSON Specification:** [`http://localhost:3000/openapi.json`](http://localhost:3000/openapi.json)
- 💓 **Zero-I/O Liveness Probe:** [`http://localhost:3000/health/live`](http://localhost:3000/health/live)
- 🩺 **Bounded DB Readiness Probe:** [`http://localhost:3000/health/ready`](http://localhost:3000/health/ready)

---

## 💡 The `plinth` Philosophy: Code Ownership Over Framework Lock-In

Most backend templates fail for two opposite reasons:

1. **The Heavyweight Monolith:** They wrap you in proprietary abstractions, magic decorators, and dynamic DI containers. When you need to customize an auth edge-case or tune a SQL index, you're fighting the framework.
2. **The Fragile Glue-Code Boilerplate:** A pile of loosely pasted packages with no architectural boundaries. The ORM leaks into HTTP handlers, multi-tenancy is an afterthought `WHERE` clause (one missed filter away from a data breach), and secrets sit unencrypted in `.env`.

### The Architecture:

```text
┌────────────────────────────────────────────────────────┐
│                      Your Code                         │
│   (You own every module: Auth, Tenants, RBAC, Brand)   │
└───────────────────────────┬────────────────────────────┘
                            │ (Calls pure ports)
┌───────────────────────────▼────────────────────────────┐
│                  Core Ports & Contracts                │
│    DatabasePort  │  HttpServerPort  │  LifecyclePort   │
└───────────────────────────┬────────────────────────────┘
                            │ (Implemented by swappable adapters)
┌───────────────────────────▼────────────────────────────┐
│                   Pluggable Adapters                   │
│   Fastify / Express  │  SQLite / PostgreSQL  │  Memory │
└────────────────────────────────────────────────────────┘
```

1. **Own Your Primitives:** You have full visibility into every domain service, repository, and route contract.
2. **Compile-Time Guarantees:** Strict TypeScript 7.0 (`exactOptionalPropertyTypes`, `erasableSyntaxOnly`, `noImplicitOverride`) catches bugs at build time.
3. **Automated Architectural Fitness Tests:** Our built-in static scanner checks every file during `pnpm test:fitness` to ensure no infrastructure libraries ever leak into your domain core.

---

## 🛠️ The Developer Experience

### 1. Defining a Typed Route Contract (Zod 4 -> OpenAPI 3.1)

No decorators. Define a route contract with Zod schemas. `plinth` automatically validates input, generates OpenAPI 3.1 specs, powers the Scalar documentation UI, and standardizes errors to **RFC 9457 Problem Details**:

```typescript
import { defineRoute } from "@plinth/core";
import { z } from "zod";

export const updateBrandRoute = defineRoute({
  method: "PUT",
  path: "/api/v1/brand",
  summary: "Update Brand Identity",
  description: "Updates theme colors and visual assets for the current tenant",
  tags: ["Brand"],
  bodySchema: z.strictObject({
    name: z.string().min(1).max(100),
    primaryColorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  responseSchemas: {
    200: z.object({
      name: z.string(),
      primaryColorHex: z.string(),
      updatedAt: z.string(),
    }),
  },
});
```

### 2. Dual-Layer Zero-Leak Redaction

Never worry about leaking passwords, authorization tokens, or sensitive customer PII into your logging pipeline or APM traces:

```typescript
import { Redacted, createLogger } from "@plinth/core";

// 1. Compile-time encapsulation: value cannot be printed or serialized accidentally
const apiKey = new Redacted("sk_live_93847291834729");
console.log(`${apiKey}`); // "[REDACTED]"
console.log(JSON.stringify({ key: apiKey })); // '{"key":"[REDACTED]"}'

// 2. Automated format maskers in the logger for raw structures
const logger = createLogger({ level: "info" });
logger.info("User checkout initiated", {
  email: "customer@example.com", // -> "c***r@example.com"
  cardNumber: "4111111111111234", // -> "****-****-****-1234"
  token: "Bearer eyJhbGciOi...", // -> "[REDACTED_TOKEN]"
});
```

### 3. Graceful Lifecycle & Healthchecks

Zero dropped connections on deployment. `plinth` wires priority-ordered lifecycle shutdown:

```typescript
// 1. Mark shutting down -> Kubernetes readiness probe immediately fails (503)
// 2. In-flight requests drain within 15 seconds
// 3. HTTP listener closes cleanly
// 4. Database connection pools and queues flush & disconnect
await app.close();
```

---

## 🎯 Production Budgets (Baked-In Invariants)

| Invariant                  | Standard                        | Enforcement                                           |
| -------------------------- | ------------------------------- | ----------------------------------------------------- |
| **P95 Latency**            | `< 100ms`                       | RED/USE metrics, non-blocking I/O                     |
| **RBAC Overhead**          | `< 0.1ms`                       | Single-instruction `BigInt` bitmask operations        |
| **Payload Limits**         | Hard `1 MB` JSON, `5 MB` upload | Fastify body limits & magic-byte header validation    |
| **Pagination**             | Hard cap `100` items            | `cursorPaginationQuerySchema` with default `20`       |
| **Readiness Timeout**      | Bounded `2000ms` DB ping        | Automatic timer cleanup to prevent handle leaks       |
| **Shutdown Drain**         | Max `15s` timeout               | Bounded priority draining across all adapters         |
| **Architecture Isolation** | Zero infra SDKs in domain       | String-aware CI fitness scanner (`pnpm test:fitness`) |

---

## 📦 What's Inside

```text
plinth/
├── packages/
│   ├── core/                     # Kernel: ports, contracts, config, RedactionEngine, crypto, RFC 9457
│   ├── modules/
│   │   ├── brand/                # Brand identity domain, schemas & transactional repository
│   │   ├── tenants/              # Tenant isolation, quotas & lifecycle management
│   │   ├── rbac/                 # Discord-style BigInt bitmask authorization engine
│   │   ├── auth/                 # Slim auth core, dual sessions, PKCE & MFA
│   │   ├── config-store/         # Runtime envelope-encrypted config & feature flags
│   │   └── audit/                # Append-only audit logging with automatic PII redaction
│   ├── adapter-http-fastify/     # Fastify v5 adapter + Scalar API Docs + OpenAPI 3.1
│   └── adapter-db-sqlite/        # Better-sqlite3 adapter (WAL mode, Drizzle, bounded ping)
├── apps/
│   └── reference-api/            # Runnable production vertical slice reference service
├── Dockerfile                    # Lean multi-stage Debian-slim container with non-root user
└── docs/                         # Architecture rules, roadmap, audit checklist & handbooks
```

---

## 🛡️ Quality Gates & Verification

Every commit must pass all four quality gates:

```bash
pnpm lint          # Biome strict check (zero warnings, no explicit any, no console)
pnpm typecheck     # TypeScript 7.0 composite project references (tsc --build)
pnpm test:fitness  # Hexagonal boundary scanner (zero infra leaks in domain)
pnpm test:coverage # Vitest full suite (>= 85% coverage, current: > 95%)
pnpm verify        # Runs all four gates sequentially
```

---

## 🛠️ Built With

This project was architected, scaffolded, and hardened using the [**`devnadeemashraf/engg-skills-suite`**](https://github.com/devnadeemashraf/engg-skills-suite) engineering control plane—a production-grade collection of rigorous, autonomous engineering skills covering staff-level architecture, test-driven development (TDD), adversarial security auditing, zero-memory-guessing live research, and modular backend implementation workflows.

---

## 🤝 The Open Source Vision

`plinth` is created by engineers who were tired of rewriting the same 6 months of foundational backend plumbing for every new company, side project, and SaaS.

We believe that **simplicity is the ultimate sophistication**. No heavy framework dependencies to learn. No opaque magic. Just beautiful, composable, production-ready TypeScript code that you completely control.

- ⭐ **Star the project** if you believe backends deserve code ownership instead of black-box framework lock-in.
- 💬 **Join the discussions** and tell us which adapter you want next (Express, Postgres RLS, MySQL, Redis, BullMQ).
- 🛠️ **Read our Roadmap** in [`docs/ROADMAP.md`](./docs/ROADMAP.md) to follow the 5-Wave journey from Core to CLI.

---

## 📄 License

Distributed under the [MIT License](./LICENSE). Build whatever you want with it—commercial, private, or open source.
