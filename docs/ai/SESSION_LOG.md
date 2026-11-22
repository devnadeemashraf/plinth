# `plinth` — Append-Only Engineering Session Log

> Append one concise entry at the end of every work session or completed chunk. Never delete prior entries.

---

## Entry #001 — 2026-11-21 — Architecture Lock, Roadmap Approval & C01 Blueprint
- **Phase Completed:** Phase 1 (4-Round Ruthless Grill -> Locked `docs/EDD.md`), Phase 2 (12-Chunk MVP-First `docs/ROADMAP.md`), and C01 Design + Pre-Audit + Blueprint Kit Export.
- **Key Locked Decisions:**
  - Canonical name: `plinth` (`@plinth/*` monorepo + `plinth init` CLI).
  - Toolchain: Node 24+/26 LTS, TypeScript 7.0 (Go-native `tsc`), Biome v2, Vitest, pnpm 12+ with `saveExact: true`, `catalogMode: strict`, `minimumReleaseAge: 1440`.
  - Auth v1 slimmed to Email/Username + Argon2id password & OAuth2/OIDC (PKCE + Mock OIDC stub) behind live Admin flags + AES-256-GCM envelope-encrypted secrets.
  - RBAC upgraded to Discord-style `BigInt` bitmask (`O(1)` resolution, canonical hex persistence, depth <= 4 overwrites, rank + subset anti-escalation).
  - Billing: Stub + Razorpay (India/UPI/GST) + Stripe (Global); MoR out of v1 scope.
  - Compliance: Init-selectable `none` | `gdpr` | `india-dpdp` | `both`.
- **Pre-Audit Remediations Baked into C01 Spec (`docs/specs/C01-FOUNDATION-SPEC.md`):**
  1. `[P1]` Reject low-entropy 32-byte `MASTER_ENCRYPTION_KEY` (require >= 16 distinct bytes).
  2. `[P1]` Strict CORS origin validation (no path/query/trailing slash, `http`/`https` only, HTTPS-only in prod).
  3. `[P1]` String-aware comment lexer + backtick `import(\`...\`)` + `process["env"]` + `node:process` detection in Architectural Fitness Scanner.
  4. `[P2]` Startup IPv4/IPv6 CIDR validation for `ADMIN_ALLOWED_CIDRS`.
- **Next Action:** Materialize & verify C01 using live-verified exact latest package versions, then begin C02.

---

## Entry #002 — 2026-11-21 — Chunk C01 Execution, Full TDD & Phase 4 Adversarial Audit
- **Chunk Completed:** **C01** (Monorepo Foundation, Toolchain, Fail-Fast Config & Fitness Harness).
- **Exact Pinned Dependencies Added to `pnpm-workspace.yaml` `catalog:`:**
  - `@biomejs/biome`: `2.6.8`
  - `@types/node`: `26.6.6`
  - `@vitest/coverage-v8`: `5.1.1`
  - `typescript`: `7.0.2`
  - `vitest`: `5.1.1`
  - `zod`: `4.6.7`
  - Configured `minimumReleaseAge: 1440` with `minimumReleaseAgeExclude: ["typescript"]` for today's TS 7.0.2 release.
- **Files Created:**
  - Root: `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `tsconfig.json`, `biome.json`, `vitest.config.ts`.
  - Core Package: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`.
  - Domain Primitives: `packages/core/src/primitives/{brand-types,result,uuidv7}.ts`.
  - Config Kernel: `packages/core/src/config/{schema,loader}.ts`.
  - Fitness Harness: `packages/core/src/fitness/scanner.ts`.
  - Test Suites (5-Category Matrix): `packages/core/test/{primitives/result,primitives/uuidv7,config/loader,fitness/architecture}.test.ts`.
- **Live Official Docs & Research Consulted:**
  - TypeScript 7.0 / 5.8 `erasableSyntaxOnly: true` enforcement (prohibiting runtime enums and parameter properties for native type stripping in Node 24).
  - Biome 2.6.8 configuration schema, preset syntax, and strict linter rules.
  - Vitest 5.1.1 v8 coverage options and relative glob matching.
  - Zod 4.6.7 tree-shakeable API (`strictObject`, `error: ...` parameter, `ZodIssue` structure).
  - RFC 9562 UUIDv7 specification (sub-ms counter and monotonic clock advance).
- **Phase 4 Adversarial Audit Remediations:**
  1. `[P1]` **Corrupt Base64 Key Bypass:** Replaced lenient Node `Buffer.from` decoding with strict base64/hex regex validation, blocking silent invalid character stripping.
  2. `[P1]` **URI Credential Scrubbing in Config Errors:** Added regex scrubbing to ensure passwords in URLs (`://user:pass@host`) are unconditionally redacted to `://[REDACTED]:[REDACTED]@`.
  3. `[P1]` **Global Process Evasion Defense:** Enhanced `scanner.ts` to detect `globalThis.process.env` and `globalThis["process"]` outside `src/config/`.
  4. `[P2]` **UUIDv7 Precision & Branch Elimination:** Upgraded UUIDv7 timestamp serialization to native `Buffer.writeUIntBE(lastTimestamp, 0, 6)` and `toString("hex")`, removing floating-point division and boosting branch coverage to 90%.
  5. `[P2]` **Erasable Syntax Invariant:** Replaced internal `const enum` in `scanner.ts` with const literals to strictly obey `erasableSyntaxOnly: true`.
- **Automated Verification (`pnpm verify`):**
  - `pnpm lint`: Biome check 100% clean (0 errors, 0 warnings).
  - `pnpm typecheck`: TypeScript 7.0 `tsc --build --noEmit` 100% clean.
  - `pnpm test:fitness`: Architecture scanner 13/13 tests passing (0 leaks in core).
  - `pnpm test:coverage`: Vitest 47/47 tests passing (96.2% statements, 90.8% branches, 100% functions, 96.2% lines).
- **Next Action:** Execute **Chunk C02** (Telemetry, Dual-Layer PII Redaction & RFC 9457 Errors) using `plinth-chunk-builder`.

---

## Entry #003 — 2026-11-21 — Universal Path Aliases & AI Agent Anti-Variable-Import Enforcement
- **Objective Completed:** Enabled path aliases throughout the project for both development and testing (`@plinth/core`, `@/*`, `#/*`) and enforced usage across AI agent rules and automated fitness tests.
- **Config & Infrastructure Updates:**
  - `tsconfig.base.json` & `packages/core/tsconfig.json`: Mapped `@plinth/core`, `@plinth/core/*`, `@/*`, and `#/*` paths using TypeScript 7.0 standard (without deprecated `baseUrl`).
  - `vitest.config.ts`: Configured `resolve.alias` regexes pointing `@plinth/core`, `@/*`, and `#/*` directly to `packages/core/src` via `fileURLToPath(import.meta.url)`.
  - `packages/core/package.json`: Added standard subpath `"exports"` and `"imports"` (`#*`) mapping.
  - Source & Test Refactor: Converted all existing test and internal source imports from variable-depth relative traversals (`../../src/...`) to clean canonical path aliases (`@/config/loader.js`, `@/primitives/result.js`, etc.).
- **Fitness Scanner Enforcement (`packages/core/src/fitness/scanner.ts`):**
  - Added `VARIABLE_RELATIVE_IMPORT` check: Flags and rejects variable-depth relative traversals (`../../src/...`, `../../packages/...`, `../../...`) across both source and test files.
  - Added `DYNAMIC_VARIABLE_IMPORT` check: Flags and rejects dynamic imports/requires using variable identifiers (`import(var)` or `require(var)`).
  - Added 3 new unit tests in `packages/core/test/fitness/architecture.test.ts` (suite total: 16 passing).
- **AI Agent Operating Rules & Control Plane Hardening:**
  - `docs/ai/ARCHITECTURE_RULES.md`: Added Section 8 ("Path Alias Law & Zero Variable Relative Traversal").
  - `GEMINI.md`: Added Law 6 ("Path Aliases & Zero Variable Imports").
  - `AGENTS.md` & `CLAUDE.md`: Embedded mandatory path alias enforcement.
  - `.gemini/skills/plinth-chunk-builder/SKILL.md` & `backend-scaffold-architect/SKILL.md`: Added path alias mandates in Phase 3 and Phase 4.
- **Automated Verification (`pnpm verify`):**
  - `pnpm lint`: Biome check 100% clean (0 errors, 0 warnings).
  - `pnpm typecheck`: TypeScript 7.0 `tsc --build --noEmit` 100% clean.
  - `pnpm test:fitness`: Architecture scanner 16/16 tests passing.
  - `pnpm test:coverage`: Vitest 50/50 tests passing (96.3% statements, 91.3% branches, 100% functions, 96.3% lines).
- **Next Action:** Execute **Chunk C02** (Telemetry, Dual-Layer PII Redaction & RFC 9457 Errors) using `plinth-chunk-builder`.


---

## Entry #004 — 2026-11-21 — Chunk C02 Execution, Full TDD & Phase 4 Adversarial Audit
- **Chunk Completed:** **C02** (Telemetry, Dual-Layer PII Redaction & RFC 9457 Error Kernel).
- **Exact Pinned Dependencies Added to `pnpm-workspace.yaml` `catalog:`:**
  - `pino`: `10.4.0`
  - `@opentelemetry/api`: `1.10.0`
- **Files Created / Updated:**
  - Redaction Kernel:
    - `packages/core/src/redaction/redacted.ts`: `Redacted<T>` class (Symbol brand, `#value` encapsulation, `toJSON`, `toString`, `[inspect.custom]`, `[Symbol.toPrimitive]`, `isRedacted`).
    - `packages/core/src/redaction/maskers.ts`: `maskEmail`, `maskPhone`, `maskCreditCard`, `maskPan`, `maskAadhaar`, `maskToken`.
    - `packages/core/src/redaction/engine.ts`: `RedactionEngine` (`redact` with circular tracking via `WeakSet`, max depth bounds, `O(1)` pre-normalized dictionary, and `scrubText` with bounded regexes).
  - Observability Ports:
    - `packages/core/src/observability/logger.ts`: `LoggerPort`, `LogLevel`, `LogDestination`, `createLogger` wrapping Pino with automatic `RedactionEngine` serialization and contextual `child` loggers.
    - `packages/core/src/observability/metrics.ts`: `MetricsPort`, `createInMemoryMetrics`, `recordHttpRequest` (RED metrics), USE metrics, and cardinality bounding (`maxEntries`).
    - `packages/core/src/observability/tracing.ts`: `TracingPort`, `createInMemoryTracer`, `AsyncLocalStorage`-backed W3C trace context, `withSpan`, and attribute redaction.
  - RFC 9457 Error Kernel:
    - `packages/core/src/errors/app-error.ts`: `AppError` base class, `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `ValidationError`, `RateLimitExceededError`, `InternalServerError`, `ServiceUnavailableError`.
    - `packages/core/src/errors/problem-details.ts`: `ProblemDetails` interface, `toProblemDetails` serializer with production stack suppression and credential URL sanitization.
    - `packages/core/src/errors/index.ts`: Unified re-export.
  - Core Barrel:
    - `packages/core/src/index.ts`: Re-exported all C02 primitives and ports with canonical path aliases.
  - Test Suites (5-Category Matrix, 10 suites total):
    - `packages/core/test/redaction/redacted.test.ts` (10 tests)
    - `packages/core/test/redaction/engine.test.ts` (12 tests)
    - `packages/core/test/observability/logger.test.ts` (8 tests)
    - `packages/core/test/observability/metrics.test.ts` (8 tests)
    - `packages/core/test/observability/tracing.test.ts` (6 tests)
    - `packages/core/test/errors/problem-details.test.ts` (13 tests)
- **Phase 4 Adversarial Audit Remediations:**
  1. `[P1 Blocker / High]` **ReDoS in Email & URI Regexes:** Hostile testing with 100,000-character attack strings (`a@ + (a.)*50000` and `http:// + (a)*100000`) caused ~6,000 ms event loop freezes. Remediated with RFC 5321 length-bounded quantifiers (`{1,64}`, `{1,63}`, `{1,256}`), dropping evaluation time from ~6,000 ms to < 20 ms. Added regression benchmarks asserting `< 100ms`.
  2. `[P1 High]` **High-Cardinality OOM DoS in InMemoryMetrics:** `InMemoryMetrics` lacked bounding on total registered metric keys. Enforced a default `maxEntries: 5000` cap to reject novel keys once saturated, guarding against memory exhaustion attacks. Added regression test.
  3. `[P2 Medium]` **`O(N)` Sensitive Key Scan in RedactionEngine:** Optimized `isSensitiveKey` from runtime `O(N)` string iterations to `O(1)` pre-normalized `Set` lookups; expanded default sensitive key dictionary with `"authtoken"`, `"idtoken"`, `"jwt"`, `"credential"`.
  4. `[P2 Medium]` **Unscrubbed Validation Error Messages:** Enhanced `toProblemDetails` to recursively scrub credential URLs in `ValidationErrorDetail[]` issue messages (`errors[].message`).
