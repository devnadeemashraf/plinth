---
name: backend-scaffold-architect
description: Tech-agnostic engineering workflow to architect, scaffold, test, and audit production-ready backend templates matching Prodictiongrade quality, security, reliability, and speed standards. Use when designing a backend, microservice, major subsystem, or running a spec-first, TDD, and adversarially audited 4-phase engineering loop.
---

# Backend Scaffold Architect

A tech-agnostic, high-rigor engineering workflow for scaffolding production-ready backend templates that meet Prodictiongrade standards for code quality, security, reliability, and speed. It enforces a strict four-phase engineering loop anchored by an intensive interrogation phase that eliminates ambiguity before a single line of code is written.

## Core Engineering Standards

- **Explicit Contracts First:** Strongly typed schemas, versioned APIs, strict input validation at trust boundaries, and uniform error envelopes (RFC 9457).
- **Defense-in-Depth Security:** Zero-trust defaults, least privilege, explicit authn/authz boundaries, safe secret handling, rate/size limits, and zero PII or secrets in logs or error responses.
- **Bounded Everything:** Explicit timeouts, context cancellation, pagination caps, payload limits, connection pool bounds, and backpressure on every I/O path.
- **Observable by Default:** Structured JSON logging with correlation/trace IDs, RED/USE metrics hooks, distributed tracing propagation, and distinct liveness vs. readiness probes.
- **Graceful Lifecycle:** Deterministic startup validation (fail fast on bad config), idempotent mutations, clean dependency injection, and graceful shutdown that drains in-flight work.

## Non-Negotiable Operating Rules

1. **No premature code:** Never generate scaffolding files or implementation code until Phase 1 (Grill & Spec) and Phase 2 (Chunked Plan) have explicit user approval.
2. **Load reference guides before acting:** Always read `references/grill-bank.md` before starting Phase 1, and always read `references/audit-checklist.md` before starting Phase 4.
3. **Zero memory guessing:** Always verify live official docs and exact latest stable package versions online before locking dependencies or writing code.
4. **Strict test-first order:** In Phase 3, always design and write the complete 5-category test suite before writing implementation code for that chunk.
5. **One chunk at a time:** Build, verify, and audit one chunk completely before moving to the next, unless the user explicitly asks to batch chunks.

## The 4-Phase Engineering Loop

### Phase 1: The Ruthless Grill Session & Spec Definition

1. Read `references/grill-bank.md` and run **3 to 5 focused, high-density Grill Rounds** (Mission/Scope -> Scale/SLOs -> Tech Stack/Data -> Security/Threat Model -> Reliability/Observability/Ops).
2. Push back relentlessly like a Staff Engineer in a design review on vague answers and contradictions.
3. Produce a concise, decision-complete **Engineering Design Doc (EDD)** and require explicit user approval before entering Phase 2.

### Phase 2: Chunked Planning Session (MVP-First, Recursive Hardening)

1. Organize into clear waves: **Wave 1 (Production MVP Skeleton)** -> **Wave 2 (Security & Resilience Hardening)** -> **Wave 3+ (Adapters, Product Modules & Scale)**.
2. Define Chunk ID, Goal, Dependencies, Files/Modules, Concrete Definition of Done, and Key Edge Cases for every chunk.
3. Require user approval of the roadmap before entering Phase 3.

### Phase 3: Test-First Chunk Implementation (TDD)

1. Enumerate the **5-Category Test Matrix** (Happy Path, Boundary/Fuzzing, Concurrency/Ordering/Idempotency, Fault Injection, Security/Abuse).
2. Write complete runnable tests first (**Red**).
3. Write minimal, clean, idiomatic production code (**Green -> Refactor**).
4. Enforce canonical path aliases (`@plinth/core`, `@/*`, `#/*`) across all code and tests; prohibit variable-depth relative traversals (`../../src/...`) or dynamic variable imports.
5. Run full verification suite (lint, typecheck, fitness tests, tests + coverage).

### Phase 4: Adversarial Review, Deep Audit & Remediation

1. Read `references/audit-checklist.md` and switch persona to an adversarial Principal Engineer & Security Auditor.
2. Audit all 5 domains and output a severity-ranked report (`P0 Blocker`, `P1 High`, `P2 Medium`, `P3 Nit`) with exact location, failure/exploit trace, code fix, and regression test.
3. Fix all P0 and P1 findings with regression tests before marking the chunk complete.
