# Versions, standards and verified facts

One line each. Installed versions live only in `package.json` and `mise.toml`; a line carries a version only while its dependency is planned and not yet installed (the item that installs it removes the version). `pnpm run docs <name>` substitutes the installed version into the URL. The versions gate in `check` fails if an installed dependency has no line.

## Toolchain (`mise.toml`)

- `node` — MIT — runtime, Active LTS line 26 — https://nodejs.org/docs/latest-v26.x/api/ — 2026-11-16
- `pnpm` — MIT — package manager — https://pnpm.io/settings — 2026-11-16
- `gitleaks` — MIT — secret scan — https://github.com/gitleaks/gitleaks/tree/v{version} — 2026-11-16
- `osv-scanner` — Apache-2.0 — dependency vulnerability scan — https://google.github.io/osv-scanner/ — 2026-11-16
- `opengrep` — LGPL-2.1 — static security analysis, dev tool only — https://github.com/opengrep/opengrep/tree/v{version} — 2026-11-16
- `mise` — MIT — toolchain pinning and runner, installed per machine — https://mise.jdx.dev/ — 2026-11-16

## Dependencies

- `zod` — MIT — validation, types, OpenAPI source — https://zod.dev/api — 2026-11-16
- `pino` — MIT — JSON logging — https://getpino.io/#/docs/api — 2026-11-16

## Dev dependencies

- `typescript` — Apache-2.0 — type checking only (`tsc --noEmit`) — https://www.typescriptlang.org/tsconfig/ — 2026-11-16
- `@types/node` — MIT — Node type definitions, major must equal Node's — https://www.npmjs.com/package/@types/node — 2026-11-16
- `@biomejs/biome` — MIT OR Apache-2.0 — formatter and linter — https://biomejs.dev/linter/rules/ — 2026-11-16
- `vitest` — MIT — test runner — https://vitest.dev/config/ — 2026-11-16
- `@vitest/coverage-v8` — MIT — coverage, same version as vitest — https://vitest.dev/guide/coverage — 2026-11-16
- `dependency-cruiser` — MIT — architecture rules — https://github.com/sverweij/dependency-cruiser/blob/v{version}/doc/rules-reference.md — 2026-11-16
- `@swc/core` — Apache-2.0 — TypeScript parser for dependency-cruiser — https://swc.rs/docs/usage/core — 2026-11-16
- `lefthook` — MIT — git hooks — https://lefthook.dev/configuration/ — 2026-11-16
- `@commitlint/cli` — MIT — commit message lint — https://commitlint.js.org/reference/cli.html — 2026-11-16
- `@commitlint/config-conventional` — MIT — Conventional Commits preset — https://commitlint.js.org/reference/rules.html — 2026-11-16

## Planned dependencies (version chosen 2026-11-16; installed by the named item)

- `express` 5.3.0 — MIT — HTTP adapter (P0-02) — https://expressjs.com/en/5x/api.html — 2026-11-16
- `@types/express` 5.0.6 — MIT — Express types (P0-02) — https://www.npmjs.com/package/@types/express — 2026-11-16
- `awilix` 13.0.5 — MIT — dependency injection (P0-02) — https://github.com/jeffijoe/awilix/blob/v{version}/README.md — 2026-11-16
- `zod-openapi` 6.0.2 — MIT — OpenAPI 3.1 from Zod 4 (P0-03) — https://github.com/samchungy/zod-openapi/blob/v{version}/README.md — 2026-11-16
- `@scalar/api-reference` 1.77.0 — MIT — API reference UI bundle (P0-03) — https://github.com/scalar/scalar/tree/main/packages/api-reference — 2026-11-16
- `drizzle-orm` 0.45.4 — Apache-2.0 — SQL query builder (P0-04) — https://orm.drizzle.team/docs/overview — 2026-11-16
- `drizzle-kit` 0.31.11 — MIT — migrations (P0-04) — https://orm.drizzle.team/docs/kit-overview — 2026-11-16
- `pg` 8.23.1 — MIT — Postgres driver (P0-04) — https://node-postgres.com/apis/pool — 2026-11-16
- `@types/pg` 8.23.1 — MIT — pg types (P0-04) — https://www.npmjs.com/package/@types/pg — 2026-11-16
- `testcontainers` 12.2.1 — MIT — container test harness (P0-04) — https://node.testcontainers.org/ — 2026-11-16
- `@testcontainers/postgresql` 12.2.1 — MIT — Postgres module (P0-04) — https://node.testcontainers.org/modules/postgresql/ — 2026-11-16
- `postgres:18.7-alpine` — PostgreSQL licence — database image; 19 is still RC (P0-04) — https://www.postgresql.org/docs/18/ — 2026-11-16
- `node:26.13.1-alpine` — MIT — base image, pinned by digest in P0-05 — https://hub.docker.com/_/node — 2026-11-16

