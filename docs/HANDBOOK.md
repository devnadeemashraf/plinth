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

## 2. Architecture

A modular monolith. `src/platform/` is shared infrastructure that knows nothing about business modules; `src/modules/<name>/` holds one business capability each; `src/main/` holds one entry point per process: `src/main/api.ts` (HTTP), `src/main/migrate.ts` (migrations) and, from P1-05, the worker. One container image runs every process.

Inside a module, code depends inward only: `domain` (types, errors, pure rules) ← `application` (use cases and the ports they need) ← `infra` (adapters such as Drizzle repositories) and `http` (routes and Zod schemas). `infra` and `http` never import each other; the manifest (`<name>.module.ts`) wires them through the DI container. Another module is reached only through its `src/modules/<name>/index.ts`. `.dependency-cruiser.cjs` enforces all of this in the `arch` stage of `pnpm check`.

A request travels: Express adapter → pipeline (request id, validation, error mapping, headers, access log) → route handler → use case → port → adapter → Postgres, and back. Chapter 4 traces a real one.

Contracts that tooling keeps honest: `openapi.json` (generated from routes), the Drizzle schema plus `drizzle/` migrations, the history declaration beside each table, and `src/platform/config/schema.ts` with the generated `.env.example`.

### Glossary

- **Module**: a folder under `src/modules/` with a manifest listed in `src/modules/index.ts`.
- **Manifest** (`ModuleManifest`): a module's `register`, `routes` and optional `readiness` hooks.
- **Port**: an interface the application layer depends on (`PlanRepository`, `Clock`). **Adapter**: its implementation, named `<Tech><Port>` (`DrizzlePlanRepository`).
- **Use case**: one application operation in one file, a factory taking its dependencies (`listPlans({ planRepository })`).
- **Route definition** (`RouteDefinition`): a route as data; the pipeline runs it, OpenAPI documents it.
- **Pipeline**: the framework-neutral request path in `src/platform/http/pipeline.ts`.
- **Problem**: an RFC 9457 error body built by `toProblem`; its `code` comes from an error definition.
- **Error definition**: an entry of a module's `defineErrors` catalogue (code, status, title).
- **Cradle**: the typed set of everything the DI container resolves.
- **History declaration**: the `declareHistory` call classifying a table's columns for the activity history.
- **Plan**: a named bundle of entitlements, identified by `key`. **Audience**: who a plan is for, `user` or `tenant`.
- **Entitlement**: what a subject may use or how much (from E06). **Permission**: what an actor may do (from E05). Code checks these, never plan or role names.
- **Item**: one blueprint entry, one PR. **Epic**: a group of future items. **Phase gate**: the review between phases (AGENTS.md §6).

## 3. Platform

Shared code is imported through the `package.json` subpath imports, with the `.ts` extension: `#platform/kernel/errors.ts`.

### Kernel (`src/platform/kernel/`)

Pure code every layer may import. At run time it depends only on itself, Node built-ins and zod; `import type` may name anything (the DI container, `Config`), so kernel contracts such as `RequestContext` stay fully typed.

- Errors: each module lists its expected failures once with `defineErrors` in its `domain/errors.ts`; the key becomes the stable public `code`, the status must be 400–599. Code throws `new AppError(definition, { message?, details?, cause? })`. `platformErrors` holds the shared codes (VALIDATION_FAILED, NOT_FOUND, INTERNAL and so on).
- Problems: `toProblem(error, { requestId, instance })` turns anything thrown into an RFC 9457 body with `type` `urn:plinth:error:<CODE>`. A value that is not an `AppError` becomes INTERNAL. For 5xx the `detail` is always the definition's title, so internal messages never reach clients; for 4xx it is the `AppError` message. Field errors travel as `details.errors` (`[{ path, message }]`).
- Ports: `Clock` (`systemClock`), `IdGenerator` (`uuidV7Generator`, time-ordered UUIDv7) and `Logger`. Domain and application code gets time, ids and logging only through these.

