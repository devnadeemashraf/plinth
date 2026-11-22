# Contributing to Plinth

Thank you for your interest in contributing to Plinth! Plinth is an opinionated, production-ready hexagonal TypeScript backend platform designed for solo developers and high-velocity engineering teams.

We hold our codebase to rigorous engineering standards: strict hexagonal boundaries, zero framework magic, compile-time multi-tenancy, and $O(1)$ BigInt bitmask authorization.

Please review this guide before submitting issues or pull requests. All contributors are expected to uphold our [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## 1. Prerequisites & Environment

Plinth leverages modern Node.js standards and strict monorepo toolchains:

- **Node.js:** `v24 LTS` or `v26 LTS` (with native TypeScript type stripping / pure ESM support).
- **Package Manager:** `pnpm` (version `12+` with `catalogMode: strict` and `saveExact: true`).
- **Operating Systems:** Linux, macOS, or Windows (PowerShell / WSL).

---

## 2. Local Setup & Workflow

Clone the repository and install workspace dependencies:

```bash
git clone https://github.com/plinth-ts/plinth.git
cd plinth
pnpm install
```

### Common Commands

```bash
pnpm dev              # Launch reference API in watch mode
pnpm typecheck        # Run TypeScript Go-native tsc --build
pnpm lint             # Run Biome strict linting and formatting check
pnpm format           # Auto-format codebase using Biome
pnpm test             # Run all Vitest suites
pnpm test:fitness     # Run Hexagonal Architecture Fitness Scanner
pnpm test:coverage    # Run Vitest with v8 coverage (>= 85% required)
pnpm verify           # Run full automated quality gate (lint + typecheck + fitness + coverage)
```

---

## 3. The Core Engineering Laws

Every contribution must follow these foundational laws:

### Law 1: Hexagonal Architecture Boundaries
- Domain logic and business rules belong exclusively in `packages/core` or `packages/modules/*`.
- Core packages and feature modules must NEVER import infrastructure drivers, database clients, or cloud SDKs.
- Infrastructure integrations belong exclusively in swappable packages under `packages/adapters/*/*`.

### Law 2: Path Aliases & Zero Variable Relative Traversals
- Always use canonical path aliases (`@plinth/core`, `@/*`, `#/*`) across both source (`src/`) and test (`test/`) files.
- Never use variable-depth relative traversals (`../../src/...` or `../../../../packages/...`).
- Never use dynamic variable imports (`import(someVar)` or `require(someVar)`). All imports must be statically analyzable.

### Law 3: Zero Memory Guessing & Live Docs Research
- Never guess third-party library signatures, compiler options, or API contracts from memory.
- Always consult live official documentation and release notes before implementing non-trivial integrations.

### Law 4: Exact Dependency Pinning
- Dependencies are centralized in the root `pnpm-workspace.yaml` under `catalog:`.
- Every package version must be pinned exactly (no `^` or `~`).
- Packages reference dependencies using `"catalog:"` or `"workspace:*"`.

### Law 5: Strict Test-First Development (5-Category Test Matrix)
Before writing implementation code, author comprehensive tests covering the 5-Category Test Matrix:
1. **Happy Path:** Expected behavior under standard valid inputs.
2. **Boundary & Fuzzing:** Extreme values, empty inputs, malformed structures, maximum limits.
3. **Concurrency, Ordering & Idempotency:** Duplicate operations, race conditions, replay resilience.
4. **Fault Injection:** Upstream timeouts, network disconnects, unavailable downstream dependencies.
5. **Security & Abuse:** Privilege escalation attempts, SSRF vectors, cross-tenant IDOR, secret leaks.

---

## 4. Authoring a New Port Adapter

If you are contributing a new adapter (e.g., a new database driver, cache store, or queue backend):

1. Place the adapter package under `packages/adapters/<category>/<name>`.
2. Implement the corresponding Port interface defined in `@plinth/core`.
3. Import the shared contract test suite from `@plinth/contract-tests` and verify 100% compliance.
4. Provide a 1-page Swap-to-Production handbook in `docs/adapters/`.

---

## 5. Submitting Pull Requests

1. **Create a Topic Branch:** Use descriptive branch names (`feat/my-feature` or `fix/issue-description`).
2. **Commit Messages:** Follow the Conventional Commits specification:
   - `feat(scope): brief description`
   - `fix(scope): brief description`
   - `docs(scope): brief description`
   - `test(scope): brief description`
   - `chore(scope): brief description`
3. **Run the Verification Suite:** Ensure `pnpm verify` completes with 100% green output.
4. **Complete the PR Template:** Fill out all checkboxes in `.github/PULL_REQUEST_TEMPLATE.md`.