## Adopted standards

- TypeScript style: Biome `recommended` plus the stricter rules in `biome.json`; `tsconfig.json` strict family — enforced by `check` (format, lint, types)
- Architecture: SPEC §3.3 layering — enforced by `.dependency-cruiser.cjs`
- Commits: Conventional Commits 1.0.0 — enforced by commitlint (hook and `check`)
- Versioning: SemVer 2.0.0 for tags and the template's public API (SPEC §17)
- Security: OWASP ASVS 5.0 Level 2 as the baseline behind the SPEC §9 matrix; secrets by gitleaks, dependencies by osv-scanner, code by opengrep rules in `.opengrep/`
- HTTP errors: RFC 9457 problem details; API description: OpenAPI 3.1
- Accessibility: WCAG 2.2 AA, from F50
- Editor basics: EditorConfig (`.editorconfig`)

## Verified external facts

- Node 26 (Lithium) is the Active LTS line; 26.13.1 is its latest release — nodejs.org/dist/index.json — 2026-11-16
- Node 26 provides `crypto.randomUUIDv7()` and strips types natively; it does not bundle corepack — checked locally — 2026-11-16
- pnpm `minimumReleaseAge` is in minutes; `trustPolicy: no-downgrade` blocks releases whose provenance dropped — pnpm.io/supply-chain-security — 2026-11-16
- Dependabot supports pnpm v7–v12; `cooldown` keys `default-days` and `semver-major-days`; `ignore` uses `version-update:semver-major` — docs.github.com Dependabot reference — 2026-11-16
- GitHub Container Registry is free for public packages — docs.github.com GitHub Packages billing — 2026-11-16
- The repo `devnadeemashraf/plinth` is public and its rulesets API answers (GET returned `[]`) — `gh api` — 2026-11-16
- dependency-cruiser 18.7.2 supports TypeScript `<7` as a parser, so it uses swc — `depcruise --info` — 2026-11-16
- Opengrep publishes Windows builds only as `.zip`, so `mise.toml` uses the `github:` backend — mise install log — 2026-11-16
- Claude Code: `attribution` with `commit: ""`, `pr: ""`, `sessionUrl: false` hides all attribution, and `includeCoAuthoredBy` is deprecated; `SessionStart` hooks add their stdout to context — code.claude.com settings and hooks reference — 2026-11-16
- Codex: project `.codex/config.toml` loads only for trusted projects; `[features] hooks = true` enables `SessionStart` hooks; reads `AGENTS.md` natively. The config reference documents no commit-trailer setting, so the commit-msg hook is the guard. UNVERIFIED: whether hook stdout becomes context (check: start a session and ask what `brief` printed) — developers.openai.com/codex/config-reference — 2026-11-16
- Antigravity reads `AGENTS.md` natively (since v1.20.3, per third-party guides). UNVERIFIED on official docs; check: start a session and ask it to quote AGENTS.md §10 — 2026-11-16

## Model tiers

- Strong: Claude Code `claude-opus-5-5` or `claude-fable-5-2`; Codex `gpt-6-astra`; Antigravity Gemini 4 Carbon or Claude Opus 5.5 (Thinking) — vendor model pages — 2026-11-16
- Weakest (portability test): Claude Code `claude-haiku-5-5`; Codex `gpt-6-luna`; Antigravity Gemini 3.8 Flash (UNVERIFIED as the weakest; Gemini 4 Hydrogen is the other candidate, so test both) — vendor model pages — 2026-11-16
