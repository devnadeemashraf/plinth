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
