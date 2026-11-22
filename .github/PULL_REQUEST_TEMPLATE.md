## Summary of Changes

A concise explanation of the changes proposed in this Pull Request.

- What problem does this PR solve?
- What architectural decisions or trade-offs were made?

## Type of Change

- [ ] `type: bug` — Non-breaking bug fix
- [ ] `type: feature` — New feature or capability
- [ ] `type: adapter` — New or improved swappable port adapter
- [ ] `type: docs` — Documentation, guides, or handbooks update
- [ ] `type: refactor` — Code cleanup with zero API or contract changes
- [ ] `type: perf` — Performance, latency, or memory optimization
- [ ] `breaking change` — Breaking contract or architectural change

## Related Issue

Closes # <!-- issue number, if applicable -->

## Architectural Invariants Checklist

Please confirm your PR complies with all core architectural laws:

- [ ] **Hexagonal Boundaries:** Core domain and modules contain zero infrastructure driver or external SDK imports.
- [ ] **Path Aliases:** Uses canonical path aliases (`@plinth/core`, `@/*`, `#/*`) exclusively. No variable-depth relative paths (`../../src/...`) and no dynamic variable imports (`import(var)`).
- [ ] **Dependency Hygiene:** Any added dependency is verified online against latest stable releases, pinned exactly (no `^` or `~`) in `pnpm-workspace.yaml` `catalog:`, and references `"catalog:"`.
- [ ] **Multi-Tenancy:** All tenant-scoped operations require compile-time branded `TenantContext`.
- [ ] **Zero Memory Guessing:** All APIs, flags, and library signatures were confirmed against live official documentation.
- [ ] **Redaction & Security:** Sensitive credentials and PII use `Redacted<T>` or `RedactionEngine` and are never logged in plaintext.

## Quality Gates & Testing

- [ ] **5-Category TDD Matrix:** Includes Happy Path, Boundary/Fuzzing, Concurrency/Ordering/Idempotency, Fault Injection, and Security/Abuse tests.
- [ ] **Automated Quality Gates:** Clean run with zero warnings:
  ```bash
  pnpm verify # pnpm lint && pnpm typecheck && pnpm test:fitness && pnpm test:coverage
  ```
- [ ] **Coverage:** Coverage meets or exceeds the repository threshold (>= 85%).

## How to Test / Review

Provide step-by-step instructions for the maintainer or reviewer to verify this PR locally:

1. `pnpm install`
2. `pnpm test:core` (or specific module/adapter test)
3. Step to reproduce or observe new capability
