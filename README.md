# plinth

**The production-ready hexagonal TypeScript backend platform for solo developers.**

Stop spending your first 2 weeks writing the same auth, multi-tenancy, authorization, rate limiting, and error handling boilerplate for every new project. Scaffold a hardened, production-grade backend in 60 seconds with 100% code ownership.

[![Node.js 24 LTS](https://img.shields.io/badge/node-%3E%3D24%20LTS-brightgreen.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![TypeScript 7.0](https://img.shields.io/badge/typescript-7.0%20(erasable)-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Pure ESM](https://img.shields.io/badge/modules-pure%20ESM-yellow.svg?style=flat-square)](https://nodejs.org/api/esm.html)
[![Zero Infra Leaks](https://img.shields.io/badge/architecture-hexagonal-success.svg?style=flat-square)](#hexagonal-architecture)
[![Biome Strict](https://img.shields.io/badge/lint%20%26%20format-biome-60a5fa.svg?style=flat-square&logo=biome)](https://biomejs.dev/)
[![Vitest 100%](https://img.shields.io/badge/tests-passing-emerald.svg?style=flat-square&logo=vitest)](https://vitest.dev/)
[![License MIT](https://img.shields.io/badge/license-MIT-purple.svg?style=flat-square)](#license)

[**Website & Landing Page**](./website/index.html) · [**Full Documentation**](./website/docs.html) · [**Notes API Example**](./examples/notes-api) · [**Quickstart**](#quickstart-in-60-seconds)

---

## Why Solo Developers Choose Plinth

When building a backend alone, you usually face an unattractive tradeoff:

1. **The Heavy Black-Box Framework:** You get going quickly, but your business logic gets tangled in proprietary decorators, heavy reflection metadata, and runtime DI containers. The moment you need custom session revocation, complex multi-tenant isolation, or driver migrations, you end up fighting the framework's internal abstractions.
2. **The Fragile Glue-Code Boilerplate:** You assemble dozens of loose npm packages. Database models leak directly into HTTP route handlers, multi-tenancy is an afterthought `WHERE` clause (one missed filter away from a cross-tenant data leak), and secrets sit unencrypted.

**Plinth eliminates both traps.** It provides production-ready backend primitives that are decoupled by design:

- **100% Code Ownership:** You own every service, port, adapter, and migration in your repository. No vendor lock-in.
- **Strict Hexagonal Architecture:** Domain logic and calculations have zero imports from HTTP frameworks, database drivers, or ORMs.
- **Zero Magic, Zero Decorators:** Pure, statically analyzable TypeScript. No `reflect-metadata` or experimental decorators.
- **Compile-Time Multi-Tenancy:** Scoped `TenantContext` using Node.js `AsyncLocalStorage` prevents cross-tenant data leaks by design.
- **$O(1)$ BigInt Bitmask Permissions:** Evaluate role and permission checks in sub-nanoseconds using 64-bit integer bitmasks with zero database roundtrips.
- **Zero-Account Offline Prototyping:** Develop completely offline against in-memory stubs or SQLite. Swap to PostgreSQL, Redis, or cloud storage by updating a single configuration key.

---

## Quickstart in 60 Seconds

### Scaffold a New Service with the Interactive CLI

```bash
# Run the interactive scaffolding wizard
pnpm create @plinth/app my-backend

# Or via npx
npx @plinth/cli init my-backend
```

Select your stack interactively:
- **Tenancy:** Single-Tenant or Multi-Tenant (subdomain, header, or path resolution)
- **Database:** SQLite (zero-daemon local dev & testing), PostgreSQL (with Row-Level Security), or MySQL
- **HTTP Engine:** Fastify (ultra-high throughput) or Express (ecosystem compatibility)
- **Cache & Queue:** In-Memory LRU, Redis, Database Outbox Polling, or BullMQ
- **Storage & Email:** Local Filesystem, S3-Compatible Cloud Storage, Local Email Catcher, or SMTP
- **Deployment Blueprints:** Docker Compose, VPS + Reverse Proxy, or Container Clusters

---

## Practical Example: Notes API

The repository includes a clean, self-contained **Notes API** in [`examples/notes-api/`](./examples/notes-api) demonstrating how simple it is to build APIs with Plinth.

```bash
# Clone the repository
git clone https://github.com/devnadeemashraf/plinth.git
cd plinth

# Install dependencies
pnpm install

# Run the complete test suite
pnpm test

# Boot the Notes API example
pnpm --filter @plinth/example-notes-api dev
```

Interactive documentation is live at:
- **Interactive Scalar API Docs:** `http://localhost:3000/docs`
- **OpenAPI 3.1 Specification:** `http://localhost:3000/openapi.json`
- **Liveness Probe:** `http://localhost:3000/health/live`
- **Readiness Probe:** `http://localhost:3000/health/ready`

---

## Hexagonal Architecture

Plinth enforces strict architectural boundaries:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          Your Business Domain                          │
│               (Services, Entities, Calculation Rules)                  │
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

## Key Primitives & Code Examples

### 1. Type-Safe Route Contracts (Zod -> OpenAPI 3.1)

Define contracts with Zod schemas. Plinth automatically validates input, generates OpenAPI 3.1 specifications, powers the interactive documentation UI, and emits **RFC 9457 Problem Details** for errors:

```typescript
import { defineRoute, type RouteContract } from "@plinth/core";
import { z } from "zod";

export const createNoteRoute: RouteContract = defineRoute({
  method: "POST",
  path: "/api/v1/notes",
  summary: "Create a new note",
  tags: ["Notes"],
  bodySchema: z.object({
    title: z.string().min(1).max(200),
    content: z.string().max(20000).default(""),
    isPinned: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
  }),
  responseSchemas: {
    201: noteSchema,
  },
});
```

### 2. High-Performance $O(1)$ BigInt Bitmask Permissions

Evaluate millions of permissions in sub-nanosecond bitwise operations. Roles, overrides, and hierarchy anti-escalation rules are mathematically verified:

```typescript
// Define bitmask flags as native BigInt
export const PERMISSIONS = {
  NOTE_READ:     1n << 0n, // 1n
  NOTE_WRITE:    1n << 1n, // 2n
  NOTE_DELETE:   1n << 2n, // 4n
  NOTE_MODERATE: 1n << 3n, // 8n
  ADMINISTRATOR: 1n << 63n, // Superadmin bit
} as const;

// Single-instruction check:
export function hasPermission(userBitmask: bigint, required: bigint): boolean {
  if ((userBitmask & PERMISSIONS.ADMINISTRATOR) === PERMISSIONS.ADMINISTRATOR) {
    return true; // Instant bypass
  }
  return (userBitmask & required) === required;
}
```

### 3. Dual-Layer Zero-Leak PII Redaction

Prevent authorization tokens, passwords, credit card numbers, and customer PII from leaking into logs, traces, or APM tools:

```typescript
import { createLogger, Redacted } from "@plinth/core";

// 1. Compile-time encapsulation: value cannot be printed or serialized
const apiKey = new Redacted("sk_live_93847291834729");
console.log(`${apiKey}`); // "[REDACTED]"

// 2. Automated format maskers in structured logger
const logger = createLogger({ serviceName: "notes-api" });
logger.info(
  { email: "user@example.com", token: "Bearer eyJhbGciOi..." },
  "User created note"
);
// Emitted: {"email":"[REDACTED_EMAIL]","token":"[REDACTED_SECRET]","msg":"User created note"}
```

---

## Monorepo Packages

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

## Quality Gates & Verification

Every pull request and build must pass all automated quality gates:

```bash
pnpm lint          # Biome strict linting & formatting (0 errors, 0 warnings)
pnpm typecheck     # TypeScript 7.0 composite project references (tsc --build)
pnpm test:fitness  # Hexagonal boundary scanner (0 infra leaks in domain)
pnpm test:coverage # Vitest full test suite (>= 85% coverage across all thresholds)
pnpm verify        # Runs all four verification gates sequentially
```

---

## License

Distributed under the [MIT License](./LICENSE). Build whatever you want with it—commercial, private, or open source.