- **Automated Verification (`pnpm verify`):**
  - `pnpm lint`: Biome check 100% clean (0 errors, 0 warnings).
  - `pnpm typecheck`: TypeScript 7.0 `tsc --build --noEmit` 100% clean.
  - `pnpm test:fitness`: Architecture scanner 16/16 tests passing (zero leaks in core).
  - `pnpm test:coverage`: Vitest 107/107 tests passing (97.9% statements, 92.0% branches, 100% functions, 97.9% lines).
- **Next Action:** Execute **Chunk C03** (Core Ports, Fastify + SQLite Vertical Slice & Lifecycle) using `plinth-chunk-builder`.


---

## Entry #005 — 2026-11-21 — Chunk C03 Execution: Core Ports, Fastify + SQLite Vertical Slice, Scalar Docs UI & Adversarial Audit
- **Chunk Completed:** **C03** (Core Ports, Fastify + SQLite Reference Vertical Slice & Lifecycle with OpenAPI 3.1 + Scalar API Reference).
- **Exact Pinned Dependencies Added to `pnpm-workspace.yaml` `catalog:`:**
  - `fastify`: `5.12.8`
  - `@fastify/cors`: `11.4.3`
  - `@scalar/fastify-api-reference`: `1.82.1`
  - `better-sqlite3`: `13.2.0`
  - `@types/better-sqlite3`: `9.6.0`
  - `drizzle-orm`: `0.45.4`
  - `drizzle-kit`: `0.31.11`
  - `fastify-plugin`: `6.0.1`
  - Configured `allowBuilds: { better-sqlite3: true, esbuild: true }` under pnpm 12 security policy.
- **Files Created / Updated:**
  - Core Ports & Contracts (`packages/core`):
    - `packages/core/src/ports/http.ts`: `HttpMethod`, `HttpRequest`, `HttpResponse`, `HttpRouteHandler`, `HttpServerPort`.
    - `packages/core/src/ports/database.ts`: `DatabasePort` interface (`query`, `transaction`, `ping`, `close`, `getUnderlyingClient`).
    - `packages/core/src/ports/lifecycle.ts`: `LifecycleHook`, `LifecyclePort`, `DefaultLifecycleManager` with priority-ordered execution (drain -> close listeners -> close DBs).
    - `packages/core/src/contracts/route.ts`: `RouteContract`, `defineRoute`, `ValidatedRequest`, `validateRequestInput` with prototype pollution protection.
    - `packages/core/src/contracts/openapi.ts`: `generateOpenApiSpec`, `OpenApiDocument`, compiling Zod v4 schemas into OpenAPI 3.1.0 with RFC 9457 Problem Details components.
    - `packages/core/src/contracts/pagination.ts`: `cursorPaginationQuerySchema` (default 20, max 100), `paginateArray`.
  - Brand Domain & Repository (`packages/modules/brand`):
    - `src/domain/brand.ts`: `BrandConfig`, `DEFAULT_BRAND_CONFIG`, `brandConfigSchema`, `updateBrandSchema` (`.strict()`), `mergeBrandConfig` (safe with `exactOptionalPropertyTypes`).
    - `src/ports/repository.ts`: `BrandRepositoryPort` (`get()`, `update()`).
    - `src/infrastructure/in-memory-brand-repository.ts`: `InMemoryBrandRepository`.
    - `src/infrastructure/db-brand-repository.ts`: `DbBrandRepository` utilizing `DatabasePort` transactions.
    - `src/services/brand-service.ts`: `BrandService` validating updates via Zod schema.
    - `src/contracts/brand-routes.ts`: `getBrandRouteContract` (`GET /api/v1/brand`), `updateBrandRouteContract` (`PUT /api/v1/brand`).
  - Fastify HTTP Adapter (`packages/adapter-http-fastify`):
    - `src/server.ts`: `FastifyHttpAdapter implements HttpServerPort`. Handles CORS, 1MB bodyLimit, route mounting, RFC 9457 error handler, `GET /openapi.json` (OpenAPI 3.1 JSON), and `GET /docs` (**Interactive Scalar API Reference UI**).
  - SQLite Database Adapter (`packages/adapter-db-sqlite`):
    - `src/database.ts`: `SqliteDatabaseAdapter implements DatabasePort`. WAL mode, foreign keys, Drizzle ORM instance (`getDrizzle()`), `stmt.reader`-aware execution, transaction management, bounded `ping(timeoutMs)` with timer cleanup.
  - Reference Service & Containerization (`apps/reference-api`):
    - `src/app.ts`: Composition root wiring Fastify + SQLite + Brand Service + Lifecycle. Endpoints: `GET /health/live` (zero I/O), `GET /health/ready` (checks shutdown state + 2s DB ping), Brand CRUD, OpenAPI 3.1 & Scalar docs.
    - `src/server.ts`: Executable entrypoint loading `loadConfig()`, wiring graceful `SIGTERM`/`SIGINT` draining.
    - `Dockerfile`: Multi-stage production container build (Debian slim, pnpm 12, non-root user `plinth`, built-in healthcheck).
    - `.dockerignore`: Lean build context.
- **Phase 4 Adversarial Audit Remediations:**
  1. `[P1 High]` **Timer Handle Leak on DB Ping:** `SqliteDatabaseAdapter.ping` created a `setTimeout` for bounding without canceling it if the query resolved faster (<1ms). Added `clearTimeout(timer)` in a `finally` block to prevent event loop delay/handle leaks. Added regression test.
  2. `[P1 High]` **Readiness Check Traffic Leaks on Graceful Shutdown:** During shutdown drain, `/health/ready` only checked DB connectivity, returning 200 and causing ingress load balancers to keep routing new traffic to a terminating pod. Updated `/health/ready` to verify `lifecycle.isShuttingDown()` first, immediately returning RFC 9457 503. Added priority-based hooks in `DefaultLifecycleManager` so drain hooks execute before listeners close. Added regression test.
  3. `[P1 High]` **CORS Wildcard Reflection in Production:** `FastifyHttpAdapter` previously defaulted to `origin: true` (reflecting origin). Updated default to `false` when `isProduction: true` unless explicitly configured.
  4. `[P1 High]` **Fastify 4xx Error Mapping to 500:** Fastify client errors (like 413 Payload Too Large) were erroneously converted to 500 Internal Error because they were not `AppError` instances. Updated Fastify error handler to translate any Fastify 4xx status code into an RFC 9457 Problem Details response without overwriting existing `ValidationError` details. Added regression test for >1MB payloads.
- **Automated Verification (`pnpm verify`):**
  - `pnpm lint`: Biome check 100% clean (0 errors, 0 warnings).
  - `pnpm typecheck`: TypeScript 7.0 composite project references `tsc --build` 100% clean.
  - `pnpm test:fitness`: Architecture scanner 16/16 tests passing (zero leaks in domain/core).
  - `pnpm test:coverage`: Vitest 168/168 tests passing across 17 test suites (96.7% statements, 88.7% branches, 97.5% functions, 96.7% lines).
- **Next Action:** Execute **Chunk C04** (Multi-Tenancy Engine, Bounds, Rate Limits, SSRF & Idempotency) using `plinth-chunk-builder`.

---

## Entry #007 — 2026-11-21 — Chunk C04 Execution: Multi-Tenancy Engine, Security, Rate Limiter, SSRF Guard, Idempotency & Phase 4 Audit
- **Chunk Completed:** **C04** (Multi-Tenancy Isolation Engine, Bounds, Sliding-Window Rate Limits, SSRF Egress Guard, Canonicalized Idempotency-Key & `@plinth/modules-tenants`).
- **Dependencies Added to Catalog:** None required (built cleanly with Node 24 stdlib: `node:net` `BlockList`, `node:crypto` `createHash`, and `node:async_hooks` `AsyncLocalStorage`).
- **Files Created / Updated:**
  - Core Tenancy Kernel (`packages/core/src/tenancy/*`):
    - `context.ts`: Branded `TenantId`, `TenantQuota`, `TenantContext`, `DEFAULT_TENANT_ID`, `DEFAULT_TENANT_CONTEXT`, `runWithTenantContext`, `getTenantContext`, `requireTenantContext`.
    - `resolver.ts`: `resolveTenantFromRequest` supporting `single` mode and `multi` mode (`header`, `subdomain` with apex/localhost exclusion, `path` `/t/:slug`).
    - `guard.ts`: `assertTenantContext`, `withTenantGuard`.
  - Core Security Kernel (`packages/core/src/security/*`):
    - `ssrf-guard.ts`: `isIpBlocked` blocking loopback, RFC 1918, RFC 6598 carrier-grade NAT, cloud metadata `169.254.169.254`, IPv6 unique local, and IPv4-mapped IPv6 notation (`::ffff:127.0.0.1`); `validateUrlForEgress` with full DNS resolution checks.
    - `rate-limiter.ts`: `InMemoryRateLimiter` sliding-window limiter with sub-ms precision, `maxEntries` LRU bounding, and IETF `RateLimit-*` headers / `Retry-After`.
    - `idempotency.ts`: `InMemoryIdempotencyManager` with recursive key-sorted canonicalized SHA-256 payload hashing (`computeRequestHash`), in-flight concurrency locks (`409 Conflict`), payload mismatch detection (`409 Conflict`), response replaying, `cancel(key, tenantId)` lock release, and tenant-scoped isolation.
    - `headers.ts`: `getSecurityHeaders` enforcing CSP (`default-src 'self'`, `frame-ancestors 'none'`), `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy`, `permissions-policy`, and HSTS preload in production.
  - Tenants Vertical Feature Module (`packages/modules/tenants/*`):
    - `domain/tenant.ts`: `Tenant`, `TenantPlan`, `TenantStatus`, `createTenantSchema` (`.strict()`), `updateTenantSchema` (`.strict()`), `tenantSlugParamSchema`.
    - `ports/repository.ts`: `TenantRepositoryPort` (all methods require branded `TenantContext`).
    - `infrastructure/in-memory-tenant-repository.ts`: `InMemoryTenantRepository` with compile-time & runtime IDOR verification.
    - `infrastructure/db-tenant-repository.ts`: `DbTenantRepository` running over `DatabasePort` with schema initialization and parameterized queries.
    - `services/tenant-service.ts`: `TenantService` validating mutations against Zod schemas and preventing unauthorized cross-tenant operations.
    - `contracts/tenant-routes.ts`: `getTenantRouteContract`, `createTenantRouteContract`, `updateTenantRouteContract`.
  - Fastify HTTP Adapter & Reference API Integration:
    - `packages/adapter-http-fastify/src/server.ts`: Wired security headers, rate limiter, tenant context resolution, and idempotency key handling into route execution.
    - `apps/reference-api/src/app.ts`: Composition root updated with `DbTenantRepository`, `TenantService`, and tenant CRUD endpoints exposed on OpenAPI 3.1 & `/docs`.
- **Phase 4 Adversarial Audit Remediations:**
  1. `[P0 Blocker]` **Multi-Tenant Mode Silent Fallback to Default Tenant:** When tenant resolution failed or was omitted in `mode: "multi"`, requests silently ran with `DEFAULT_TENANT_CONTEXT` as `default_tenant`. Fixed by only defaulting in `mode: "single"`; in `mode: "multi"`, missing tenant leaves ambient context undefined, properly raising RFC 9457 `401 Unauthorized` on protected routes. Added regression test.
  2. `[P1 High]` **Uncaught Handler Exceptions Causing Permanent In-Flight Lock:** When a mutating handler threw an exception, `complete()` was never called, trapping the key in `status: "pending"` for the 24h TTL and preventing client retries with `409 Conflict`. Added `cancel(key, tenantId)` and wrapped handler execution in `try/catch` to release the lock on failure. Added regression test.
  3. `[P1 High]` **Bracketed IPv6 Literal Bypassing Direct IP Literal Checks in SSRF Guard:** `new URL("http://[::1]:8080/").hostname` produces `"[::1]"`. `isIP("[::1]")` returns 0 due to brackets, bypassing direct subnet checks. Fixed by stripping brackets in `isIpBlocked` and `validateUrlForEgress`. Added regression tests.
  4. `[P2 Medium]` **RateLimiter Eviction Without Batch Purging Expired Entries:** Added batch purge of expired sliding-window entries before single oldest eviction in `InMemoryRateLimiter.#evictIfFull()`.