### Config (`src/platform/config/`)

`configSchema` (Zod) declares every environment key with its default; `loadConfig()` is the only reader of `process.env`. It reports every invalid key at once as `ConfigError` with `- KEY: reason` lines and never echoes a value. `.env.example` is generated from the schema by `node scripts/env-example.ts`; a test fails when the two drift, so after changing the schema, run the script.

### Logger (`src/platform/logger/`)

`createLogger(config)` returns pino JSON logs at `LOG_LEVEL` with `service` and `env` bound. Keys named `password`, `token`, `refreshToken`, `secret`, `hash`, `authorization` or `cookie` are replaced by `[REDACTED]` up to 4 levels deep. Redaction is a safety net: still never pass bodies or credentials to the logger.

### HTTP (`src/platform/http/`)

Routes are plain `RouteDefinition` objects (`src/platform/kernel/http.ts`); handlers get a `RequestContext` and return an `HttpResult`, never touching `req`/`res`. `createPipeline` (`src/platform/http/pipeline.ts`) runs every request through: request id (an incoming `x-request-id` is kept only if it matches `^[A-Za-z0-9-]{8,64}$`) → CORS preflight for `OPTIONS` → strict Zod validation of params, query and body (field errors as `body.<field>`) → handler → response-schema check outside production → `toProblem` for anything thrown → security and CORS headers → one access-log line. A 5xx is logged once, at `error`, here; 4xx are not logged as errors.

The Express adapter (`src/platform/http/express/express-server.ts`) only routes and parses JSON: a malformed body becomes VALIDATION_FAILED, an oversized one PAYLOAD_TOO_LARGE, an unmatched path or method NOT_FOUND, all through the pipeline. Route settings that are not enforced yet (`rateLimit`, `idempotent`, non-public `auth`) make `register` throw at boot. `close()` stops accepting connections, answers in-flight requests with `connection: close` and cuts remaining connections after 10 s. A JSON body is encoded; a string body under a non-JSON `content-type` (HTML, JavaScript) is sent as is.

The default CSP is `default-src 'none'; frame-ancestors 'none'`. Only a platform route typed `PipelineRoute` may replace it through `contentSecurityPolicy`; the kernel `RouteDefinition` that modules use has no such field.

Tests start a real server with `startTestServer(routes, env)` from `test/support/http.ts` and call it with `fetch`; `test/support/process.ts` spawns `src/main/api.ts`.

### OpenAPI (`src/platform/openapi/`)

The route definitions are the source of the API contract. `buildDocument(routes, version)` turns them into an OpenAPI 3.1 document: one operation per route, `operationId` = method plus path in snake case, and one `application/problem+json` response per error status, which references `components.schemas.ProblemDetails`. `apiDocument(routes)` takes the version from package.json. At boot, `src/main/api.ts` calls `assertRouteDocs(routes)`, which fails if any route has an empty summary, description or tags, or a response without an example.

`pnpm run openapi` writes the committed `openapi.json` (keys sorted, 2-space indent). The `openapi` stage of `pnpm check` runs `openapi:check`, which fails on any drift and names the first differing JSON path. When `PUBLIC_DOCS` is true, `docsRoutes` serves `/openapi.json`, the Scalar page at `/docs` and its bundle at `/docs/scalar.js`. The bundle is read from `@scalar/api-reference/dist/browser/standalone.js` at boot. The two docs pages carry a CSP that allows `'self'`, inline styles, and `data:` images and fonts. The docs routes are not part of the document.

### Dependency injection (`src/platform/di/`)

Awilix in PROXY mode with `strict: true`. `createRootContainer(config, logger)` registers `config`, `logger`, `clock`, `idGenerator`; the pipeline creates one scope per request (`createRequestScope`) with the request's logger. `Cradle` (`src/platform/di/cradle.ts`) types the container; a module adds its entries by declaration merging in its manifest. `registerModules` calls each `ModuleManifest.register`, collects `readiness` checks into `readinessChecks` and returns all routes. Tests use `createTestContainer({ overrides })`.

