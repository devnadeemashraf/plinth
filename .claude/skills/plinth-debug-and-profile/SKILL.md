---
name: plinth-debug-and-profile
description: Evidence-driven debugging and performance profiling workflow for plinth. Enforces live online docs/issue lookup, deterministic reproduction via failing regression tests, latency/memory profiling, and root-cause fixes without weakening quality gates.
---

# `plinth` Debug & Profile

Use this skill whenever investigating a bug, flaky test, compiler/tooling error, memory leak, or p95/p99 latency regression.

## Mandatory Protocol
1. **Gather Hard Evidence First:** Capture the exact error stack, failing test output, `traceId`, Pino JSON logs (masked), OTel span timings, or Node.js `--cpu-prof` / `--heap-prof` metrics. Never guess blindly.
2. **Search Online Before Patching (`LIVE_RESEARCH_PROTOCOL.md`):**
   - Look up exact error messages, library version issues (TS 7.0, Biome v2, Zod v4, Drizzle, Fastify, Express, Vitest, pnpm 12), GitHub issues, and official docs before attempting fixes.
3. **Reproduce with a Failing Test First:**
   - Write a minimal, deterministic Vitest regression test (or benchmark) that reliably fails on the bug / latency regression.
4. **Fix the Root Cause Cleanly:**
   - Never silence errors with `any`, `@ts-ignore`, empty `catch {}`, or loosened lint/coverage rules.
   - For performance issues, measure before and after against `plinth` latency budgets (p95 < 100ms, p99 < 250ms, RBAC < 0.1ms) and check for N+1 SQL queries, missing indexes, event-loop blocking, or unbounded caches.
5. **Verify & Document:**
   - Run `pnpm verify` to confirm zero regressions.
   - Record the root cause, online reference, and fix in `docs/ai/SESSION_LOG.md` so future sessions never reintroduce it.