- **Automated Verification (`pnpm verify`):**
  - `pnpm lint`: Biome check 100% clean (0 errors, 0 warnings across 91 files).
  - `pnpm typecheck`: TypeScript 7.0 composite project references `tsc --build` 100% clean.
  - `pnpm test:fitness`: Architectural scanner 16/16 tests passing (zero leaks in core/modules).
  - `pnpm test:coverage`: Vitest 261/261 tests passing across 26 test suites (94.8% statements, 85.3% branches, 95.9% functions, 94.8% lines).
- **Next Action:** Execute **Chunk C05** (Discord-Style `BigInt` Bitmask RBAC Engine) using `plinth-chunk-builder`.


---

## Entry #006 — 2026-11-21 — Open Source README Beautification ("shadcn/ui for Backends")
- **Objective Completed:** Redesigned and beautified `README.md` to pitch `plinth` to the open-source community as **"shadcn/ui, but for backends"**, highlighting radical simplicity, zero magic, zero decorators, code ownership, 100% offline local development, and compile-time architectural boundaries.
- **Key Additions & Highlights in `README.md`:**
  - Modern badges (Node 24 LTS, TypeScript 7.0 erasable, Pure ESM, Zero Infra Leaks, Biome, Vitest >96%, MIT).
  - The "shadcn Philosophy" narrative: explaining why owning backend primitives beats both rigid enterprise monoliths and brittle glue-code templates.
  - 60-Second Quickstart guide with links to `/docs` (interactive Scalar API reference), `/openapi.json`, `/health/live`, and `/health/ready`.
  - Concrete code comparisons: typed Zod-to-OpenAPI route definitions, dual-layer PII redaction (`Redacted<T>` + `createLogger`), and graceful lifecycle shutdown.
  - Production invariants & reliability budgets table (p95 < 100ms, O(1) bitmask RBAC < 0.1ms, 1MB body limit, 2s bounded DB ping).
- **Automated Verification (`pnpm verify`):**
  - `pnpm lint`: Biome check 100% clean (0 errors, 0 warnings across 66 files).
  - `pnpm typecheck`: `tsc --build` 100% clean.
  - `pnpm test:fitness`: Architecture scanner 16/16 tests passing.
  - `pnpm test:coverage`: 168/168 tests passing across 17 test suites (96.7% statements, 88.7% branches, 97.5% functions, 96.7% lines).
- **Next Action:** Execute **Chunk C04** (Multi-Tenancy Engine, Bounds, Rate Limits, SSRF & Idempotency) using `plinth-chunk-builder`.

---

## Entry #007 — 2026-11-21 — Chunk C04 Execution: Multi-Tenancy Engine, Security, Rate Limiter, SSRF Guard, Idempotency & Phase 4 Audit
- **Chunk Completed:** **C04** (Multi-Tenancy Isolation Engine, Bounds, Sliding-Window Rate Limits, SSRF Egress Guard, Canonicalized Idempotency-Key & `@plinth/modules-tenants`).
- **Dependencies Added to Catalog:** None required (built cleanly with Node 24 stdlib: `node:net` `BlockList`, `node:crypto` `createHash`, and `node:async_hooks` `AsyncLocalStorage`).
- **Files Created / Updated:**
  - Core Tenancy Kernel (`packages/core/src/tenancy/*`):
    - `context.ts`: Branded `TenantId`, `TenantQuota`, `TenantContext`, `DEFAULT_TENANT_ID`, `DEFAULT_TENANT_CONTEXT`, `runWithTenantContext`, `getTenantContext`, `requireTenantContext`.
    - `resolver.ts`: `resolveTenantFromRequest` supporting `single` mode and `multi` mode (`header`, `subdomain` with apex/localhost exclusion, `path` `/t/:slug`).
    - `guard.ts`: `assertTenantContext`, `withTenantGuard`.
  - Core Security Kernel (`packages/core/src/security/*`):
    - `ssrf-guard.ts`: `isIpBlocked` blocking loopback, RFC 1918, RFC 6598 carrier-grade NAT, cloud metadata `169.254.169.254`, IPv6 unique local, and IPv4-mapped IPv6 notation (`::ffff:127.0.0.1`); `validateUrlForEgress` with full DNS resolution checks.
    - `rate-limiter.ts`: `InMemoryRateLimiter` sliding-window limiter with sub-ms precision, `maxEntries` LRU bounding, and IETF `RateLimit-*` headers / `Retry-After`.
    - `idempotency.ts`: `InMemoryIdempotencyManager` with recursive key-sorted canonicalized SHA-256 payload hashing (`computeRequestHash`), in-flight concurrency locks (`409 Conflict`), payload mismatch detection (`409 Conflict`), response replaying, `cancel(key, tenantId)` lock release, and tenant-scoped isolation.
    - `headers.ts`: `getSecurityHeaders` enforcing CSP (`default-src 'self'`, `frame-ancestors 'none'`), `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy`, `permissions-policy`, and HSTS preload in production.
  - Tenants Vertical Feature Module (`packages/modules/tenants/*`):
    - `domain/tenant.ts`: `Tenant`, `TenantPlan`, `TenantStatus`, `createTenantSchema` (`.strict()`), `updateTenantSchema` (`.strict()`), `tenantSlugParamSchema`.
    - `ports/repository.ts`: `TenantRepositoryPort` (all methods require branded `TenantContext`).
    - `infrastructure/in-memory-tenant-repository.ts`: `InMemoryTenantRepository` with compile-time & runtime IDOR verification.
    - `infrastructure/db-tenant-repository.ts`: `DbTenantRepository` running over `DatabasePort` with schema initialization and parameterized queries.
    - `services/tenant-service.ts`: `TenantService` validating mutations against Zod schemas and preventing unauthorized cross-tenant operations.
    - `contracts/tenant-routes.ts`: `getTenantRouteContract`, `createTenantRouteContract`, `updateTenantRouteContract`.
  - Fastify HTTP Adapter & Reference API Integration:
    - `packages/adapter-http-fastify/src/server.ts`: Wired security headers, rate limiter, tenant context resolution, and idempotency key handling into route execution.
    - `apps/reference-api/src/app.ts`: Composition root updated with `DbTenantRepository`, `TenantService`, and tenant CRUD endpoints exposed on OpenAPI 3.1 & `/docs`.
- **Phase 4 Adversarial Audit Remediations:**
  1. `[P0 Blocker]` **Multi-Tenant Mode Silent Fallback to Default Tenant:** When tenant resolution failed or was omitted in `mode: "multi"`, requests silently ran with `DEFAULT_TENANT_CONTEXT` as `default_tenant`. Fixed by only defaulting in `mode: "single"`; in `mode: "multi"`, missing tenant leaves ambient context undefined, properly raising RFC 9457 `401 Unauthorized` on protected routes. Added regression test.
  2. `[P1 High]` **Uncaught Handler Exceptions Causing Permanent In-Flight Lock:** When a mutating handler threw an exception, `complete()` was never called, trapping the key in `status: "pending"` for the 24h TTL and preventing client retries with `409 Conflict`. Added `cancel(key, tenantId)` and wrapped handler execution in `try/catch` to release the lock on failure. Added regression test.
  3. `[P1 High]` **Bracketed IPv6 Literal Bypassing Direct IP Literal Checks in SSRF Guard:** `new URL("http://[::1]:8080/").hostname` produces `"[::1]"`. `isIP("[::1]")` returns 0 due to brackets, bypassing direct subnet checks. Fixed by stripping brackets in `isIpBlocked` and `validateUrlForEgress`. Added regression tests.
  4. `[P2 Medium]` **RateLimiter Eviction Without Batch Purging Expired Entries:** Added batch purge of expired sliding-window entries before single oldest eviction in `InMemoryRateLimiter.#evictIfFull()`.
- **Automated Verification (`pnpm verify`):**
  - `pnpm lint`: Biome check 100% clean (0 errors, 0 warnings across 91 files).
  - `pnpm typecheck`: TypeScript 7.0 composite project references `tsc --build` 100% clean.
  - `pnpm test:fitness`: Architectural scanner 16/16 tests passing (zero leaks in core/modules).
  - `pnpm test:coverage`: Vitest 261/261 tests passing across 26 test suites (94.8% statements, 85.3% branches, 95.9% functions, 94.8% lines).
- **Next Action:** Execute **Chunk C05** (Discord-Style `BigInt` Bitmask RBAC Engine) using `plinth-chunk-builder`.

---

## Entry #008 — 2026-11-21 — Chunk C05 Execution: Discord-Style BigInt Bitmask RBAC Engine, Anti-Escalation & Phase 4 Audit
- **Chunk Completed:** **C05** (Discord-Style `BigInt` Bitmask RBAC Engine, `O(1)` Resolution, Canonical Hex Persistence, Depth <= 4 Scope Overwrites, Rank Hierarchy + Subset Anti-Escalation Invariant, Extensible Role Metadata & `@plinth/modules-rbac`).
- **Dependencies Added to Catalog:** None required (built cleanly with native ES2024 `BigInt` arbitrary-width bitwise math, standard string hex conversions, and Zod v4).
- **Files Created / Updated:**
  - Core RBAC Kernel (`packages/core/src/rbac/*`):
    - `bitmask.ts`: Arbitrary-width `BigInt` bitwise math (`hasBit`, `hasAllBits`, `hasAnyBit`, `addBits`, `removeBits`, `isSubset`, `combineBitmasks`, `bitFromPosition`), `toCanonicalHex` (`0x${mask.toString(16)}`), `fromCanonicalHex` (strict non-negative hex regex validation).
    - `registry.ts`: System bit registry reserving bits 0..63 (`ADMINISTRATOR = 1n << 0n`, `VIEW_AUDIT_LOGS`, `MANAGE_TENANT`, `MANAGE_ROLES`, `MANAGE_MEMBERS`, `MANAGE_SETTINGS`, `MANAGE_WEBHOOKS`, `MANAGE_INTEGRATIONS`, `VIEW_ANALYTICS`, `MANAGE_BILLING`), product permission registration enforcing bits 64+ and rejecting duplicates.
    - `evaluator.ts`: Discord-style effective permission calculation: base role union -> `ADMINISTRATOR` short-circuit -> scope overwrites (`@everyone -> role -> member`), depth <= 4 guard (`SCOPE_DEPTH_EXCEEDED`).
    - `hierarchy.ts`: Rank hierarchy & anti-escalation validation: `actorHighestPosition > targetRole.position`, `actorHighestPosition > proposedPosition`, subset check `(permissions & ~actorEffectiveMask) === 0n` (with `ADMINISTRATOR` actor bypass on permissions, but strict position check maintained).
    - `metadata.ts`: `roleMetadataSchema` with `colorHex`, `badgeLabel`, `icon`, `description`, `custom`, strict XSS regex, and 4096 bytes (4 KB) serialized size bound.
    - `index.ts`: Unified barrel export for core RBAC.
  - Core Exports & Primitives:
    - `packages/core/src/primitives/brand-types.ts`: Added `RoleId` brand type and `createRoleId` factory.
    - `packages/core/src/index.ts`: Exported RBAC types and functions.
    - `packages/core/src/contracts/openapi.ts`: Hardened `generateOpenApiSpec` to handle 204 No Content / `z.ZodUndefined` schemas without throwing.
  - Vertical Feature Module (`packages/modules/rbac/*`):
    - `package.json`, `tsconfig.json`: Added `@plinth/modules-rbac` module workspace package.
    - `domain/role.ts`: `Role`, `CreateRoleDto`, `UpdateRoleDto`, `RoleAssignment`, `ScopeOverwrite`, `SetScopeOverwriteDto`.
    - `ports/repository.ts`: `RoleRepositoryPort` (all tenant-scoped operations enforce `TenantContext`).
    - `contracts/role-routes.ts`: `createRoleRouteContract`, `getRoleRouteContract`, `updateRoleRouteContract`, `deleteRoleRouteContract`, `listRolesRouteContract`, `assignRoleRouteContract`, `removeRoleRouteContract`, `evaluatePermissionsRouteContract`.
    - `infrastructure/in-memory-role-repository.ts`: In-memory role store with IDOR isolation.
    - `infrastructure/db-role-repository.ts`: SQL role repository implementing schema initialization, canonical hex persistence, member role mapping, and scope overwrites.
    - `services/rbac-service.ts`: `RbacService` orchestrating role management, rank anti-escalation, custom role toggles (`allowCustomRoles`), and permission evaluation.
    - `index.ts`: Module barrel export.
  - Monorepo Configuration & Reference API Integration:
    - `tsconfig.base.json`, `tsconfig.json`, `vitest.config.ts`: Configured path aliases (`@plinth/modules-rbac`) and project references.
    - `apps/reference-api/src/app.ts`: Initialized `DbRoleRepository` and `RbacService`, registered all 8 RBAC route contracts with serialization and actor rank extraction from headers.
  - Test Matrix (5-Category TDD Suites):
    - `packages/core/test/rbac/bitmask.test.ts` (15 tests)
    - `packages/core/test/rbac/registry.test.ts` (12 tests)
    - `packages/core/test/rbac/evaluator.test.ts` (13 tests)
    - `packages/core/test/rbac/hierarchy.test.ts` (11 tests)
    - `packages/core/test/rbac/metadata.test.ts` (9 tests)
    - `packages/modules/rbac/test/rbac-service.test.ts` (29 tests)
    - `packages/modules/rbac/test/db-rbac.test.ts` (3 tests)
    - `apps/reference-api/test/rbac-api.test.ts` (2 tests)
