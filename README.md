<div align="center">

# 🏛️ plinth

### **Production-grade backend primitives you own. Not a black-box framework.**

**The foundational TypeScript backend platform you would spend months building—scaffolded in seconds, decoupled by design, and 100% owned by you.**

[![Node.js 24 LTS](https://img.shields.io/badge/node-%3E%3D24%20LTS-brightgreen.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![TypeScript 7.0](https://img.shields.io/badge/typescript-7.0%20(erasable)-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Pure ESM](https://img.shields.io/badge/modules-pure%20ESM-yellow.svg?style=flat-square)](https://nodejs.org/api/esm.html)
[![Zero Infra Leaks](https://img.shields.io/badge/architecture-hexagonal-success.svg?style=flat-square)](#-hexagonal-architecture)
[![Biome Strict](https://img.shields.io/badge/lint%20%26%20format-biome-60a5fa.svg?style=flat-square&logo=biome)](https://biomejs.dev/)
[![Vitest 100%](https://img.shields.io/badge/tests-928%20passing-emerald.svg?style=flat-square&logo=vitest)](https://vitest.dev/)
[![License MIT](https://img.shields.io/badge/license-MIT-purple.svg?style=flat-square)](#-license)

<br />

[**Website & Live Docs**](./website/index.html) · [**Social Media API Example**](./examples/social-media-api) · [**Quickstart**](#-quickstart-in-60-seconds) · [**Architecture**](#-hexagonal-architecture)

<br />

</div>

---

## ⚡ The Dilemma Every Engineering Team Faces

When building a modern production backend, engineering teams are typically forced into one of two painful traps:

1. **The Black-Box Framework Trap:** You install a massive, opinionated npm framework. It promises instant velocity, but wraps your domain in proprietary decorators, heavy reflection metadata, and hidden magic. The moment you need custom session revocation, complex multi-tenant database isolation, or zero-downtime migrations, you find yourself fighting the framework's internal abstractions.
2. **The Fragile Glue-Code Boilerplate:** You assemble 40 unvetted packages from a generic starter template. Database models leak directly into HTTP route handlers, multi-tenancy is an afterthought `WHERE` clause (one missed filter away from a catastrophic cross-tenant breach), and secrets sit unencrypted in `.env`.

---

## 💡 The Plinth Solution: Total Code Ownership

**Plinth eliminates both traps.** It provides battle-tested, production-ready backend primitives that are decoupled by design:

- **100% Code Ownership:** You own every service, port, adapter, and SQL migration. No upstream lock-in.
- **Strict Hexagonal Architecture (Ports & Adapters):** Core domain modules have zero imports from HTTP frameworks, SQL drivers, or cloud SDKs. Infrastructure can be swapped in minutes without touching business logic.
- **Zero Magic, Zero Decorators:** Pure, testable TypeScript. No `reflect-metadata`, no experimental decorators, and no runtime container overhead.
- **Compile-Time Multi-Tenant Isolation:** Unscoped queries are impossible at compile time thanks to branded `TenantContext` guards and database Row-Level Security (RLS).
- **$O(1)$ BigInt Bitmask Permissions:** Evaluate millions of permission checks in sub-milliseconds with built-in role hierarchy and anti-escalation guarantees.
- **Zero-Account Local Development:** Run 100% offline immediately against SQLite and in-memory caches. Swap to PostgreSQL, Redis, or cloud storage when ready to deploy.

---

## ⚡ Quickstart in 60 Seconds

### Option A: Scaffold a New Service with the Interactive CLI

```bash
# Run the interactive scaffolder
npx @plinth/cli init
```

Choose your stack interactively:
- **Tenancy:** Single-Tenant or Multi-Tenant (subdomain, header, or path resolution)
- **Database:** SQLite, PostgreSQL (with Row-Level Security), or MySQL
- **HTTP Driver:** Fastify or Express
- **Cache & Queue:** Memory LRU, Redis, DB Outbox Polling, or BullMQ
- **Storage & Email:** Local Filesystem, S3, Local Email Catcher, or SMTP
- **Deployment Blueprints:** Docker Compose, VPS + Reverse Proxy, or Container Clusters

### Option B: Explore the Included Social Media Backend Example

```bash
# Clone the repository
git clone https://github.com/devnadeemashraf/plinth.git
cd plinth

# Install dependencies
pnpm install

# Run the complete test suite (928 tests across 101 suites)
pnpm test

# Boot the Social Media API example
pnpm --filter @plinth/example-social-media dev
```

Visit:
- 📖 **Interactive Scalar API Docs:** [`http://localhost:3001/docs`](http://localhost:3001/docs)
- 📜 **OpenAPI 3.1 Specification:** [`http://localhost:3001/openapi.json`](http://localhost:3001/openapi.json)
- 💓 **Liveness Probe (Zero I/O):** [`http://localhost:3001/health/live`](http://localhost:3001/health/live)
- 🩺 **Readiness Probe (DB Ping):** [`http://localhost:3001/health/ready`](http://localhost:3001/health/ready)

---

## 🏛️ Hexagonal Architecture

Plinth enforces strict architectural boundaries. Core domain logic communicates solely with pure interfaces (Ports), while external drivers (Adapters) implement those ports.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          Your Business Domain                          │
│         (Auth, Tenants, Roles, Posts, Comments, Profiles)              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Calls pure ports)
┌───────────────────────────────────▼────────────────────────────────────┐
│                         Core Ports & Contracts                         │
│   DatabasePort │ HttpServerPort │ CachePort │ StoragePort │ EmailPort  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Implemented by swappable adapters)
┌───────────────────────────────────▼────────────────────────────────────┐
│                         Swappable Adapters                             │
│  Fastify / Express │ SQLite / PostgreSQL / MySQL │ Memory / Redis / S3 │
└────────────────────────────────────────────────────────────────────────┘
```

**Automated CI Fitness Enforcement:** Our static architectural fitness scanner (`pnpm test:fitness`) analyzes the AST of every domain file on every build, ensuring that zero infrastructure imports or process escapes ever enter your core business logic.

---

## 🛠️ Key Capabilities & Code Examples

### 1. Type-Safe Route Contracts (Zod 4 -> OpenAPI 3.1)

Define route contracts with Zod schemas. Plinth validates input parameters, generates OpenAPI 3.1 specifications, powers the interactive documentation UI, and standardizes errors into **RFC 9457 Problem Details**:

```typescript
import { defineRoute } from "@plinth/core";
import { z } from "zod";

export const createPostContract = defineRoute({
  method: "POST",
  path: "/api/v1/posts",
  summary: "Create a new post",
  tags: ["Posts"],
  headersSchema: z.object({
    "x-user-id": z.string().min(1),
  }),
  bodySchema: z.object({
    content: z.string().min(1).max(500),
    mediaUrl: z.string().url().optional(),
    tags: z.array(z.string()).max(10).optional(),
  }).strict(),
  responseSchemas: {
    201: z.object({
      id: z.string(),
      authorId: z.string(),
      content: z.string(),
      createdAt: z.string(),
    }),
  },
});
```

### 2. High-Performance $O(1)$ BigInt Bitmask Permissions

Evaluate millions of permissions in microsecond bitwise operations. Roles, overrides, and hierarchy anti-escalation rules are mathematically verified:

```typescript
import { hasBit, addBits, isSubset, toCanonicalHex } from "@plinth/core";

// Define bitmask flags as native BigInt
const PERM_POST_CREATE   = 1n << 0n;
const PERM_POST_DELETE   = 1n << 1n;
const PERM_COMMENT_CREATE= 1n << 2n;
const PERM_MODERATE      = 1n << 3n;
const PERM_ADMINISTRATOR = 1n << 63n;

// Single-instruction check:
const canCreate = hasBit(userPermissions, PERM_POST_CREATE);

// Anti-escalation check: user cannot grant permissions they do not possess
if (!isSubset(newRolePermissions, actorPermissions)) {
  throw new ForbiddenError("Privilege escalation blocked");
}
```

### 3. Dual-Layer Zero-Leak PII Redaction

Prevent authorization tokens, passwords, credit card numbers, and customer PII from ever leaking into logs, traces, or APM tools:

```typescript
import { Redacted, createLogger } from "@plinth/core";

// 1. Compile-time encapsulation: value cannot be printed or JSON-serialized
const apiKey = new Redacted("sk_live_93847291834729");
console.log(`${apiKey}`); // "[REDACTED]"
console.log(JSON.stringify({ key: apiKey })); // '{"key":"[REDACTED]"}'

// 2. Automated format maskers in structured logger
const logger = createLogger({ level: "info" });
logger.info("User checkout initiated", {
  email: "customer@example.com", // -> "c***r@example.com"
  cardNumber: "4111111111111234", // -> "****-****-****-1234"
  token: "Bearer eyJhbGciOi...", // -> "[REDACTED_TOKEN]"
});
```

### 4. Zero-Downtime Graceful Lifecycle

Handle container `SIGTERM` and graceful restarts with zero dropped client connections:

```typescript
// 1. Mark status shutting down -> /health/ready fails immediately (503)
// 2. In-flight HTTP requests complete cleanly within bounded drain budget (15s)
// 3. HTTP server stops accepting new connections
// 4. Background queues, workers, and database connection pools close cleanly
await app.close();
```

---

## 📦 Monorepo Packages

| Package | Purpose |
|---|---|
| **`@plinth/core`** | Zero-dependency kernel: ports, RFC 9457 errors, BigInt bitmasks, RedactionEngine, crypto, UUIDv7. |
| **`@plinth/cli`** | Interactive scaffolding CLI: `plinth init`, `plinth add`, `plinth deploy:add`, `plinth admin:*`. |
| **`@plinth/adapter-http-fastify`** | High-throughput Fastify HTTP adapter with OpenAPI 3.1 & Scalar docs. |
| **`@plinth/adapter-http-express`** | Drop-in Express HTTP adapter passing the same contract test suite. |
| **`@plinth/adapter-db-sqlite`** | Synchronous WAL-mode SQLite adapter for instant local dev and edge deployments. |
| **`@plinth/adapter-db-postgres`** | PostgreSQL adapter with connection pooling and Row-Level Security (RLS) enforcement. |
| **`@plinth/adapter-db-mysql`** | High-performance MySQL adapter with connection pooling. |
| **`@plinth/adapter-cache-memory`** | Bounded LRU in-memory cache with TTL expiration. |
| **`@plinth/adapter-cache-redis`** | Redis cache adapter with built-in fail-open circuit breaker. |
| **`@plinth/adapter-queue-db`** | Zero-dependency transactional outbox worker for $0-tier deployments. |
| **`@plinth/adapter-queue-bullmq`** | Distributed Redis-backed job queue with exponential backoff and dead-letter queues. |
| **`@plinth/adapter-storage-local`** | Local filesystem storage with strict path traversal containment. |
| **`@plinth/adapter-storage-s3`** | S3-compatible cloud storage adapter with SigV4 offline presigned URLs. |
| **`@plinth/adapter-email-stub`** | Local development email catcher storing emails for instant inspection. |
| **`@plinth/adapter-email-smtp`** | SMTP email adapter with CRLF injection protection. |

---

## 🛡️ Quality Gates & Verification

Every pull request and build must pass all automated quality gates:

```bash
pnpm lint          # Biome strict linting & formatting (0 errors, 0 warnings)
pnpm typecheck     # TypeScript 7.0 composite project references (tsc --build)
pnpm test:fitness  # Hexagonal boundary scanner (0 infra leaks in domain)
pnpm test:coverage # Vitest full test suite (>= 85% coverage across all thresholds)
pnpm verify        # Runs all four verification gates sequentially
```

---

## 📄 License

Distributed under the [MIT License](./LICENSE). Build whatever you want with it—commercial, private, or open source.