### Database (`src/platform/db/`)

Postgres through Drizzle on a `pg` pool. `src/platform/platform.module.ts` is a manifest listed first in `enabledModules`: it registers the singleton `database` (`createDatabase(config, logger)` → `{ db, pool, close() }`, sized by `DATABASE_POOL_MAX`) and the readiness check `postgres` (`select 1`). The pool connects on the first query. It logs an idle connection that drops at `warn` and replaces it on demand, so a database restart makes `/readyz` fail without crashing the API. Shutdown disposes the container, which ends the pool.

Tables live in `src/modules/<name>/infra/schema.ts` and use `src/platform/db/columns.ts`: `idColumn()` (uuid primary key with no database default; the repository sets it from `IdGenerator`), `timestampColumns()` and `citext(name)` for emails and usernames. Every table calls `declareHistory(table, { mode: "tracked", columns })` or `declareHistory(table, { mode: "untracked", reason })` from `src/platform/db/history.ts`. `columns` must classify every column as `track`, `redact` or `ignore`, which `tsc` enforces. `src/platform/db/__tests__/history-declarations.int.test.ts` fails, naming each exported table that has no declaration.

Integration tests (`*.int.test.ts`) need Docker. The vitest global setup `test/support/postgres-global.ts` starts one `postgres:18.7-alpine` container per run and migrates the database `plinth_template`. `createTestDatabase()` from `test/support/postgres.ts` gives each test file a copy (`CREATE DATABASE … TEMPLATE plinth_template`), or an empty database with `{ migrated: false }`.

## 4. Flows

### `GET /v1/plans/{key}`

The reference read path; every later endpoint follows it.

1. The Express adapter (`src/platform/http/express/express-server.ts`) matches `/v1/plans/:key` and hands a neutral request to the pipeline.
2. The pipeline (`src/platform/http/pipeline.ts`) sets the request id and validates `params` against `planParamsSchema` (`src/modules/entitlements/http/schemas.ts`). `FREE` or a 41-character key stops here with 400 VALIDATION_FAILED.
3. The handler in `src/modules/entitlements/http/routes.ts` calls the `getPlan` use case, which the manifest resolved from the container at boot.
4. `getPlan` (`src/modules/entitlements/application/get-plan.ts`) asks the `PlanRepository` port for the key and throws `AppError(entitlementsErrors.PLAN_NOT_FOUND)` when it gets nothing; the pipeline turns that into a 404 problem.
5. `DrizzlePlanRepository` (`src/modules/entitlements/infra/drizzle-plan-repository.ts`) selects the plan's columns from `plans` through the platform `database`.
6. The handler maps the `Plan` to `planSchema`'s public fields, so `id` and timestamps never leave the module, and adds `cache-control: public, max-age=60`. Outside production the pipeline checks the body against the response schema, so a leaked field fails as a 500 in tests.

## 5. Modules

Each module exports a `ModuleManifest` (`src/platform/kernel/module.ts`) from `<name>.module.ts`; `src/modules/index.ts` lists the enabled ones above the `// plinth:modules` marker. `src/main/api.ts` is the composition root: config → logger → container → modules → server → listen; SIGTERM or SIGINT (or an IPC `"shutdown"` message, which Windows needs) closes the server gracefully, disposes the container and exits 0.

### Module: health

`GET /livez` answers 200 `{ status: "ok" }` without checking anything. `GET /readyz` runs every module's readiness checks in parallel, each limited to 1 s (`src/modules/health/application/check-readiness.ts`): all pass → 200 with each name `"ok"`; otherwise 503, `retry-after: 5`, and only the failing names. Failure reasons go to the log at `warn`, never to the response.

### Module: entitlements

Plans now; plan entitlements, assignments and overrides arrive with later items (SPEC §6.5).