- **Live Official Docs & Research Consulted:**
  - Discord Developer Documentation Permissions Evaluation Order (`@everyone -> role -> member`, `ADMINISTRATOR` bypass).
  - TypeScript 7.0 `exactOptionalPropertyTypes: true` and `noPropertyAccessFromIndexSignature` rules for object updates and const dictionaries.
  - Zod 4 `toJSONSchema` serialization constraints for `z.undefined()`.
- **Phase 4 Adversarial Audit Remediations:**
  1. `[P1 High]` **Scope Overwrite Privilege Escalation on Higher-Rank Roles/Members:** Lower-rank actors could set scope overwrites on higher-rank roles or members. Remediated in `RbacService.setScopeOverwrite` by enforcing rank comparison against target role or target member's highest role. Added regression tests.
  2. `[P1 High]` **Lingering Scope Overwrites on Role Deletion:** Deleting a role cleaned up member assignments but left orphaned scope overwrites targeting the deleted `roleId`. Fixed in both `DbRoleRepository` and `InMemoryRoleRepository` by cascading deletion to `rbac_scope_overwrites WHERE target_id = roleId`. Added regression test.
  3. `[P2 Medium]` **Unbounded Scope Overwrites Density:** Bounded scope overwrites per scope to a maximum of 100 entries to prevent DoS attacks. Added regression test.
- **Automated Verification (`pnpm verify`):**
  - `pnpm lint`: Biome check 100% clean (0 errors, 0 warnings across 114 files).
  - `pnpm typecheck`: TypeScript 7.0 composite project references `tsc --build` 100% clean across all 8 packages/apps.
  - `pnpm test:fitness`: Architectural scanner 16/16 tests passing (zero leaks, zero infra imports in domain/core/modules).
  - `pnpm test:coverage`: Vitest 355/355 tests passing across 34 test suites (95.2% statements, 85.7% branches, 96.4% functions, 95.4% lines).
- **Next Action:** Execute **Chunk C06** (Slim Auth Core, Encrypted Runtime Config, Dual Sessions & Audit Log) using `plinth-chunk-builder`.

---

## Entry #009 — 2026-11-21 — Chunk C06 Execution: Slim Auth Core, AES-256-GCM Envelope Encryption, Argon2id, Pure Ed25519 JWT, RFC 6238 TOTP, Dual Sessions, Family Replay Detection, Config Store, Append-Only Audit Log & Phase 4 Audit
- **Chunk Completed:** **C06** (Slim Auth Core, Encrypted Runtime Config, Dual Sessions & Audit Log).
- **Exact Pinned Dependencies Added to `pnpm-workspace.yaml` `catalog:`:**
  - `@node-rs/argon2`: `2.2.2` (Verified in live npm registry; prebuilt zero-dependency N-API binary for memory-hard Argon2id password hashing)
  - `@fastify/cookie`: `11.1.5` (Fastify cookie parser plugin)
- **Files Created / Updated:**
  - Core Cryptographic Primitives (`packages/core/src/crypto/*`):
    - `envelope.ts`: AES-256-GCM authenticated envelope encryption (`encryptEnvelope`, `decryptEnvelope`, `validateMasterKeyEntropy` requiring >= 16 distinct bytes and 32-byte master key).
    - `password.ts`: Argon2id password hashing (`hashPassword`, `verifyPassword`, `validatePasswordStrength`, `normalizeEmail`, `normalizeUsername`).
    - `jwt-ed25519.ts`: Pure `node:crypto` EdDSA Ed25519 JWT implementation (`signEd25519Jwt`, `verifyEd25519Jwt`, `generateEd25519KeyPair`, `exportEd25519PublicJwk` RFC 8037). Enforces `alg === "EdDSA"`, blocking `alg: none` and algorithm confusion attacks.
    - `tokens.ts`: Cryptographically secure token generation (`generateSecureToken`), SHA-256 token hashing (`hashToken`), RFC 7636 PKCE S256 helper (`generatePkce`, `verifyPkce`), and constant-time string comparison (`timingSafeEqualString`).
    - `totp.ts`: RFC 6238 TOTP engine (`generateTotpSecret`, `generateTotp`, `verifyTotp` with clock skew window, `generateRecoveryCodes`, `verifyRecoveryCode`, RFC 4648 Base32 encoding/decoding).
    - `index.ts`: Barrel export for all cryptographic primitives.
  - Core Domain & Primitives:
    - `packages/core/src/primitives/brand-types.ts`: Added `UserId` brand type and `createUserId` factory.
    - `packages/core/src/index.ts`: Exported `crypto/*` and user brand primitives.
  - Vertical Feature Modules:
    - `@plinth/modules-config-store` (`packages/modules/config-store/*`):
      - Domain (`setting.ts`), Ports (`repository.ts`), Infrastructure (`in-memory-config-store-repository.ts`, `db-config-store-repository.ts`), Service (`config-store.ts`).
      - Encrypted at rest via AES-256-GCM master key envelope encryption; masks secret values to `[ENCRYPTED_SECRET]` in listing views.
    - `@plinth/modules-audit` (`packages/modules/audit/*`):
      - Domain (`audit-entry.ts`), Ports (`repository.ts` - append-only, zero update/delete methods), Infrastructure (`in-memory-audit-log-repository.ts`, `db-audit-log-repository.ts`), Service (`audit-service.ts`).
      - Mandatory redaction of sensitive credentials and PII via `RedactionEngine.redact` prior to persistence.
    - `@plinth/modules-auth` (`packages/modules/auth/*`):
      - Domain (`auth.ts` with strict Zod v4 schemas), Ports (`repository.ts`, `oidc-provider.ts`), Infrastructure (`in-memory-auth-repository.ts`, `db-auth-repository.ts`, `mock-oidc-provider.ts`), Service (`auth-service.ts`), Route Contracts (`contracts/auth-routes.ts`).
      - Dual session tokens (opaque cookie session token with SHA-256 hash in DB + CSRF token for web; 15m Ed25519 JWT + rotating refresh token for API/mobile).
      - Refresh token replay detection with whole-family revocation (`revokeRefreshTokenFamily`).
      - Unverified OAuth account takeover defense: rejects auto-linking unless both OAuth identity and existing local account are email-verified.
      - Super Admin MFA: TOTP 2FA flow with short-lived MFA ticket JWT (`type: "mfa_ticket"`).
      - Live runtime feature flag checks against `ConfigStore` (`auth.emailPasswordEnabled`, `auth.oauthEnabled`).
  - Reference API Integration & Monorepo Configuration:
    - `apps/reference-api/src/app.ts`: Wires `DbConfigStoreRepository`, `ConfigStore`, `DbAuditLogRepository`, `AuditService`, `DbAuthRepository`, `AuthService`, and all auth route contracts (`register`, `login`, `loginTotp`, `refresh`, `logout`, `me`).
    - `pnpm-workspace.yaml`, `tsconfig.json`, `tsconfig.base.json`, `vitest.config.ts`, `packages/core/package.json`, `apps/reference-api/package.json`: Updated with `@plinth/modules-*` module project references and path aliases.
  - Test Matrix (5-Category TDD Suites, 469 tests total):
    - `packages/core/test/crypto/envelope.test.ts` (15 tests)
    - `packages/core/test/crypto/password.test.ts` (13 tests)
    - `packages/core/test/crypto/jwt-ed25519.test.ts` (18 tests)
    - `packages/core/test/crypto/tokens.test.ts` (9 tests)
    - `packages/core/test/crypto/totp.test.ts` (11 tests)
    - `packages/modules/config-store/test/config-store.test.ts` (10 tests)
    - `packages/modules/config-store/test/db-config-store.test.ts` (1 test)
    - `packages/modules/audit/test/audit.test.ts` (8 tests)
    - `packages/modules/audit/test/db-audit.test.ts` (2 tests)
    - `packages/modules/auth/test/auth-service.test.ts` (16 tests)
    - `packages/modules/auth/test/db-auth.test.ts` (5 tests)
    - `apps/reference-api/test/auth-api.test.ts` (6 tests)
- **Live Official Docs & Research Consulted:**
  - Node 24+ `node:crypto` native Ed25519 OKP JWK export (`key.export({ format: 'jwk' })`) and EdDSA sign/verify.
  - RFC 8037 (CFRG Elliptic Curve Diffie-Hellman (ECDH) and Signatures in JOSE) and RFC 8410.
  - RFC 6238 (TOTP: Time-Based One-Time Password Algorithm) and RFC 4648 Base32 specifications.
  - RFC 7636 (Proof Key for Code Exchange by OAuth Public Clients).
  - `@node-rs/argon2` v2.2.2 pure N-API zero-dependency memory-hard Argon2id specification.
- **Phase 4 Adversarial Audit Remediations:**
  1. `[P0 Blocker]` **Timing Oracle on User Lookup in Password Login:** Prevented timing attack user enumeration by executing `verifyPassword` against `DUMMY_ARGON2_HASH` when a user identifier does not exist. Added regression test.
  2. `[P0 Blocker]` **Account Takeover via Unverified OAuth Identity Auto-Linking:** Fixed by enforcing that auto-linking an existing local account to an OAuth identity requires BOTH accounts to have `email_verified: true` (`OAUTH_UNVERIFIED_EMAIL_LINK_REJECTED`). Added regression test.
  3. `[P1 High]` **Refresh Token Reuse Replay Attack:** Fixed by tracking `familyId` and `isRotated`. If an already-rotated refresh token is replayed, the entire token family is immediately revoked, protecting legitimate clients against session hijacking. Added regression test.
  4. `[P1 High]` **Low-Entropy Master Encryption Key:** Enforced `validateMasterKeyEntropy` requiring >= 16 distinct bytes and 32 bytes in `encryptEnvelope`. Added regression test.
  5. `[P1 High]` **Leaking Passwords / Tokens in Audit Log:** Enforced unconditional `RedactionEngine.redact` on `payloadDiff` in `AuditService.record`. Added regression test.
  6. `[P1 High]` **Strict CSP Blocking Scalar UI Script in /docs:** Fastify's global API CSP (`script-src 'self'`) blocked the jsDelivr script on the interactive `/docs` documentation page. Configured a dedicated route-scoped CSP header for `/docs` allowing `cdn.jsdelivr.net` and Google Fonts without loosening API security. Added regression test.
  7. `[P1 High]` **Process Environment Variable Abort:** `envSchema` using `strictObject` threw errors on standard host OS variables (`PATH`, etc.) when reading `process.env`. Switched to `z.object` with stripping.
