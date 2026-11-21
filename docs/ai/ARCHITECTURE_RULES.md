# `plinth` Canonical Architecture & Engineering Rules

Every human contributor and AI coding agent MUST obey these invariants on every single line of code. Violating any rule below is a **P0/P1 build blocker**.

---

## 1. Hexagonal Dependency Direction Law (Zero Leaks)
- `packages/core/src/**` MUST NOT import any HTTP framework (`fastify`, `express`, `hono`), SQL/ORM driver (`drizzle-orm`, `pg`, `postgres`, `mysql2`, `better-sqlite3`), cache/queue client (`ioredis`, `redis`, `bullmq`), payment/email/cloud SDK (`stripe`, `razorpay`, `nodemailer`, `@aws-sdk/*`), or any `@plinth/adapter-*` package.
- `packages/modules/**` MUST import only from `@plinth/core` and peer domain contracts—never directly from an adapter.
- Adapters (`packages/adapter-*`) implement `@plinth/core` Port interfaces and are wired ONLY in the Composition Root (`src/bootstrap/container.ts`).
- `process.env` (or `import { env } from "node:process"`) is ONLY permitted inside `src/config/`. Everywhere else receives a deeply frozen typed config object via dependency injection.

## 2. Explicit Contracts First
- Every HTTP endpoint is declared via a framework-agnostic `RouteContract` using **Zod v4** schemas for `params`, `query`, `headers`, `body`, and `response` (single source of truth for validation, TypeScript types, and OpenAPI 3.1 generation).
- Reject unknown extraneous input fields strictly (`.strict()` where appropriate on mutation DTOs) to prevent mass-assignment/over-posting.
- Every error crossing a transport boundary MUST serialize to **RFC 9457 Problem Details** (`application/problem+json`) containing `type`, `title`, `status`, `detail`, `instance`, and `traceId`. Never emit raw stack traces or SQL error strings in production.

## 3. Structural Multi-Tenancy (Zero IDOR)
- Every tenant-scoped repository method MUST take a branded `TenantContext` minted exclusively by the verified tenant-membership middleware. Never accept `tenantId` from request body or query params without verifying membership.
- Never bypass `TenantContext` for "convenience". Admin cross-tenant queries must use an explicitly audited `SystemAdminContext` with an explicit audit log entry.
- On PostgreSQL, every tenant-scoped transaction MUST set `SET LOCAL app.current_tenant_id = $1` so RLS enforces isolation inside the database engine.

## 4. `O(1)` Bitmask RBAC & Anti-Escalation
- Never store permissions as raw JS `number` bitmasks (32-bit truncation bug). Always use `BigInt` in memory and canonical hex strings in SQL.
- Every role mutation or assignment MUST verify BOTH:
  1. `actorHighestPosition > targetRole.position`
  2. `(targetRole.permissions & ~actorEffectiveMask) === 0n`
- Core system permission bits occupy `0..63`; product permissions start at bit `64+`.

## 5. Dual-Layer PII Masking & Zero Secret Leaks
- Wrap sensitive domain values (`password`, `token`, `secret`, `apiKey`, `email`, `phone`, `pan`, `aadhaar`, `cardNumber`) in `Redacted<T>` or pass through `RedactionEngine` before logging, tracing, or returning errors.
- Never use `console.log` / `console.error` anywhere in production code (enforced by Biome `noConsole: "error"`). Always use the injected structured Pino `LoggerPort`.
- Secrets stored in SQL (OAuth secrets, SMTP creds, payment keys) MUST use AES-256-GCM envelope encryption. Never store plaintext secrets or compare secrets with `===` (always use `crypto.timingSafeEqual`).

## 6. Bounded Everything (Zero Unbounded I/O or Memory)
- Every HTTP request, DB query, outbound HTTP call, cache call, and health check MUST enforce an explicit timeout and propagate `AbortSignal`.
- Every list endpoint MUST enforce cursor pagination with a hard cap (`limit <= 100`).
- Every in-memory cache or buffer MUST have an explicit max entry/byte cap and TTL.
- Every monetary calculation MUST use integer minor units (paise/cents)—never IEEE 754 floating-point math.
- All timestamps MUST be UTC ISO 8601 (`Date.now()` / `new Date().toISOString()`); elapsed durations MUST use monotonic clocks (`performance.now()` or `process.hrtime.bigint()`).

## 7. Strict TypeScript 7.0 & Biome Discipline
- Never use `any`, `@ts-ignore`, `@ts-expect-error` (except inside unit tests explicitly proving compile-time immutability/safety), or non-null assertions (`!`).
- Use `node:` protocol for all Node.js built-ins (`node:crypto`, `node:fs`, `node:net`).
- Keep syntax erasable (`erasableSyntaxOnly: true` — no TypeScript `enum`, no `namespace`, no parameter properties) so Node 24+/26 native type-stripping and TS 7.0 work seamlessly.

## 8. Path Alias Law (Zero Variable Relative Traversal)
- Always use canonical path aliases (`@plinth/core`, `@/*`, `#/*`) across all production code, vertical feature modules, adapters, and test suites.
- NEVER use variable-depth relative path traversals (`../../src/...`, `../../../../packages/...`, `../../...`).
- NEVER use dynamic variable imports (`import(someVariable)` or `require(someVariable)`). All module imports MUST be statically analyzable and reference canonical path aliases.
- Enforced at compile-time by TypeScript 7.0 `paths`, at test-time by Vitest `resolve.alias`, and at CI-time by the Architectural Fitness Scanner (`VARIABLE_RELATIVE_IMPORT` and `DYNAMIC_VARIABLE_IMPORT`).