- Table `plans` (`src/modules/entitlements/infra/schema.ts`): unique `key`, `audience` `user` or `tenant` (CHECK), at most one `is_default` per audience (partial unique index `plans_default_per_audience`), `sort`. History: tracked, timestamps ignored. Migration `drizzle/0001_plans.sql` seeds `free` (audience `user`, default) with the fixed id `01930000-0000-7000-8000-000000000001`.
- `GET /v1/plans[?audience=]` → `{ data, nextCursor: null }`, ordered by `sort`, then `key` (`listPlans`). `GET /v1/plans/{key}` → one plan or 404 PLAN_NOT_FOUND (`getPlan`). Both are public and cacheable for 60 s; responses never carry `id` or timestamps.
- Exports the types `Plan` and `PlanAudience` and the manifest. Other modules will depend on entitlement keys, never on plan keys or names.

## 7. Recipes

### Add a read endpoint

Built from the plan catalog (`src/modules/entitlements/`); copy its files and shapes.

1. Domain: the entity as a readonly interface in `domain/<entity>.ts`; its expected failures in `domain/errors.ts` with `defineErrors`.
2. Port: the repository interface in `application/ports.ts`, returning domain types (`undefined` for "not found").
3. Use case: one file per use case, `application/<verb>-<noun>.ts`, exporting a factory that takes its dependencies and returns the function (`getPlan({ planRepository })`). It throws `AppError` for expected failures and does not log. Unit-test it with an in-memory fake of the port.
4. Table: `infra/schema.ts` with `idColumn()`, `timestampColumns()`, text plus `CHECK` instead of enums, and `declareHistory`. Run `mise x -- pnpm run db:generate --name <slug>`; append seed rows to the new SQL file before it is applied.
5. Adapter: `infra/drizzle-<entity>-repository.ts`, class `Drizzle<Entity>Repository` taking `{ database }`. Select named columns, never `*`.
6. HTTP: strict Zod schemas in `http/schemas.ts` (the output schema lists only public fields); routes in `http/routes.ts` with summary, description, tags, an example per response and every error definition; map the entity to the output schema in the handler. Lists answer `{ data, nextCursor }`.
7. Wire: register the repository and use cases in `<module>.module.ts` (extend `Cradle` there), export the manifest and public types from `src/modules/<name>/index.ts`, add the manifest to `src/modules/index.ts`.
8. Run `mise x -- pnpm run openapi`, add a `### Module:` entry above if the module is new, and test the routes over HTTP with `startTestServer` (fake port) plus one `*.int.test.ts` against Postgres.

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

### Database and migrations

Locally, `docker compose up -d postgres` starts Postgres on port 5432 (user, password and database `plinth`, data in the `postgres-data` volume). Set `DATABASE_URL=postgres://plinth:plinth@localhost:5432/plinth`.

- Change a schema, then `mise x -- pnpm run db:generate` writes the next SQL file to `drizzle/`. For SQL that Drizzle cannot express (extensions, triggers), run `mise x -- pnpm exec drizzle-kit generate --custom --name=<slug>` and fill in the empty file. Never edit an applied migration or `drizzle/meta/`.
- `mise x -- pnpm run db:migrate` runs `src/main/migrate.ts` (the `migrate` process). It holds `pg_advisory_lock(727274)`, so concurrent runs wait and apply each migration once. All pending migrations run in one transaction. It logs `migrations applied` with the count and exits 0. On failure it rolls back, logs `migration failed` with the failing migration's name and exits 1.
- Deploys run `migrate` before starting the new `api`. Migrations are forward-only (expand → backfill → contract), so the old version keeps working against the new schema.

### Dependency updates

Updates arrive only through PRs: Dependabot runs weekly (`.github/dependabot.yml`), or a blueprint item names a version. Four layers stop a bad version from landing:

