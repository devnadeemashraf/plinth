# `plinth` Quality Gates & Strict TDD Protocol

Every single chunk, feature module, adapter, or bug fix MUST satisfy every gate on this page before being marked complete.

---

## 1. Strict Test-First Development (Red -> Green -> Refactor)

### Step A — Enumerate the 5-Category Test Matrix FIRST
Before creating or modifying production code, explicitly list tests across all 5 categories:
1. **Standard / Happy Path:** Core behavior, valid contracts, expected side effects.
2. **Boundary & Input Fuzzing:** Empty strings, whitespace-only, `null`/`undefined`, `0`, negative numbers, integer overflow, max payload size, malformed UTF-8/Unicode, null bytes, unknown extra JSON properties.
3. **Concurrency, Ordering & Idempotency:** Parallel identical requests, duplicate webhook/job delivery, monotonic ordering under same-ms load, NTP clock drift, mid-flight `AbortSignal` cancellation.
4. **Failure & Fault Injection:** Downstream timeout, DB connection drop, Redis outage, corrupted ciphertext/tag, invalid config, transaction rollback ensuring outbox atomicity.
5. **Security & Abuse Cases:** Cross-tenant IDOR, privilege escalation (bitmask/rank), forged JWT/webhook signatures, SSRF private/metadata IPs, path traversal, magic-byte spoofing, PII/secret leakage in logs or RFC 9457 errors.

### Step B — Write Failing Tests First (Red)
- Create runnable Vitest suites covering all 5 categories.
- Run `pnpm test` and verify tests fail for the right reason (missing behavior, not broken syntax).
- Prefer real ephemeral dependencies (in-memory SQLite, Testcontainers PG/MySQL) over brittle mocks that mask SQL or concurrency bugs.

### Step C — Implement Clean, Minimal Production Code (Green -> Refactor)
- Follow `docs/ai/ARCHITECTURE_RULES.md`.
- Never swallow errors, never add `any`, never skip timeouts or input bounds, never log unmasked PII.

---

## 2. Mandatory Automated Verification Command (`pnpm verify`)

Every chunk MUST pass all 4 commands cleanly with zero skipped tests and zero warnings:

```bash
pnpm lint          # Biome check (strict lint + formatting)
pnpm typecheck     # TypeScript 7.0 Go-native tsc --build --noEmit
pnpm test:fitness  # Architectural Fitness Tests (hexagonal + env isolation)
pnpm test:coverage # Vitest full suite (>= 85% lines/functions/branches/statements on core)
```

For chunks modifying dependencies or containers, also run:
```bash
pnpm audit --audit-level=high
```

---

## 3. Code Review & Definition of Done Checklist
- [ ] All 5 test matrix categories covered and passing deterministically (zero real `sleep()` flakiness).
- [ ] Zero forbidden imports in `packages/core` or `packages/modules`.
- [ ] Zero `^` or `~` ranges in any `package.json`; all versions pinned via `pnpm-workspace.yaml` `catalog:`.
- [ ] Every external API/library usage verified against live official docs (not memory).
- [ ] Phase 4 Adversarial Audit completed using `docs/ai/AUDIT_CHECKLIST.md`; **zero** unfixed P0 or P1 findings.
- [ ] `docs/ai/PROJECT_STATE.md` and `docs/ai/SESSION_LOG.md` updated.