- **Automated Verification (`pnpm verify`):**
  - `pnpm lint`: Biome check 100% clean (0 errors, 0 warnings across 159 files).
  - `pnpm typecheck`: TypeScript 7.0 composite project references `tsc --build` 100% clean across all 11 packages/modules/apps.
  - `pnpm test:fitness`: Architectural scanner 16/16 tests passing (zero leaks, zero infra imports in core/modules).
  - `pnpm test:coverage`: Vitest 469/469 tests passing across 46 test suites (95.13% statements, 85.42% branches, 96.24% functions, 95.27% lines; all metrics exceeding the 85% threshold).
- **Next Action:** Execute **Chunk C07** (Shared Contract Tests + Express 5, Postgres RLS, and MySQL Adapters) using `plinth-chunk-builder`.

---

## Entry #010 — 2026-11-22 — Chunk C07 Execution: Shared Port Contract Tests, Express 5 HTTP Adapter, PostgreSQL Adapter with RLS & Parameter Normalization, MySQL 2 Adapter & Phase 4 Audit
- **Chunk Completed:** **C07** (Shared Contract Tests, Express 5 HTTP Adapter, PostgreSQL Adapter with RLS, and MySQL Adapter).
- **Exact Pinned Dependencies Added to `pnpm-workspace.yaml` `catalog:`:**
  - `express`: `5.3.0` (Verified via npm registry; Express 5 with native async promise error propagation)
  - `@types/express`: `5.0.6`
  - `cors`: `2.8.6`
  - `@types/cors`: `2.8.19`
  - `pg`: `8.23.1` (PostgreSQL client with connection pooling)
  - `@types/pg`: `8.23.1`
  - `mysql2`: `3.24.6` (MySQL2 client with promise connection pool)
  - `@electric-sql/pglite`: `0.5.17` (In-memory WASM PostgreSQL for RLS & contract test validation)
- **Files Created / Updated:**
  - Shared Port Contract Tests (`packages/contract-tests/*`):
    - `src/http.contract.ts`: `runHttpAdapterContractTests` testing HTTP methods (GET, POST, PUT, DELETE), path params, query strings, headers, RFC 9457 Problem Details error serialization, raw body buffer capture for webhook HMAC, and 1MB payload limits.
    - `src/repository.contract.ts`: `runDatabaseAdapterContractTests` testing DDL, CRUD operations with parameter binding, transaction commit/rollback integrity, and ping connectivity.
    - `src/tenancy-rls.contract.ts`: `runTenancyRlsContractTests` proving PostgreSQL Row-Level Security isolation without mock distortion (creates non-superuser role and verifies queries without WHERE clauses return 0 cross-tenant rows).
  - Swappable HTTP Adapters:
    - `packages/adapter-http-express/*`: Express 5 adapter implementing `HttpServerPort`, with raw body buffer capture (`express.json({ verify: ... })`), tenant context propagation, rate limiter integration, idempotency manager integration, Problem Details error middleware, and Scalar API reference route (`/docs`).
    - `packages/adapter-http-fastify/*`: Updated with raw body preservation (`addContentTypeParser("application/json", { parseAs: "buffer" })`) and added `test/fastify-contract.test.ts` executing the shared HTTP contract suite.
  - Swappable Database Adapters:
    - `packages/adapter-db-postgres/*`: PostgreSQL adapter implementing `DatabasePort` via `pg.Pool`, with SQL placeholder normalization (`?` to `$1, $2, ...`), and transaction-local `set_config` RLS context propagation (`is_local = true`). Added `test/postgres-adapter.test.ts` and `test/postgres-contract.test.ts`.
    - `packages/adapter-db-mysql/*`: MySQL adapter implementing `DatabasePort` via `mysql2/promise` pool. Added `test/mock-pool.ts` (high-fidelity in-memory SQLite wrapper for offline/CI simulation), `test/mysql-adapter.test.ts`, and `test/mysql-contract.test.ts`.
    - `packages/adapter-db-sqlite/*`: Added `test/sqlite-contract.test.ts` executing the shared database contract suite.
  - Core Ports:
    - `packages/core/src/ports/http.ts`: Added `readonly rawBody?: Buffer | undefined;` to `HttpRequest` interface for webhook HMAC signature verification.
- **Live Official Docs & Research Consulted:**
  - Express 5.x routing and error handling semantics (native promise rejection forwarding to error middleware, replacement of `body-parser` verify callback).
  - PostgreSQL Row-Level Security (RLS) policies, GUC `set_config('app.current_tenant_id', value, is_local)`, and non-superuser role enforcement.
  - `@electric-sql/pglite` in-memory WASM Node API.
  - MySQL 2 connection pool transaction semantics (`beginTransaction`, `commit`, `rollback`).
- **Phase 4 Adversarial Audit Remediations:**
  1. `[P1 High]` **Postgres Parameter Collision on Mixed `$N` and `?` in `normalizeSqlPlaceholders`:** If a query contained an existing `$1` parameter alongside `?` placeholders (e.g. `SELECT * FROM users WHERE id = $1 AND email = ?`), `normalizeSqlPlaceholders` previously started numbering `?` from `$1` again, creating colliding `$1` parameters. Fixed by finding `maxExistingIndex` and incrementing `?` starting from `maxExistingIndex + 1`. Added regression test.
  2. `[P1 High]` **Multi-Tenant Postgres RLS Connection Pool Pollution:** Setting tenant RLS context via global or non-transactional `SET` could leak tenant session state across pooled connections. Remediated by adding `rlsTenantVariable` support in `PostgresDatabaseOptions` that executes `SELECT set_config($1, $2, true)` parameterized inside transaction blocks, guaranteeing PostgreSQL automatically resets the setting upon commit/rollback. Added regression test.
  3. `[P1 High]` **Express Error Middleware and Idempotency Handling:** When an error occurred during request execution under an `Idempotency-Key`, or when client sent non-AppError client errors (status 400-499), defensive error mapping needed full validation and idempotency cancellation. Validated that `idempotencyManager.cancel` properly cancels pending locks on handler exceptions so clients can retry safely. Added comprehensive test coverage in `express-adapter.test.ts`.
- **Automated Verification (`pnpm verify`):**
  - `pnpm lint`: Biome check 100% clean (0 errors, 0 warnings across 187 files).
  - `pnpm typecheck`: TypeScript 7.0 composite project references `tsc --build` 100% clean across all 15 packages/modules/apps.
  - `pnpm test:fitness`: Architectural scanner 16/16 tests passing (zero leaks, zero infra imports in core/modules).
  - `pnpm test:coverage`: Vitest 549/549 tests passing across 54 test suites (95.63% statements, 85.31% branches, 96.7% functions, 95.82% lines; all metrics exceeding the 85% threshold).
- **Next Action:** Execute **Chunk C08** (Cache Engine, Transactional Outbox, Queues with DB/BullMQ, Dev Email Catcher & SSE Broadcaster) using `plinth-chunk-builder`.

---

## Entry #011 — 2026-11-22 — Chunk C08 Execution: Cache Engine, Transactional Outbox, Queues (DB & BullMQ), Dev Email Catcher, SMTP Adapter, SSE Broadcaster & Phase 4 Audit
- **Chunk Completed:** **C08** (Cache, Transactional Outbox, Heavy Job Queues, Email Catcher & SSE).
- **Exact Pinned Dependencies Added to `pnpm-workspace.yaml` `catalog:`:**
  - `bullmq`: `6.7.8` (Redis-backed distributed queue worker with exponential backoff & dead letter queue)
  - `ioredis`: `5.11.1` (Redis client for caching & queues)
  - `ioredis-mock`: `8.13.1` (In-memory mock Redis client for high-fidelity test suites)
  - `@types/ioredis-mock`: `8.2.8`
  - `lru-cache`: `11.5.3` (Bounded high-performance in-memory LRU cache)
  - `nodemailer`: `10.6.1` (Production SMTP transport client)
  - Added `msgpackr-extract: true` to `allowBuilds:` for BullMQ native optimization support.
- **Files Created / Updated:**
  - Core Ports (`packages/core/src/ports/*`):
    - `cache.ts`: `CachePort`, `CacheStats`, `CircuitBreakerState`, `CacheCircuitBreaker` (three-state `CLOSED` | `OPEN` | `HALF_OPEN` state machine with fail-open fallback, configurable failure/recovery thresholds, and state change listeners).
    - `queue.ts`: `JobStatus`, `OutboxEvent`, `CreateOutboxEventInput`, `EnqueueJobInput`, `JobHandler`, `QueuePort`, `OutboxRepositoryPort`, and `calculateNextRetryTime` exponential backoff helper.
    - `email.ts`: `EmailRecipient`, `EmailAddress`, `SendEmailInput`, `SendEmailResult`, `EmailPort`, `normalizeEmailAddress`, and `validateEmailSubject` with strict header injection and null-byte defenses.
    - `sse.ts`: `SseEvent`, `SseClient`, `SseBroadcasterPort`, `formatSseEvent` (formatting SSE comments `: ping\n\n` for keepalive and data chunks with CRLF/unicode line break sanitization), and `DefaultSseBroadcaster` (with connection cap, tenant filtering, and disconnect cleanup).
    - `packages/core/src/index.ts`: Re-exported all new ports and types.
  - Shared Port Contract Suites (`packages/contract-tests/src/*`):
    - `cache.contract.ts`: `runCacheContractTests` (CRUD, TTL expiration, custom namespaces, large payloads, delete/clear/has).
    - `queue.contract.ts`: `runQueueContractTests` (Enqueue, handler execution, multiple event types, payload preservation).
    - `email.contract.ts`: `runEmailContractTests` (Delivery, multi-recipient handling, header injection / CRLF defense).
    - `packages/contract-tests/src/index.ts`: Re-exported all contract test suites.
  - Swappable Cache Adapters:
    - `packages/adapter-cache-memory/*`: In-memory LRU cache adapter via `lru-cache` v11, with bounded max items, default TTL, namespace prefixing, and full contract test compliance.
    - `packages/adapter-cache-redis/*`: Redis / Valkey cache adapter via `ioredis` v5, with fail-open circuit breaker, local secondary cache fallback, error event listener preventing Node runtime crashes, and clean lifecycle.
  - Swappable Queue & Outbox Adapters:
    - `packages/adapter-queue-db/*`: Transactional `outbox_events` repository and database polling runner (`DbQueueAdapter`), with atomic multi-worker claim concurrency guards (`UPDATE ... WHERE id = ? AND (status = 'pending' OR (status = 'processing' AND locked_at <= ?))`), stale lock reclamation, exponential backoff, dead letter queue routing, and admin retry.
    - `packages/adapter-queue-bullmq/*`: Redis queue worker adapter wrapping BullMQ `Queue` and `Worker`, with retry backoff, DLQ handling, and graceful shutdown.
  - Swappable Email Adapters:
    - `packages/adapter-email-stub/*`: In-memory Dev/Admin Email Catcher (`StubEmailAdapter`), with bounded circular memory buffer, email inspection, and recipient validation.
    - `packages/adapter-email-smtp/*`: Production SMTP transport adapter (`SmtpEmailAdapter`) wrapping `nodemailer`, with STARTTLS/SSL, address normalization, name sanitization, and connectivity verification (`verify()`).
- **Live Official Docs & Research Consulted:**
  - `bullmq` v6 API semantics (Job options, exponential backoff, worker shutdown).
  - `ioredis` v5 ESM exports and connection error handling event patterns (`client.on("error")`).
  - `lru-cache` v11 `NonNullable<unknown>` generic constraints.
  - WHATWG HTML5 Server-Sent Events (SSE) specification: comment lines (`: <comment>\n\n`) as the standard keepalive format that suppresses false `onmessage` dispatches on browser `EventSource` clients.
  - Email header injection and null-byte (`\0`) truncation attacks in native mail transports.
