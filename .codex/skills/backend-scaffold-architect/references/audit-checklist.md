# Adversarial Audit & Production Readiness Checklist

Use this checklist in **Phase 4** after writing tests and implementation for every chunk (and when running `plinth-security-audit`). Adopt a hostile Principal Engineer & Security Auditor mindset: assume the code has subtle bugs, security holes, and production time-bombs until proven otherwise.

---

## 1. Correctness & Edge-Case Integrity
- **Boundary values:** Are zero, negative numbers, empty strings, whitespace-only strings, `null`/`undefined`, max integer overflows, and massive arrays/strings handled deterministically?
- **Encoding & Unicode:** Does input handling survive multibyte UTF-8, emojis, zero-width characters, control characters, null bytes, and case-folding edge cases?
- **Time & Clocks:** Are all timestamps stored/serialized in UTC (ISO 8601)? Are elapsed durations measured with monotonic clocks (`performance.now()` / `process.hrtime.bigint()`)? Are NTP backward jumps safe?
- **Numeric precision:** Are monetary values stored strictly as integer minor units (paise/cents) rather than IEEE 754 floats? Are bitmasks strictly `BigInt` (never truncated 32-bit `number`)?
- **Error handling:** Are any errors silently swallowed or overwritten? Do RFC 9457 Problem Details hide internal stack traces and SQL strings while preserving `traceId` for server logs?
- **Partial state mutations:** If step 2 of a 3-step write fails, does the transaction roll back cleanly (including `outbox_events`) without leaving orphaned state?

## 2. Security & Zero-Trust Verification
- **Injection defenses:** Are all SQL queries parameterized? Are dynamic `ORDER BY`, `LIMIT`, HTML SSR views, and log payloads strictly allowlisted or escaped?
- **Authentication integrity:** Are EdDSA JWTs pinned to `EdDSA` (blocking `alg: none` and algorithm confusion) with `exp`, `nbf`, `iss`, and `aud` verified? Are secrets/hashes compared with `crypto.timingSafeEqual`?
- **Authorization & IDOR:** Is `TenantContext` derived strictly from verified membership middleware on every tenant query? Does every RBAC mutation enforce both `actorHighestPosition > target.position` AND `(target.permissions & ~actorEffectiveMask) === 0n`?
- **Mass assignment:** Are request Zod schemas `.strict()` and separated from persistence models so callers cannot overwrite `role`, `isSuperAdmin`, `tenantId`, or `createdAt`?
- **Input & payload bounds:** Are JSON body size (`<= 1 MB`), avatar size (`<= 5 MB`), role metadata (`<= 4 KB`), profile metadata (`<= 8 KB`), and nesting depth capped?
- **SSRF & egress control:** Are loopback, RFC 1918, IPv6 ULA, IPv4-mapped IPv6 (`::ffff:127.0.0.1`), and cloud metadata (`169.254.169.254`) blocked after DNS resolution and across redirects?
- **Data leakage:** Are passwords, tokens, OAuth secrets, cookies, PII (email, phone, PAN, Aadhaar), and stack traces scrubbed via `RedactionEngine` / `Redacted<T>` from logs, spans, and error responses?
- **Cryptographic hygiene:** Are CSPRNGs (`crypto.randomBytes`) used for all tokens/nonces/IVs? Are Argon2id and AES-256-GCM (unique 96-bit nonces + verified auth tags) used properly?
- **Browser headers:** Strict CSP (`default-src 'self'`, zero inline `<script>` on `/_admin`), CSRF protection on cookie routes, no wildcard `*` CORS in production.

## 3. Performance & Resource Bounds
- **Query efficiency:** Check for N+1 queries, missing indexes on `(tenant_id, ...)`, `SELECT *` on wide tables, and unbounded scans.
- **Pagination caps:** Hard max `100` rows with cursor/keyset pagination.
- **Memory & streaming:** Large payloads streamed; in-memory LRU caches bounded by max items + TTL; avatar images bounded by pixel dimensions to block decompression bombs.
- **Connection pools:** Explicit `min`/`max`/idle timeout bounds; single shared pool per adapter instance.
- **Concurrency & hot paths:** No synchronous CPU/crypto blocking on hot paths without bounds; no locks held across network I/O; no high-cardinality IDs in Prometheus metric labels.

## 4. Reliability, Concurrency & Failure Modes
- **Timeouts everywhere:** Explicit timeout + `AbortSignal` propagation on every inbound handler, DB query, outbound HTTP call, and readiness probe.
- **Idempotency & duplicate delivery:** Verify DB unique constraints (`(provider, provider_event_id)`), `Idempotency-Key` locking, and `FOR UPDATE SKIP LOCKED` / atomic job claims under concurrent duplicates.
- **Retries & backpressure:** Retries only on transient errors with exponential backoff + jitter + retry cap -> DLQ.
- **Resource leaks:** DB connections, transactions, timers, SSE streams, and file handles guaranteed closed in `finally` blocks.
- **Graceful shutdown:** On `SIGTERM`/`SIGINT`, fail `/health/ready` immediately, stop accepting new work, drain in-flight requests within 15s, flush OTel/logs, and close pools cleanly.

## 5. Maintainability, Anti-Patterns & Test Quality
- **Architectural boundaries:** Zero infra leaks into `core` or `modules`; zero `process.env` outside `config/`.
- **Hidden state:** No mutable global singletons or circular module imports.
- **Test rigor & determinism:** No tautological mocks; zero real `sleep()` calls; zero shared mutable state across tests; every security denial explicitly asserted.

---

## Required Audit Report Format

### Severity Rubric
- **P0 Blocker:** Exploitable vulnerability, data corruption/loss, cross-tenant leak, race condition, crash, or broken core contract. **MUST fix before chunk sign-off.**
- **P1 High:** Missing timeout/bound, resource leak, N+1 bottleneck, weak authz guard, or missing critical edge-case test. **MUST fix before chunk sign-off.**
- **P2 Medium:** Maintainability hazard, leaky abstraction, minor performance waste, or suboptimal error ergonomics. Fix now or log in `PROJECT_STATE.md`.
- **P3 Nit:** Style, naming, or minor polish.

### Finding Template
1. **Severity & Title** (e.g., `[P0 Blocker] Missing TenantContext check allows cross-tenant IDOR`)
2. **Location:** Exact file path and symbol/function name.
3. **Failure / Exploit Scenario:** Concrete step-by-step trace.
4. **Recommended Fix:** Exact code patch.
5. **Regression Test:** Concrete Vitest test proving the bug can never return.
