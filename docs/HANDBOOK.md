# Plinth handbook

How this codebase works and why. Code is referenced by path, never copied. Chapters appear when they have content.

## 1. Orientation

Plinth is a TypeScript backend template: a modular monolith whose infrastructure sits behind ports (`docs/SPEC.md` §1–§3). Setup and commands are in `README.md`.

Where things live:

- `docs/SPEC.md`: what the product is. `docs/BLUEPRINT.md`: the ordered work. `docs/VERSIONS.md`: pinned tools, standards and verified external facts.
- `scripts/kit/`: the project's own checks (`check`, `brief`, plan lint, scope gate and so on). Their tests are in `scripts/kit/__tests__/`.
- The source tree, from P0-01: `platform/` holds shared infrastructure, `modules/<name>/` holds business modules, `main/` holds the process entry points.
- Tool configs at the root: `biome.json` (format and lint), `tsconfig.json` (types), `.dependency-cruiser.cjs` (architecture rules), `.opengrep/` (static security rules), `.gitleaks.toml`, `lefthook.yml` (git hooks), `.github/` (CI, dependency updates, PR template).

Every quality gate runs through `pnpm check`. CI runs the same command, so a green local check predicts a green PR.

## 3. Platform

Shared code is imported through the `package.json` subpath imports, with the `.ts` extension: `#platform/kernel/errors.ts`.

### Kernel (`src/platform/kernel/`)

Pure code every layer may import; it depends only on itself, Node built-ins and zod.

- Errors: each module lists its expected failures once with `defineErrors` in its `domain/errors.ts`; the key becomes the stable public `code`, the status must be 400–599. Code throws `new AppError(definition, { message?, details?, cause? })`. `platformErrors` holds the shared codes (VALIDATION_FAILED, NOT_FOUND, INTERNAL and so on).
- Problems: `toProblem(error, { requestId, instance })` turns anything thrown into an RFC 9457 body with `type` `urn:plinth:error:<CODE>`. A value that is not an `AppError` becomes INTERNAL. For 5xx the `detail` is always the definition's title, so internal messages never reach clients; for 4xx it is the `AppError` message. Field errors travel as `details.errors` (`[{ path, message }]`).
- Ports: `Clock` (`systemClock`), `IdGenerator` (`uuidV7Generator`, time-ordered UUIDv7) and `Logger`. Domain and application code gets time, ids and logging only through these.

### Config (`src/platform/config/`)

`configSchema` (Zod) declares every environment key with its default; `loadConfig()` is the only reader of `process.env`. It reports every invalid key at once as `ConfigError` with `- KEY: reason` lines and never echoes a value. `.env.example` is generated from the schema by `node scripts/env-example.ts`; a test fails when the two drift, so after changing the schema, run the script.

### Logger (`src/platform/logger/`)

`createLogger(config)` returns pino JSON logs at `LOG_LEVEL` with `service` and `env` bound. Keys named `password`, `token`, `refreshToken`, `secret`, `hash`, `authorization` or `cookie` are replaced by `[REDACTED]` up to 4 levels deep. Redaction is a safety net: still never pass bodies or credentials to the logger.

## 8. Operations

### Protect `main`

Run this once, after the first push. It requires a PR and a green `check` job, and blocks force-pushes and deletion:

```sh
gh api -X POST repos/devnadeemashraf/plinth/rulesets --input - <<'JSON'
{"name":"main","target":"branch","enforcement":"active",
 "conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},
 "rules":[{"type":"deletion"},{"type":"non_fast_forward"},
  {"type":"pull_request","parameters":{"required_approving_review_count":0,"dismiss_stale_reviews_on_push":true,"require_code_owner_review":false,"require_last_push_approval":false,"required_review_thread_resolution":false}},
  {"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":true,"required_status_checks":[{"context":"check"}]}}]}
JSON
```

The approval count is 0 because GitHub does not let an author approve their own PR. The merge bar is the green `check` job plus your review.

### Dependency updates

Updates arrive only through PRs: Dependabot runs weekly (`.github/dependabot.yml`), or a blueprint item names a version. Four layers stop a bad version from landing:

1. Exact pins. `pnpm-workspace.yaml` sets `saveExact`, and the versions gate in `check` fails on any range.
2. Age and provenance. pnpm installs nothing published less than 7 days ago (`minimumReleaseAge`) and nothing whose publishing trust dropped (`trustPolicy: no-downgrade`). Dependabot's cooldown matches, so it does not propose versions pnpm would refuse.
3. Families move together. Dependabot groups packages that must share a version (vitest, commitlint, testcontainers, stryker, drizzle), and the versions gate fails if a family's versions differ.
4. Majors are manual. Dependabot ignores major updates; a phase gate schedules them as items.

Merge a Dependabot PR only when `check` is green. If it is red, close the PR; Dependabot proposes the next version a week later. Never loosen the policy to make a PR pass.

Toolchain pins in `mise.toml` (Node, pnpm, scanners) are not covered by Dependabot. Review them at each phase gate.

## 9. Decisions

- 2026-11-16: TypeScript 7.0 (native compiler). TS 7 is stable and matches the SPEC. dependency-cruiser does not support TS ≥ 7 as a parser, so it uses `@swc/core`. Rejected: TS 5.x for tooling compatibility.
- 2026-11-16: Node runs `.ts` sources directly (type stripping), with no build step, in dev and in the image. This needs `erasableSyntaxOnly`. Rejected: a bundler, because it adds a build step and source maps.
- 2026-11-16: The deploy target is a GHCR image per Git tag, and rollback re-points `latest` to the previous tag. This is free for public packages and host-independent. A reference host comes with E09. Rejected: committing to a host in Phase 0.
- 2026-11-16: The reference slice is a public plan catalog (SPEC F08). It is the smallest real feature that crosses every layer without needing auth. Rejected: health checks, which have no domain.
- 2026-11-16: The kit's own gates are small TypeScript scripts in `scripts/kit/`, tested like product code. Rejected: shell scripts, which do not run on the Windows dev machine.