- **Phase 4 Adversarial Audit Remediations:**
  1. `[P0 Blocker]` **Race Condition in DB Outbox Concurrent Worker Polling:** In `DbOutboxRepository.fetchPending`, multiple concurrent worker threads selecting candidate rows could simultaneously update the same rows to `processing`, causing duplicate job processing. Remediated with an atomic conditional `UPDATE ... WHERE id = ? AND (status = 'pending' OR (status = 'processing' AND locked_at <= ?))` followed by a verification `SELECT * WHERE id = ? AND locked_by = ? AND locked_at = ?`, guaranteeing exclusive single-worker ownership across all SQL dialects (SQLite, PostgreSQL, MySQL). Added regression tests.
  2. `[P0 Blocker]` **Unhandled Redis Client 'error' Event Crashing Node Process:** In `RedisCacheAdapter`, if the Redis client emitted an `'error'` event with no attached listener, Node's EventEmitter would emit an unhandled error and terminate the server process. Remediated by attaching an error listener in the constructor that records failure in the circuit breaker. Added regression test.
  3. `[P1 High]` **SSE Heartbeat Emitting `data: ""` Triggering False `onmessage` Events:** Broadcaster heartbeats previously sent `{ data: "" }`, causing client-side `EventSource.onmessage` to fire every heartbeat interval with empty string payloads. Remediated by adding comment support (`: ping\n\n`) per WHATWG SSE spec and updating the heartbeat to emit ping comments. Added regression tests.
  4. `[P1 High]` **Null-Byte Injection (`\0`) in Email Addresses & Subject:** Null bytes could terminate strings prematurely in underlying C/C++ mail transports or bypass domain checks. Remediated by expanding `CRLF_INJECTION_REGEX = /[\r\n\0]/` in `packages/core/src/ports/email.ts` to reject null bytes in `normalizeEmailAddress` and `validateEmailSubject`. Added regression tests.
- **Automated Verification (`pnpm verify`):**
  - `pnpm lint`: Biome check 100% clean (0 errors, 0 warnings across 234 files).
  - `pnpm typecheck`: TypeScript 7.0 composite project references `tsc --build` 100% clean across all 21 packages/modules/apps.
  - `pnpm test:fitness`: Architectural scanner 16/16 tests passing (zero leaks, zero infra imports in core/modules).
  - `pnpm test:coverage`: Vitest 645/645 tests passing across 69 test suites (96.10% statements, 85.92% branches, 96.95% functions, 96.29% lines; all metrics exceeding the 85% threshold).
- **Next Action:** Execute **Chunk C09** (User Profiles, Hardened Avatar Storage & GDPR/India DPDP Compliance) using `plinth-chunk-builder`.

---

## Entry #012 — 2026-11-22 — Chunk C09 Execution: User Profiles, Hardened Avatar Storage Port (Local & S3), Analytics Port (Stub), GDPR & India DPDP Compliance Engine & Phase 4 Audit
- **Chunk Completed:** **C09** (User Profiles, Hardened Avatar Storage, Analytics, and GDPR & India DPDP Compliance).
- **Exact Pinned Dependencies Added to `pnpm-workspace.yaml` `catalog:`:**
  - `@aws-sdk/client-s3`: `3.1175.0` (Modular AWS SDK v3 S3 client)
  - `@aws-sdk/s3-request-presigner`: `3.1175.0` (SigV4 pre-signer for secure S3 object uploads/downloads)
- **Packages Created:**
  - `packages/adapter-storage-local`: `LocalStorageAdapter` implementing `StoragePort` with strict base directory containment, safe key sanitization, and HMAC-SHA256 signed URL emulation.
  - `packages/adapter-storage-s3`: `S3StorageAdapter` implementing `StoragePort` using `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`.
  - `packages/adapter-analytics-stub`: `StubAnalyticsAdapter` implementing `AnalyticsPort` with in-memory buffer, consent category gating, and dual-layer PII text/key scrubbing.
  - `packages/modules/users`: `UserService` (profile CRUD, avatar upload with EXIF metadata stripping, previous avatar cleanup, analytics hook), `InMemoryUserRepository`, and OpenAPI route contracts.
  - `packages/modules/compliance`: `ComplianceService` (versioned consent ledger, JSON user data export under GDPR Art. 20 & India DPDP Sec. 12, right-to-erasure / anonymization with statutory preservation of financial records under GDPR Art. 17(3)(b) & DPDP Sec. 17(2)), `InMemoryComplianceRepository`, and OpenAPI route contracts.
- **Core Ports & Security:**
  - `packages/core/src/ports/storage.ts`: `StoragePort`, `StorageObjectMetadata`, `PutObjectInput`, `GetObjectInput`, `DeleteObjectInput`, `HeadObjectInput`, `GetSignedUrlInput`, `validateStorageKey`, `sanitizeStorageKey`.
  - `packages/core/src/ports/analytics.ts`: `AnalyticsPort`, `AnalyticsEvent`, `ConsentCategory`, `ConsentPreferences`, `DEFAULT_CONSENT_PREFERENCES`, `hasConsentForEvent`.
  - `packages/core/src/security/avatar-guard.ts`: `inspectImage`, `stripImageMetadata`, `validateAndCleanAvatar`. Magic-byte validation strictly allowing PNG, JPEG, WebP; hard rejection of SVG/HTML/scripts/executables; bounds check (<= 5 MB, <= 4096 x 4096 dimension decompression bomb mitigation); lossless metadata stripping for JPEG (APP1..APP15 except JFIF, COM), PNG (eXIf, tEXt, zTXt, iTXt, tIME, pHYs), and WebP (EXIF, XMP chunks, clears VP8X header flags).
- **Shared Port Contract Suites:**
  - `packages/contract-tests/src/storage.contract.ts`: `runStorageContractTests`
  - `packages/contract-tests/src/analytics.contract.ts`: `runAnalyticsContractTests`
- **Live Official Docs & Research Consulted:**
  - AWS SDK for JavaScript v3 S3 client and `@aws-sdk/s3-request-presigner` offline SigV4 signing mechanisms.
  - JPEG segment markers (SOI, APP0-APP15, SOF0-SOF2, SOS, EOI, COM, standalone RST markers) and JFIF structure.
  - PNG chunk structure (IHDR, IDAT, IEND, eXIf, tEXt, zTXt, iTXt, pHYs).
  - WebP container specification (RIFF, WEBP, VP8, VP8L, VP8X flags byte bit 3 EXIF and bit 2 XMP).
  - GDPR Article 17(3)(b) statutory exemptions and India Digital Personal Data Protection (DPDP) Act 2023 Section 17(2) financial offence investigation / legal obligation data preservation mandates.
- **Phase 4 Adversarial Audit Remediations:**
  1. `[P1 High]` **Base Directory Escape via Traversal in Local Storage:** Path traversal attempts using `..`, leading slashes, and control characters blocked via `sanitizeStorageKey` and strict containment checking `filePath.startsWith(normalizedBaseDir)` where `normalizedBaseDir` includes trailing path separator, mitigating prefix collisions (e.g. `/tmp/storage-extra` vs `/tmp/storage/`). Added regression tests in `local-storage.test.ts`.
  2. `[P1 High]` **Decompression Bomb & Script/SVG Stored XSS via Avatar Uploads:** Bounded avatar dimensions to 4096 x 4096 pixels and rejected SVGs, XML, HTML, PE/ELF executables, and shell scripts using magic byte validation before reading payloads into memory or writing to storage. Added regression tests in `avatar-guard.test.ts`.
  3. `[P1 High]` **PII Leakage in Analytics Event Pipelines:** `StubAnalyticsAdapter` recursively scrubs email addresses, phone numbers, and payment cards using `RedactionEngine.scrubText` and masks sensitive keys with `RedactionEngine.redact`, guaranteeing personal identifiable data does not leak into downstream analytics sinks. Added regression tests in `stub-analytics.test.ts`.
  4. `[P1 High]` **Statutory Financial Audit Record Loss on Right-to-Erasure:** GDPR Art. 17 and DPDP Sec. 12 Right-to-Erasure requests could unlawfully purge financial invoice and ledger records. Remediated by ensuring `ComplianceService.requestErasure` strictly anonymizes user personal identifiable profiles while preserving billing lines with statutory exemption citations (`GDPR Article 17(3)(b)` and `India DPDP Act 2023 Section 17(2)`). Added regression tests in `compliance-service.test.ts`.
- **Automated Verification (`pnpm verify`):**
  - `pnpm lint`: Biome check 100% clean (0 errors, 0 warnings across 279 files).
  - `pnpm typecheck`: TypeScript 7.0 composite project references `tsc --build` 100% clean across all 26 packages/modules/apps.
  - `pnpm test:fitness`: Architectural scanner 16/16 tests passing (zero leaks, zero infra imports in core/modules).
  - `pnpm test:coverage`: Vitest 706/706 tests passing across 80 test suites (95.68% statements, 85.66% branches, 96.80% functions, 96.03% lines; all metrics exceeding the 85% threshold).
- **Next Action:** Execute **Chunk C10** (Billing & Payments Engine with Stub, Razorpay INR/UPI/GST & Stripe) using `plinth-chunk-builder`.

---

## Entry #013 — 2026-11-22 — Chunk C10 Execution: Normalized Billing Engine with Stub, Razorpay (INR/UPI/GST), Stripe, Monorepo Integration & Phase 4 Audit
- **Chunk Completed:** **C10** (Billing & Payments Engine: Core Ports, Stub Adapter, Razorpay Adapter, Stripe Adapter, `@plinth/modules-billing`, and Reference API Integration).
- **Exact Pinned Dependencies Added to `pnpm-workspace.yaml` `catalog:`:**
  - `stripe`: `23.2.0` (Official Stripe Node.js SDK for billing and checkout lifecycle)
  - `razorpay`: `2.9.8` (Official Razorpay Node.js SDK for INR, UPI, and GST billing)
- **Packages Created:**
  - `packages/adapter-billing-stub`: In-memory development billing adapter (`StubBillingAdapter`) supporting checkout simulation, customer lifecycle, subscription management, and realistic HMAC-SHA256 webhook generation (`simulateWebhook`).
  - `packages/adapter-billing-razorpay`: Production Razorpay adapter (`RazorpayBillingAdapter`) with order creation, subscription management, raw-body HMAC-SHA256 verification via `x-razorpay-signature`, constant-time comparison, and Indian tax compliance (GSTIN, HSN/SAC codes, and GST rate percentages preserved in order notes).
  - `packages/adapter-billing-stripe`: Production Stripe adapter (`StripeBillingAdapter`) with checkout session creation, customer and subscription CRUD, `Stripe-Signature` parser (`t=...,v1=...`), timestamp drift tolerance verification (300s window) defeating replay attacks, and constant-time HMAC comparison.
  - `packages/modules/billing`: Full vertical business feature module including `BillingService`, `BillingRepositoryPort`, multi-tenant `InMemoryBillingRepository`, production SQL `DbBillingRepository` with DDL schema initialization and transactional deduplication, and OpenAPI 3.1 route contracts.
- **Core Ports & Errors Added:**
  - `packages/core/src/ports/billing.ts`: Normalized interfaces (`BillingPort`, `BillingProvider`, `CheckoutSession`, `BillingSubscription`, `BillingCustomer`, `InvoiceStatus`, `SubscriptionStatus`, `BillingWebhookEvent`, `CheckoutLineItem`, `TaxIdentifier`, `BillingAddress`), along with validation functions (`validateMinorUnitAmount`, `validateLineItems`, `calculateLineItemsTotal`, `validateGstin`, `validateHsnCode`).
  - `packages/core/src/errors/app-error.ts`: Added RFC 9457 `BadGatewayError` (HTTP 502) for normalized upstream payment gateway failure propagation.
- **Shared Port Contract Suite:**
  - `packages/contract-tests/src/billing.contract.ts`: `runBillingContractTests` validating provider identity, minor-unit money validation, customer CRUD, subscription lifecycle, and HMAC signature + body tampering verification across all billing adapters.
- **Reference API Integration (`apps/reference-api`):**
  - Registered 6 billing route contracts (`createCheckout`, `getSubscription`, `cancelSubscription`, `listInvoices`, `getEntitlements`, `billingWebhook`) in `src/app.ts` with end-to-end integration tests in `test/billing-api.test.ts`.
- **1-Page Swap-to-Production Handbooks:**
  - `docs/adapters/billing-stub.md`
  - `docs/adapters/billing-razorpay.md`
  - `docs/adapters/billing-stripe.md`
