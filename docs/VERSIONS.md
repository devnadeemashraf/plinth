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
- `express` — MIT — HTTP adapter — https://expressjs.com/en/5x/api.html — 2026-11-16
- `awilix` — MIT — dependency injection — https://github.com/jeffijoe/awilix/blob/v{version}/README.md — 2026-11-16
- `drizzle-orm` — Apache-2.0 — SQL query builder and migrator — https://orm.drizzle.team/docs/overview — 2026-11-16
- `pg` — MIT — Postgres driver — https://node-postgres.com/apis/pool — 2026-11-16
- `zod-openapi` — MIT — OpenAPI 3.1 from Zod 4 — https://github.com/samchungy/zod-openapi/blob/v{version}/README.md — 2026-11-16
- `@scalar/api-reference` — MIT — API reference UI bundle — https://github.com/scalar/scalar/tree/main/packages/api-reference — 2026-11-16

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
- `@types/express` — MIT — Express types — https://www.npmjs.com/package/@types/express — 2026-11-16
- `drizzle-kit` — MIT — migration generator — https://orm.drizzle.team/docs/kit-overview — 2026-11-16
- `@types/pg` — MIT — pg types — https://www.npmjs.com/package/@types/pg — 2026-11-16
- `testcontainers` — MIT — container test harness — https://node.testcontainers.org/ — 2026-11-16
- `@testcontainers/postgresql` — MIT — Postgres module, same version as testcontainers — https://node.testcontainers.org/modules/postgresql/ — 2026-11-16

## Container images

- `postgres:18.7-alpine` — PostgreSQL licence — database image in compose and tests — https://www.postgresql.org/docs/18/ — 2026-11-16
- `node:26.13.1-alpine` — MIT — base image, pinned by digest in `Dockerfile` — https://hub.docker.com/_/node — 2026-11-16

## Planned dependencies (version chosen 2026-11-16, at least 7 days old; installed by the named item)

- `ioredis` 6.0.0 — MIT — Redis-protocol client (P1-02) — https://github.com/redis/ioredis/blob/v{version}/README.md — 2026-11-16
- `valkey/valkey:9.1.3-alpine` — BSD-3-Clause — Redis-protocol server image for compose and tests (P1-02) — https://valkey.io/docs/ — 2026-11-16
- `@stryker-mutator/core` 10.1.1 — Apache-2.0 — mutation testing (P1-03) — https://stryker-mutator.io/docs/stryker-js/configuration/ — 2026-11-16
- `@stryker-mutator/vitest-runner` 10.1.1 — Apache-2.0 — Stryker runner for Vitest, same version as core (P1-03) — https://stryker-mutator.io/docs/stryker-js/vitest-runner/ — 2026-11-16
- `fast-check` 4.10.2 — MIT — property-based tests (P1-04) — https://fast-check.dev/docs/introduction/ — 2026-11-16
- `bullmq` 6.7.2 — MIT — job queue and worker; deny the `msgpackr-extract` build (P1-05) — https://docs.bullmq.io/ — 2026-11-16
- `nodemailer` 10.4.0 — MIT-0 — SMTP email sender (P1-13) — https://nodemailer.com/smtp/ — 2026-11-16
- `@types/nodemailer` 8.0.2 — MIT — nodemailer types (P1-13) — https://www.npmjs.com/package/@types/nodemailer — 2026-11-16
- `axllent/mailpit:v1.33.1` — MIT — local SMTP catcher image (P1-13) — https://mailpit.axllent.org/docs/ — 2026-11-16
- `@node-rs/argon2` 2.2.2 — MIT — argon2id password hashing, prebuilt binaries (P1-14) — https://github.com/napi-rs/node-rs/tree/main/packages/argon2 — 2026-11-16
- `jose` 6.2.16 — MIT — EdDSA JWT and JWKS (P1-15) — https://github.com/panva/jose/tree/v{version}/docs — 2026-11-16

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
- Phase 1 dependency set (`ioredis`, `bullmq`, `jose`, `@node-rs/argon2`, `nodemailer`, Stryker, `fast-check`) installs under the current pnpm policy once `msgpackr-extract` is denied; argon2id m=19456 KiB, t=2, p=1 hashes in 22 ms and jose EdDSA with a local JWKS verifies, on Node 26 under Windows — scratch install — 2026-11-16
- The pinned `node:26.13.1-alpine` digest ships `zlib 1.3.2-r1`, affected by ALPINE-CVE-2026-4738 (critical, fixed in `1.4-r0`, available through `apk upgrade`) — `osv-scanner scan image` — 2026-11-16
- `drizzle-kit generate --out` with an absolute Windows path joins it onto the cwd and fails; a relative path works and reports `No schema changes` when schema and migrations agree — local run — 2026-11-16
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
