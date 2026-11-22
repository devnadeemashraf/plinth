# ADR-0001: Core Architectural Decisions for `plinth`

**Status:** Accepted & Locked  
**Date:** 2026-11-21  
**Purpose:** Prevent future human or AI sessions from accidentally reverting deliberate trade-offs.

---

## Decision 1: Workspace Monorepo Source of Truth + Code-Scaffolding CLI (Direct Code Ownership)
- **Choice:** Maintain `plinth` as a typed `pnpm` workspace monorepo (`packages/core`, `packages/modules/*`, `packages/adapters/*/*`, `packages/contract-tests`, `packages/cli`). `plinth init` assembles a clean standalone repo containing only chosen adapters + local stubs.
- **Why:** String-templated boilerplates rot silently. Compiling and contract-testing every adapter in a real monorepo guarantees every scaffolded combination actually compiles and passes tests.

## Decision 2: TypeScript 7.0 (Go-Native `tsc`) + Biome (No ESLint)
- **Choice:** TypeScript 7.0 + Biome + Vitest.
- **Why:** TypeScript 7.0 delivers 8–12x faster typechecking for monorepos and AI verification loops, while deferring the legacy JS compiler API that `typescript-eslint` relies on. Biome runs natively in Rust with zero TS compiler API dependency. Architectural rules that ESLint plugins traditionally handled are enforced directly by Vitest **Architectural Fitness Tests**.

## Decision 3: pnpm 12+ with Strict `catalog:` Exact Version Pinning
- **Choice:** `saveExact: true`, `catalogMode: strict`, `minimumReleaseAge: 1440`, and centralized exact versions inside `pnpm-workspace.yaml` `catalog:`. Never use `^` or `~`.
- **Why:** Prevents silent dependency drift during fresh installs and defends against freshly hijacked npm packages via the 24-hour release age gate.

## Decision 4: Drizzle ORM Across Postgres, MySQL & SQLite
- **Choice:** Drizzle ORM behind `@plinth/core` repository ports (with thin dialect schemas in each DB adapter), verified by one shared **Repository Contract Test Suite**.
- **Why:** Zero binary engine overhead, fast cold starts on free Render/Railway tiers, full raw SQL control for Postgres RLS and `FOR UPDATE SKIP LOCKED`, and high TypeScript type safety.

## Decision 5: Scaffold-Time Multi-Tenancy (`single` | `multi`) + Compile-Time `TenantContext` + Postgres RLS
- **Choice:** Never toggle multi-tenancy live on a populated DB. In `single` mode, transparently pin an internal `default_tenant` at the middleware boundary so 100% of schemas and queries stay identical. Require branded `TenantContext` on every tenant repo call, plus `SET LOCAL app.current_tenant_id` RLS on Postgres.
- **Why:** Eliminates catastrophic live-migration orphan/leak bugs while guaranteeing structural anti-IDOR protection across all 3 SQL dialects.

## Decision 6: Discord-Style `BigInt` Bitmask RBAC Serialized as Canonical Hex Strings
- **Choice:** Arbitrary-width native `BigInt` bitmasks (`1n << n`) stored as canonical hex strings (`"0x..."`), supporting `O(1)` permission evaluation, depth <= 4 scope overwrites (`@everyone -> roles -> member`), and rank + bit-subset anti-escalation invariants.
- **Why:** Avoids JS 32-bit bitwise truncation and SQL 64-bit signed integer limits across PG/MySQL/SQLite, enabling unlimited custom product permissions with sub-millisecond authorization.

## Decision 7: Slim v1 Auth + Dual Session Transport + Envelope-Encrypted Admin Config
- **Choice:** Email/Username + Argon2id password and OAuth2/OIDC (with PKCE) behind live Admin flags. Browser/Admin uses `HttpOnly` opaque cookies + CSRF; Mobile/API uses short-lived `Ed25519` JWTs + rotating opaque refresh tokens with reuse-detection revocation. DB-stored provider secrets use AES-256-GCM envelope encryption.
- **Why:** Keeps v1 razor-sharp and auditable while preserving clean `AuthStrategy` extension points for v2 (Passkeys, Magic Links, API Keys).

## Decision 8: Zero-Build SSR HTML/CSS Admin Panel
- **Choice:** Server-rendered HTML + CSS served directly by `plinth` under `/_admin` with Brand CSS variables, strict CSP (`default-src 'self'`, zero inline `<script>`), CSRF tokens, optional CIDR allowlist, and CLI-only Super User creation with mandatory TOTP MFA.
- **Why:** Zero separate frontend build pipeline, minimal attack surface, instant boot on free PaaS tiers, and trivial deployment.
