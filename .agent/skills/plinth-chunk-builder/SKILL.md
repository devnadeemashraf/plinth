---
name: plinth-chunk-builder
description: End-to-end execution workflow for building plinth chunks (C01-C12) across fresh or continued Gemini sessions. Enforces state loading, live docs and latest-version verification, strict 5-category TDD, pnpm verify gates, adversarial Phase 4 auditing, and mandatory PROJECT_STATE.md and SESSION_LOG.md handoff updates.
---

# `plinth` Chunk Builder

Use this skill to execute any chunk (`C01`–`C12`) from `docs/ROADMAP.md` with zero architectural drift across fresh or continued sessions.

## Step 1 — Session Sync & Scope Lock
1. Read `GEMINI.md`, `docs/ai/PROJECT_STATE.md`, and the latest entry in `docs/ai/SESSION_LOG.md`.
2. Read the target chunk in `docs/ROADMAP.md` (and `docs/specs/<chunk>.md` if it exists) plus relevant sections of `docs/EDD.md` and `docs/ai/ARCHITECTURE_RULES.md`.
3. Verify every prerequisite chunk is marked `DONE` in `PROJECT_STATE.md` and actually exists in the repo.
4. Confirm the exact chunk scope in 3 concise lines before proceeding.

## Step 2 — Live Research & Latest Exact Dependency Verification
1. Follow `docs/ai/LIVE_RESEARCH_PROTOCOL.md` and `docs/ai/DEPENDENCY_AND_VERSION_POLICY.md`.
2. For every new library or non-trivial API introduced in this chunk:
   - Query live npm (`pnpm view <pkg> version engines peerDependencies --json`) or official release pages for the exact latest stable version.
   - Fetch official docs/changelogs online to confirm exact API signatures and config schemas (never guess from memory).
   - Pin exact versions (NO `^` or `~`) in root `pnpm-workspace.yaml` `catalog:` and reference `"catalog:"` in package `package.json` files.

## Step 3 — Strict TDD (Phase 3: Red -> Green -> Refactor)
1. Write out the **5-Category Test Matrix** (Happy Path, Boundary/Fuzzing, Concurrency/Ordering/Idempotency, Fault Injection, Security/Abuse) covering every edge case listed in `docs/ROADMAP.md`.
2. Write complete, runnable Vitest test files **before** creating production source files. Confirm they fail for the right reason.
3. Implement clean, idiomatic production code obeying `docs/ai/ARCHITECTURE_RULES.md`:
   - Zero infra imports in `packages/core` or `packages/modules`.
   - Zero `process.env` outside `src/config/`.
   - Always use canonical path aliases (`@plinth/core`, `@/*`, `#/*`) in both dev and test; zero variable relative traversals (`../../src/...`) or dynamic variable imports.
   - Branded `TenantContext` on all tenant repositories.
   - `Redacted<T>` / `RedactionEngine` for all sensitive fields.
   - Explicit timeouts, payload caps, pagination limits, and `AbortSignal` propagation.
4. Run the full automated quality gate:
   ```bash
   pnpm verify
   ```
   Fix all lint, TS 7.0 typecheck, fitness, and coverage (>= 85%) issues until 100% green.

## Step 4 — Adversarial Audit & Remediation (Phase 4)
1. Switch persona to a hostile Principal Security & Reliability Auditor.
2. Audit every file created or modified in this chunk against `docs/ai/AUDIT_CHECKLIST.md`.
3. Report findings ranked by severity (`P0 Blocker`, `P1 High`, `P2 Medium`, `P3 Nit`) with exact location, exploit/failure trace, code patch, and regression test.
4. **Remediate ALL P0 and P1 findings immediately**, add their regression tests, and re-run `pnpm verify` until 100% green.

## Step 5 — Mandatory Session Continuity Handoff
1. Update `docs/ai/PROJECT_STATE.md`:
   - Mark the chunk `DONE` with test/audit notes.
   - Record any new pinned dependency versions and any deferred P2 items.
   - Set **Next Session Exact Starting Point** to the next chunk.
2. Append a structured entry to `docs/ai/SESSION_LOG.md` listing files changed, live docs consulted, audit fixes applied, and `pnpm verify` outcome.
