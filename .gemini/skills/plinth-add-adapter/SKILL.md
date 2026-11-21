---
name: plinth-add-adapter
description: Builds or swaps a hexagonal Port adapter in plinth (HTTP, Database, Cache, Queue, Storage, Email, Billing, Analytics), proves drop-in parity via shared black-box Contract Tests, and generates a 1-page Swap-to-Production handbook.
---

# `plinth` Add Adapter

Use this skill to implement a new infrastructure adapter under `packages/adapter-<port>-<vendor>/`.

## Mandatory Execution Steps
1. **Read the Core Port Interface:** Inspect `packages/core/src/ports/<port>.ts` and the corresponding contract suite in `packages/contract-tests/`. Never alter a core port to leak vendor-specific types.
2. **Research Live SDK Docs & Pin Exact Version:** Activate `plinth-live-research-and-versions` to verify the vendor's latest stable SDK version, Node 24+/26 ESM support, timeout/AbortSignal APIs, and webhook signature verification rules. Pin the exact version in root `pnpm-workspace.yaml` `catalog:`.
3. **Wire Contract Tests First (TDD Red):** Mount the shared black-box Contract Test Suite from `packages/contract-tests/` against the new adapter, plus vendor-specific edge-case tests (timeouts, connection pool exhaustion, malformed upstream responses, signature spoofing).
4. **Implement the Adapter:**
   - Enforce explicit timeouts, connection bounds, graceful `close()`/`drain()`, and `Redacted<T>` secret handling.
   - Map all vendor-specific exceptions cleanly into `@plinth/core` typed errors (never leak raw SDK/SQL errors).
   - Register adapter-specific env vars via fail-fast Zod schema extensions.
5. **Verify Parity & Audit:** Run `pnpm verify` + contract tests + Phase 4 security/reliability audit (`docs/ai/AUDIT_CHECKLIST.md`).
6. **Write 1-Page Swap-to-Production Handbook:** Add/update `docs/adapters/<port>-<vendor>.md` explaining local stub behavior, required prod env vars, Admin Panel config (if applicable), verification steps, and failure/rollback behavior.