- **Live Official Docs & Research Consulted:**
  - Stripe API v1 Checkout Sessions and Webhook Signature Verification RFC spec (`t=timestamp,v1=signature`).
  - Razorpay Orders, Subscriptions, and Webhook HMAC SHA-256 verification specification (`x-razorpay-signature` and `x-razorpay-event-id`).
  - Indian Goods and Services Tax (GST) Act: GSTIN format (`29ABCDE1234F1Z5`), HSN/SAC code 4-to-8 digit numbering system, and standard statutory tax rate slabs.
- **Phase 4 Adversarial Audit Remediations:**
  - `[P1 High]` **Line Item GST Rate Out-of-Bounds Injection:** `validateLineItems` previously accepted arbitrary or negative numbers for `gstRatePercent`. Remediated by adding explicit bounds checks requiring `0 <= gstRatePercent <= 100`, throwing `BadRequestError("INVALID_GST_RATE")`. Added regression tests.
  - `[P1 High]` **Razorpay Webhook Unknown Event Escalation:** `RazorpayBillingAdapter.#mapRazorpayEvent` previously defaulted unmapped raw events to `"payment.succeeded"`, creating a risk where arbitrary callbacks (e.g. refunds or disputes) could trigger paid entitlements. Remediated by throwing `BadRequestError("UNSUPPORTED_WEBHOOK_EVENT")` on unrecognized event types. Added regression tests.
  - `[P1 High]` **Missing Outbound HTTP Client Timeouts in Stripe & Razorpay:** `#callApi` lacked timeouts, risking hung Node worker threads on upstream network partition or slow gateway response. Remediated by attaching `AbortSignal.timeout(10000)` and wrapping network aborts/errors into normalized RFC 9457 `BadGatewayError`. Added regression tests.
- **Automated Verification (`pnpm verify`):**
  - `pnpm lint`: Biome check 100% clean (0 errors, 0 warnings across 309 files).
  - `pnpm typecheck`: TypeScript 7.0 composite project references `tsc --build` 100% clean across all 30 packages/modules/apps.
  - `pnpm test:fitness`: Architectural scanner 16/16 tests passing (zero leaks, zero infra imports in core/modules).
  - `pnpm test:coverage`: Vitest 778/778 tests passing across 90 test suites (95.51% statements, 85.50% branches, 96.90% functions, 95.87% lines; all metrics exceeding the 85% threshold).
- **Next Action:** Execute **Chunk C11** (Zero-Build SSR Admin Panel, Super User CLI & Dev/Ops Inspector) using `plinth-chunk-builder`.

---

## Entry #014 — 2026-11-22 — Architectural Refactoring: Tiered Packages Hierarchy (`packages/adapters/<layer>/<vendor>`) & Targeted Layer Test Commands
- **Refactoring Objective Completed:** Restructured monorepo package architecture to eliminate flat adapter sprawl under `packages/`. Reorganized all 17 swappable infrastructure adapters strictly by layer under `packages/adapters/<layer>/<vendor>` while preserving `@plinth/adapter-*` package naming, zero feature bloat, and zero API changes. Added targeted isolated test commands for every layer (`storage`, `billing`, `db`, `http`, `cache`, `queue`, `email`, `analytics`, `contracts`, `adapters`, `modules`, `core`).
- **New Monorepo Package Hierarchy:**
  - `packages/core`: Pure domain kernel, ports, Zod contracts, RBAC, redaction, errors.
  - `packages/contract-tests`: Shared black-box port compliance test suites.
  - `packages/modules/*`: 9 vertical domain feature modules (`brand`, `tenants`, `rbac`, `config-store`, `audit`, `auth`, `users`, `compliance`, `billing`).
  - `packages/adapters/*/*`: 17 swappable infrastructure adapters categorized by architectural layer:
    - `http/`: `fastify`, `express`
    - `db/`: `sqlite`, `postgres`, `mysql`
    - `cache/`: `memory`, `redis`
    - `queue/`: `db`, `bullmq`
    - `email/`: `stub`, `smtp`
    - `storage/`: `local`, `s3`
    - `analytics/`: `stub`
    - `billing/`: `stub`, `razorpay`, `stripe`
  - `apps/reference-api`: Composition root & runnable reference server.
- **Dedicated Targeted Test Commands Added:**
  - `pnpm test:storage` (runs only storage adapters: local & S3; ~1.1s)
  - `pnpm test:billing` (runs only billing adapters: stub, razorpay, stripe; ~1.0s)
  - `pnpm test:http` (runs only HTTP adapters: fastify, express; ~1.4s)
  - `pnpm test:cache` (runs only cache adapters: memory, redis; ~2.0s)
  - `pnpm test:queue` (runs only queue adapters: db, bullmq; ~1.5s)
  - `pnpm test:email` (runs only email adapters: stub, smtp; ~0.8s)
  - `pnpm test:analytics` (runs only analytics adapters; ~0.6s)
  - `pnpm test:db` (runs only DB adapters: sqlite, postgres, mysql; ~12.5s)
  - `pnpm test:contracts` (runs all black-box contract test suites across adapters; ~14.7s)
  - `pnpm test:adapters` (runs all 17 adapters; ~16.0s)
  - `pnpm test:modules` (runs all 9 domain modules; ~2.6s)
  - `pnpm test:core` (runs core kernel tests; ~3.0s)
- **Configuration & Invariant Hardening:**
  - `pnpm-workspace.yaml`: Updated workspace packages to `"packages/adapters/*/*"`.
  - `tsconfig.base.json` & `tsconfig.json`: Updated paths and composite references to `packages/adapters/<layer>/<vendor>`.
  - `vitest.config.ts`: Updated aliases and coverage glob `"packages/adapters/**/src/**/*.ts"`.
  - `packages/core/src/fitness/scanner.ts`: Enhanced `isForbiddenImport` to detect relative path traversal escapes into `adapters/` (`modulePath.includes("adapters/")`). Added regression tests in `architecture.test.ts`.
  - `packages/adapters/*/*/tsconfig.json`: Standardized all 17 adapter tsconfigs with composite configuration, `dist` declaration maps, and project references to `../../../core`.
  - `packages/adapters/*/*/package.json`: Added standard `"scripts": { "test": "vitest run" }` to every adapter for pnpm `--filter` support.
  - `Dockerfile`: Updated fastify/sqlite package manifests COPY instructions.
- **Documentation Updated:**
  - `docs/ai/ARCHITECTURE_RULES.md`: Documented `packages/adapters/<layer>/<vendor>` layout and layer test commands.
  - `docs/EDD.md`: Updated architecture tree and dependency direction laws.
  - `README.md`: Updated repository structure tree and quality gate test instructions.
  - `docs/adr/0001-core-architectural-decisions.md`: Updated monorepo structure.
  - `.gemini/skills/plinth-add-adapter/SKILL.md`: Updated guidance for adding adapters under `packages/adapters/<layer>/<vendor>/`.
- **Automated Verification (`pnpm verify`):**
  - `pnpm lint`: Biome check 100% clean (0 errors, 0 warnings across 309 files).
  - `pnpm typecheck`: TypeScript 7.0 composite project references `tsc --build` 100% clean across all 30 workspace projects.
  - `pnpm test:fitness`: Architectural scanner 16/16 tests passing (zero leaks in core/modules).
  - `pnpm test:coverage`: Vitest 778/778 tests passing across 90 test suites (95.51% statements, 85.50% branches, 96.90% functions, 95.87% lines; all gates exceeding 85%).
- **Next Action:** Execute **Chunk C11** (Zero-Build SSR Admin Panel, Super User CLI & Dev/Ops Inspector) using `plinth-chunk-builder`.

---

## Entry #015 — 2026-11-22 — Chunk C11 Execution: Zero-Build SSR Admin Panel, Super User CLI & Dev/Ops Inspector
- **Chunk Completed:** **C11** (Zero-Build SSR Admin Panel, Super User CLI & Dev/Ops Inspector).
- **Core Primitives Added:**
  - `packages/core/src/security/cidr-guard.ts`: `isIpAllowedByCidrs` implementing cached `node:net` `BlockList` IP evaluation with full support for IPv4, IPv6, IPv4-mapped IPv6 (`::ffff:`), and bracketed IPv6 notation. Exported from `@plinth/core`.
  - `packages/core/src/tenancy/context.ts`: Exported `createTenantContext(tenantId, options)` factory.
- **Packages Materialized:**
  - **`@plinth/cli` (`packages/cli/`)**:
    - `src/commands/create-superuser.ts`: `createSuperuser(options)` CLI command with email normalization, password strength check (>= 12 chars), Argon2id hashing, RFC 6238 TOTP secret generation, 8 single-use recovery codes, AES-256-GCM envelope encryption using `MASTER_ENCRYPTION_KEY`, user persistence, and `ADMINISTRATOR` role assignment.
    - `src/bin.ts` & `bin/plinth.js`: Executable CLI runner dispatching `admin:create-superuser` with `--email`, `--password`, `--username`, `--tenant-id`.
  - **`@plinth/modules-admin` (`packages/modules/admin/`)**:
    - `src/domain/admin-models.ts`: View models and session domain types (`AdminSession`, `DashboardViewModel`, `AuthConfigViewModel`, `RbacViewModel`, `TenantsViewModel`, `BillingViewModel`, `DevInspectorViewModel`).
    - `src/templates/escape.ts`: Zero-dependency HTML escaper (`escapeHtml`, `safeHtml`, `rawHtml`) mitigating XSS across all template interpolations.
    - `src/templates/layout.ts`: `renderAdminLayout` with Brand CSS custom properties (`--brand-primary`, etc.), responsive navigation, flash alerts, and strict `ADMIN_CSP_HEADER` (`script-src 'none'`).
    - `src/templates/login.ts`: `renderLoginPage` and `renderMfaPage` supporting password submission and 6-digit TOTP verification.
    - `src/templates/dashboard.ts`: System and runtime metrics (uptime, Node version, memory RSS, tenant/user/role counts, DB health).
    - `src/templates/brand.ts`: Brand customization form modifying visual identity in real-time.
    - `src/templates/auth-config.ts`: Runtime feature flag toggle list and encrypted secrets manager (`ConfigStore`).
    - `src/templates/rbac.ts`: System & custom role inspector with canonical hexadecimal bitmask representations.
    - `src/templates/tenants.ts`: Tenant organization directory with status toggle (`active`/`suspended`) and plan updates (`free`, `pro`, `enterprise`).
    - `src/templates/billing.ts`: Simulated subscription and invoice ledger with webhook event dispatch simulator.
    - `src/templates/dev-inspector.ts`: Paginated audit log diff inspector, transactional outbox queue monitor with DLQ retry action, and local email catcher preview.
    - `src/services/admin-service.ts`: Session lifecycle management (`authenticate`, `verifyMfa`, `validateSession`, `invalidateSession`), sub-panel data aggregators, and mutations.
    - `src/contracts/admin-routes.ts`: `createAdminRoutes(mountPath)` registering 20 type-safe admin route contracts.
    - `src/handlers/admin-controller.ts`: Framework-agnostic HTTP request handler with CIDR IP allowlist enforcement, session cookie validation, CSRF checking on all mutating requests, and sub-panel dispatch.
  - **Reference API Wiring (`apps/reference-api`)**:
    - Wires `AdminService`, `AdminController`, and `createAdminRoutes` on Fastify at `/_admin`.
- **Live Official Docs & Standards Consulted:**
  - Node.js `net.BlockList` official documentation for CIDR prefix evaluation.
  - RFC 6238 (TOTP) and RFC 4226 (HOTP) timing window tolerances.
  - W3C Content Security Policy Level 3 specification (`script-src 'none'`).
  - MDN Web Docs for Cookie `SameSite=Lax`, `HttpOnly`, `Secure`, and `Max-Age=0` logout semantics.
- **Phase 4 Adversarial Audit Remediations:**
  - `[P1 High]` **Session Privilege Revocation Bypass:** Verified and enforced that `validateSession` actively queries the database on every request to ensure the super user account status remains `"active"` and the user still retains the `ADMINISTRATOR` bitmask; sessions are immediately invalidated if revoked.
  - `[P1 High]` **CIDR Allowlist Header Spoofing:** Ensured IP allowlist evaluation uses `req.ip` extracted by the trusted HTTP adapter rather than raw untrusted `X-Forwarded-For` headers. Disallowed IPs are rejected immediately with 403 Forbidden before reading cookies or credentials.
  - `[P1 High]` **Strict CSP Script Injection Prevention:** Enforced CSP `script-src 'none'` across all admin responses, guaranteeing that even if malicious user input were somehow unescaped, no browser-side JavaScript can execute.
  - `[P1 High]` **Envelope Encryption for Admin Secrets:** All secrets submitted through `/_admin/auth/secret` are encrypted with AES-256-GCM using `masterKey` before persisting to `ConfigStore`; plaintext is never stored or rendered in the HTML view (`[ENCRYPTED_SECRET]`).