1. Exact pins. `pnpm-workspace.yaml` sets `saveExact`, and the versions gate in `check` fails on any range.
2. Age and provenance. pnpm installs nothing published less than 7 days ago (`minimumReleaseAge`) and nothing whose publishing trust dropped (`trustPolicy: no-downgrade`). Dependabot's cooldown matches, so it does not propose versions pnpm would refuse.
3. Families move together. Dependabot groups packages that must share a version (vitest, commitlint, testcontainers, stryker, drizzle), and the versions gate fails if a family's versions differ.
4. Majors are manual. Dependabot ignores major updates; a phase gate schedules them as items.

Merge a Dependabot PR only when `check` is green. If it is red, close the PR; Dependabot proposes the next version a week later. Never loosen the policy to make a PR pass.

Toolchain pins in `mise.toml` (Node, pnpm, scanners) are not covered by Dependabot. Review them at each phase gate.

### Container image

`Dockerfile` builds one image for both processes: `node src/main/api.ts` (the default command) and `node src/main/migrate.ts`. There is no build step, because Node strips types at run time. The image holds production dependencies, `src/` (without tests), `drizzle/` and `package.json`, runs as the `node` user, and its `HEALTHCHECK` calls `/livez`.

Locally, `docker compose --profile app up -d --build` starts Postgres, runs `migrate` once, then starts `api` on port 3000. `node scripts/smoke.ts http://localhost:3000` waits for `/readyz` 200 (30 s by default, `--timeout-ms N` to change it), then checks `/livez`, `/openapi.json` and that `GET /v1/plans` lists `free`. CI's `smoke` job does the same on every PR, and also fails when the image runs as root or is larger than 250 MB gzipped.

### Release

1. On an up-to-date `main`, tag the commit: `git tag v<X.Y.Z> && git push origin v<X.Y.Z>`.
2. `.github/workflows/release.yml` runs `pnpm check`, then pushes `ghcr.io/devnadeemashraf/plinth:<X.Y.Z>` and `:latest`. Check the run with `gh run list --workflow release`.
3. Deploy: run the image's `migrate` command, then start the new `api`.

### Roll back

Migrations are forward-only, so a rollback never runs a down migration; the previous image works against the newer schema.

1. Point `latest` at the previous version:
   `docker buildx imagetools create -t ghcr.io/devnadeemashraf/plinth:latest ghcr.io/devnadeemashraf/plinth:<previous>`
2. Confirm: `docker buildx imagetools inspect ghcr.io/devnadeemashraf/plinth:latest` shows the previous version's digest.
3. Redeploy the `<previous>` tag. Do not run `migrate` from the older image.

## 9. Decisions

- 2026-11-16: TypeScript 7.0 (native compiler). TS 7 is stable and matches the SPEC. dependency-cruiser does not support TS ≥ 7 as a parser, so it uses `@swc/core`. Rejected: TS 5.x for tooling compatibility.
- 2026-11-16: Node runs `.ts` sources directly (type stripping), with no build step, in dev and in the image. This needs `erasableSyntaxOnly`. Rejected: a bundler, because it adds a build step and source maps.
- 2026-11-16: The deploy target is a GHCR image per Git tag, and rollback re-points `latest` to the previous tag. This is free for public packages and host-independent. A reference host comes with E09. Rejected: committing to a host in Phase 0.
- 2026-11-16: The reference slice is a public plan catalog (SPEC F08). It is the smallest real feature that crosses every layer without needing auth. Rejected: health checks, which have no domain.
- 2026-11-16 (phase 0 gate): The Redis-protocol server in compose and tests is Valkey (`valkey/valkey`, BSD-3-Clause) through `ioredis`. Rejected: the `redis` image, whose 8.x licences (RSALv2/SSPLv1/AGPLv3) are a needless question for template users. Any Redis-protocol server works in production.
- 2026-11-16 (phase 0 gate): Phase 1 was split into items for E01–E03 only (21 items); E04–E09 are split at the next gate, with the session, activity and user code in hand. Rejected: splitting all nine epics now, whose decisions would rest on code that does not exist yet.
- 2026-11-16: The kit's own gates are small TypeScript scripts in `scripts/kit/`, tested like product code. Rejected: shell scripts, which do not run on the Windows dev machine.
