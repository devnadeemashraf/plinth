---
name: plinth-add-feature-module
description: Adds a new production business feature module to plinth following strict hexagonal boundaries, Zod-to-OpenAPI contracts, compile-time TenantContext isolation, Discord-style BigInt bitmask permissions, TDD, and adversarial auditing. Use whenever slapping new product requirements onto plinth.
---

# `plinth` Add Feature Module

Use this skill whenever adding domain/business logic to `plinth` (either inside `packages/modules/<name>` or a scaffolded app's `src/modules/<name>`).

## Required Module Layout
```text
src/modules/<feature>/
├── contracts.ts      # Zod v4 schemas, RouteContracts, DTOs, cursor pagination params
├── permissions.ts    # Custom BigInt bitmask permissions (registered at bit >= 64)
├── ports.ts          # Repository & external port interfaces (ZERO infra imports)
├── service.ts        # Pure domain logic, transactional outbox emissions, audit events
├── handlers.ts       # Thin contract handlers delegating to service.ts
└── index.ts          # Clean public exports
```
*(SQL repository implementations live in the DB adapter layer, wired at `src/bootstrap/container.ts`.)*

## Mandatory Execution Steps
1. **Verify Live Docs:** Check `docs/ai/LIVE_RESEARCH_PROTOCOL.md` for any new domain integrations or APIs.
2. **Contract First (`contracts.ts`):** Define strict Zod v4 input/output schemas (`.strict()` on mutations), URI path `/api/v1/<resource>`, cursor pagination (`limit <= 100`), `Idempotency-Key` requirement for non-idempotent mutations, and RFC 9457 domain error mappings.
3. **Permissions & Tenancy:**
   - Register feature permission bits >= 64 in `permissions.ts` using `plinth`'s `BigInt` registry.
   - Require branded `TenantContext` on every tenant-scoped service and repository method.
4. **PII & Masking:** Wrap any user-sensitive fields in `Redacted<T>` and register custom sensitive keys with `RedactionEngine`.
5. **Strict TDD:** Write the 5-category test matrix and failing Vitest unit + integration tests first (explicitly testing cross-tenant IDOR, missing permission bit, payload fuzzing, and fault injection).
6. **Implement & Wire:** Build pure domain logic + adapter repository implementation + register in `src/bootstrap/container.ts`.
7. **Verify & Audit:** Run `pnpm verify` (including Architectural Fitness Tests to prove zero infra leaks), complete a Phase 4 audit against `docs/ai/AUDIT_CHECKLIST.md`, and update `docs/ai/PROJECT_STATE.md` + `docs/ai/SESSION_LOG.md`.