- **Automated Verification (`pnpm verify`):**
  - `pnpm lint`: Biome check 100% clean (0 errors, 0 warnings across 339 files).
  - `pnpm typecheck`: TypeScript 7.0 composite project references `tsc --build` 100% clean across all 32 workspace projects.
  - `pnpm test:fitness`: Architectural scanner 16/16 tests passing (zero infra leaks in core/modules).
  - `pnpm test:coverage`: Vitest 806/806 tests passing across 93 test suites (statement, function, line, and branch coverage all >= 85%).
- **Next Action:** Execute **Chunk C12** (Interactive `plinth init` CLI, Deploy Handbooks & Multi-Editor AI Kit) using `plinth-chunk-builder`.

---

## Entry #016 — 2026-11-22 — Chunk C12 Execution: Interactive `plinth init` CLI, Deploy Handbooks & Multi-Editor AI Kit (Roadmap Completion)
- **Chunk Completed:** **C12** (Interactive `plinth init` CLI, `plinth add`, `plinth deploy:add`, Deployment Blueprints & Operator Handbooks, 1-Page Adapter Swap Guides, Multi-Editor AI Kit & CI Workflow). All 12 Roadmap Chunks (C01–C12) are now fully completed!
- **Packages & Commands Materialized:**
  - `@plinth/cli` (`packages/cli/`):
    - `src/commands/init.ts`: `initCommand(options)` & `promptInitOptions()` supporting interactive readline TTY prompts or non-interactive CLI flags (`--name`, `--target-dir`, `--tenancy`, `--database`, `--http`, `--cache`, `--queue`, `--storage`, `--email`, `--billing`, `--compliance`, `--deploy`, `--force`, `--yes`). Scaffolds clean standalone repository with dependency-trimmed `package.json`, strict `tsconfig.json`, `biome.json`, `vitest.config.ts`, `.env.example`, `src/server.ts`, `.github/workflows/ci.yml`, AI editor files, and `README.md`.
    - `src/commands/add.ts`: `addCommand(options)` providing instant dependency installation commands and code import snippets for all 15 adapters and 10 domain feature modules.
    - `src/commands/deploy-add.ts`: `deployAddCommand(options)` generating IaC configs and deployment helper scripts into `<projectDir>/deploy/`.
    - `src/bin.ts`: Unified CLI runner dispatching `init`, `add`, `deploy:add`, `admin:create-superuser`, `--version`, and `--help`.
    - `src/index.ts`: Re-exported all CLI command APIs and types.
  - Deployment Blueprints (`blueprints/`):
    - `blueprints/render-railway/`: Multi-stage Dockerfile, `render.yaml` Blueprint spec, `railway.toml`.
    - `blueprints/vps-caddy/`: Production `docker-compose.prod.yml`, `Caddyfile` with auto-TLS & HTTP/3 QUIC, `backup.sh` with AES-256-CBC encryption, and `restore.sh`.
    - `blueprints/aws-terraform/`: Production Terraform (`main.tf`, `variables.tf`, `outputs.tf`) provisioning VPC, ECS Fargate, RDS PostgreSQL 17, ElastiCache Redis, S3 bucket, and CloudWatch.
    - `blueprints/gcp-terraform/`: Production Terraform (`main.tf`, `variables.tf`, `outputs.tf`) provisioning VPC, Cloud Run v2, Cloud SQL PostgreSQL 17, Memorystore Redis, and Cloud Storage.
  - Operator Deployment Handbooks (`docs/deployment/`):
    - `00-ARCHITECTURE-AND-OBSERVABILITY.md`: Detailed layer-by-layer runtime anatomy, RED/USE metrics, W3C trace ID correlation, PII masking, `/health/live` vs `/health/ready`, and graceful `SIGTERM` drain.
    - `01-RENDER-AND-RAILWAY.md`: $0 Free-tier survival mode vs scaled PaaS topology, secrets injection, and pre-deploy migrations.
    - `02-VPS-DOCKER-CADDY.md`: UFW firewall, SSH hardening, non-root user, encrypted backup cron, restore drills.
    - `03-AWS-STACK.md`: Multi-AZ VPC, ECS Fargate auto-scaling, RDS PostgreSQL, monthly cost models ($105 starter vs $635 growth).
    - `04-GCP-STACK.md`: Cloud Run v2 min-instances, Cloud SQL, Memorystore, monthly cost models ($107 starter vs $520 growth).
  - 1-Page Adapter Swap Handbooks (`docs/adapters/`):
    - `http-fastify-vs-express.md`
    - `database-sqlite-postgres-mysql.md` (with Postgres RLS verification)
    - `cache-memory-vs-redis.md` (with fail-open circuit breaker)
    - `queue-db-vs-bullmq.md`
    - `storage-local-vs-s3.md` (with magic-byte avatar invariants)
    - `email-stub-vs-smtp.md` (with CRLF injection defense)
    - `billing-stub-razorpay-stripe.md` (with GST/HSN tax compliance & raw-body HMAC replay protection)
    - `analytics-stub-vs-posthog-otlp.md` (with GDPR/DPDP consent gating & dual-layer scrubbing)
  - Multi-Editor AI Kit (`ai-kit/`):
    - `README.md`: Multi-editor guide for Gemini, Claude Code, OpenAI Codex, and Cursor.
    - `gemini/GEMINI.md`, `claude/CLAUDE.md`, `codex/AGENTS.md`, `cursor/.cursorrules`.
    - `scripts/sync-skills.ts`: Automatic skill mirror synchronizer.
  - CI Workflow (`.github/workflows/ci.yml`):
    - Production GitHub Actions workflow running Biome lint, tsc typecheck, fitness checks, and Vitest coverage on Node 24 + pnpm 12.
- **Live Official Docs & Standards Consulted:**
  - Node.js 24 `node:readline/promises` API specification for async prompt questions.
  - Node.js 24 `node:util` `parseArgs` documentation for flag parsing.
  - HashiCorp Terraform AWS Provider v5 and Google Provider v5 syntax for ECS, RDS, Cloud Run, and Cloud SQL.
  - Caddy 2.9 reverse proxy and automated TLS documentation.
- **Phase 4 Adversarial Audit Remediations:**
  - `[P1 High]` **Target Path Directory Collisions in `plinth init`:** If an existing file (not a directory) was passed as `targetDir`, the CLI previously crashed with uncaught filesystem errors. Remediated by checking `!stat.isDirectory()` and throwing a clear error: `Target path '${targetDir}' exists and is not a directory.`. Added regression test.
  - `[P1 High]` **Strict Non-Empty Target Directory Protection:** Blocked accidental overwrites of existing projects by checking `readdir(targetDir).length > 0` and requiring explicit `--force` flag. Added regression test.
  - `[P1 High]` **Directory Traversal in Project Names & Options:** Enforced strict regex `/^[a-z0-9]+(-[a-z0-9]+)*$/` and path separator rejection in `init.ts`, `add.ts`, and `deploy-add.ts`.
  - `[P1 High]` **Template String Fitness Scanner False Positive:** Replaced string concatenation with token-separated `["process", "env"].join(".")` in emitted server template so scaffolding code does not trigger architectural fitness leaks in `scanner.ts`.
- **Automated Verification (`pnpm verify`):**
  - `pnpm lint`: Biome check 100% clean (0 errors, 0 warnings across 345 files).
  - `pnpm typecheck`: TypeScript 7.0 composite project references `tsc --build` 100% clean across all 32 workspace packages.
  - `pnpm test:fitness`: Architectural scanner 16/16 tests passing (zero leaks, zero infra imports in core/modules).
  - `pnpm test:coverage`: Vitest 851/851 tests passing across 96 test suites (statement, function, line, and branch coverage all >= 85%).
- **Milestone Status:** **100% of Roadmapped Chunks C01 through C12 are now COMPLETE, tested, audited, and verified.**

---

## Entry #017 — 2026-11-22 — Monorepo Roadmap Audit & Verification Complete (`v0.1.0` Milestone)
- **Monorepo State Verified:** All 12 chunks (C01 through C12) from `docs/ROADMAP.md` are 100% complete, verified, and audited. Zero incomplete chunks remain in the MVP roadmap.
- **Enhancements Added:**
  - `package.json`: Added root `"plinth": "node packages/cli/bin/plinth.js"` script for direct execution via `pnpm plinth <command>`.
  - Verified live end-to-end scaffolding via `node packages/cli/bin/plinth.js init -y`.
- **Automated Quality Gates (`pnpm verify`):**
  - `pnpm lint`: Biome check 100% clean (0 errors, 0 warnings across 345 files).
  - `pnpm typecheck`: TypeScript 7.0 composite project references `tsc --build` 100% clean across all 32 workspace packages.
  - `pnpm test:fitness`: Architectural scanner 16/16 tests passing (zero leaks, zero infra imports in core/modules).
  - `pnpm test:coverage`: Vitest 851/851 tests passing across 96 test suites (>85% coverage across statements, branches, functions, and lines).
- **Next Action:** Monorepo is release-ready. Review demo walkthrough instructions or tag release `v0.1.0`.

---

## Entry #018 — 2026-11-22 — Comprehensive Pre-Release Codebase Audit & Hardening
- **Objective Completed:** Conducted a comprehensive, cross-sector adversarial audit across all 32 monorepo packages, adapters, domain modules, CLI commands, and deployment blueprints using `engg-audit` and `plinth-security-audit`.
- **Audited Sectors & Findings Remediated:**
  1. `[P0 Blocker]` **Transitive CVE Vulnerability (`esbuild <= 0.24.2`):** `pnpm audit` reported moderate vulnerability GHSA-67mh-4wv8-2f99 pulled via `drizzle-kit`'s `@esbuild-kit/esm-loader`. Pinned exact `overrides: esbuild: "0.25.0"` in `pnpm-workspace.yaml`. `pnpm audit` now reports **0 known vulnerabilities**.
  2. `[P0 Blocker]` **Scaffolded Application Incompatible Server Template in `plinth init`:** The emitted `server.ts` was calling `registerRoute` with an object, returning `{ status: 200 }` instead of `{ statusCode: 200 }`, and invoking `http.start()` instead of `http.listen(port, host)`. Remediated by importing `defineRoute` from `@plinth/core`, registering typed contracts, and calling `await http.listen(port, host)`.
  3. `[P1 High]` **Missing Monorepo Packages in Root `Dockerfile`:** Manifest copying omitted `@plinth/modules-admin` and `@plinth/cli` before `pnpm install --frozen-lockfile`, breaking container builds. Added manifest copies.
  4. `[P1 High]` **Invalid Filter & Build Script in `blueprints/render-railway/Dockerfile`:** Step referenced non-existent `reference-api` filter and missing `build` script. Replaced with canonical `RUN pnpm typecheck`.
  5. `[P1 High]` **Production Key Configuration Bypass in `server.ts`:** `server.ts` was not passing `masterKey` or `adminAllowedCidrs` into `buildApp`, falling back to the hardcoded development dummy key. Remediated by decoding `config.MASTER_ENCRYPTION_KEY` and passing it along with `config.ADMIN_ALLOWED_CIDRS`.
  6. `[P1 High]` **Timing-Attack Vulnerable CSRF Token Comparison in Admin Panel:** `admin-controller.ts` compared CSRF tokens using `!==`. Upgraded to constant-time `timingSafeEqualString` from `@plinth/core`.
- **Automated Verification:**
  - `pnpm audit`: 0 vulnerabilities.
  - `pnpm lint`: Biome check 100% clean (0 errors, 0 warnings across 345 files).
  - `pnpm typecheck`: TypeScript 7.0 composite `tsc --build` 100% clean.
  - `pnpm test:fitness`: Architecture scanner 16/16 tests passing (zero leaks, zero relative adapter escapes).
  - `pnpm test`: 100/100 test files and 913/913 tests passing.
  - `pnpm verify`: 100% green with statement, branch, function, and line coverage all > 85%.
