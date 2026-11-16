# Blueprint

The ordered list of PRs. `pnpm brief` prints the next item. Plan lint (`pnpm check`) enforces the format.
Done items collapse to one line: `- <ID> <title> — #<PR> — <F-ids>`.

## Writing items (phase gate only; implementing sessions skip this section)

- An item is executable by a model that has read only AGENTS.md and `pnpm brief`. Use the fields and order of the existing items; plan lint rejects missing fields.
- Size S (one session) or M (two to four). Split anything larger. Risk is high if it touches auth, permissions, payments, the data model or migrations, deletion, secrets, concurrency or a public interface. High risk → Tier `strong`, or `any + review`.
- Decisions leave nothing consequential to choose: data shapes, names, libraries with exact versions (the newest release at least 7 days old, checked with `npm view <pkg> time`), patterns, error behavior.
- Files in scope are backticked paths or globs. An existing test file may change only if its exact path is listed.
- Order within a phase: what unblocks the most later items, then the highest technical risk, then user value. Authentication and authorization, input validation, secrets handling, data integrity and migrations, the error convention and tests on critical paths are never deferred. No "set up X" item exists unless a delivering item depends on it. Anything unproven (an API limit, a library's behavior, a budget) gets a time-boxed spike item first, whose output is a HANDBOOK Decisions entry.
- Test cases: derive them, don't brainstorm them. For each input and piece of state, list the equivalence classes and boundaries; for each dependency, its failure modes; for each actor, its authorization states. Write one case per class that could fail differently, choosing the boundary over a typical value. Walk this list: invalid input, empty or oversized data, unauthorized actor, duplicate or retried request, concurrent action, dependency slow or down, partial failure midway. If two cases guard the same risk, keep the harsher one. Where a rule can be stated generally (parsing, money, dates, permissions, state transitions), use one property-based test. Never test the framework, trivial accessors, or a mock of the thing under test. Write each case as `given state and input → expected result — risk in ≤ 8 words`; aim for 4–10, never more than 12.
- Cite the SPEC as `§<n>` and `§16 F<nn>`. Every MUST feature ID must be cited by an open item, an epic or a Done line.

## Done

## Phase 0 — Walking skeleton and reference slice

### P0-01 Kernel, config and logger

- Type: feat
- Spec: §4, §6.13, §8, §16 F01
- Depends on: none
- Size: M
- Risk: high
- Tier: strong
- Follow: none yet; this item sets the patterns. Apply AGENTS.md §7 exactly.
- Decisions:
  - Import shared code through the subpath imports already in `package.json`, with the `.ts` extension: `#platform/kernel/errors.ts`.
  - `src/platform/kernel/errors.ts`: `defineErrors(defs)` takes `{ CODE: { status, title } }` (status 400–599) and returns `{ CODE: { code: "CODE", status, title } }` typed as `ErrorDefinition`. `class AppError extends Error` has `readonly definition: ErrorDefinition`, `readonly details: Readonly<Record<string, unknown>> | undefined`, and is built with `new AppError(definition, { message?, details?, cause? })`. Export `platformErrors = defineErrors({ VALIDATION_FAILED: 400 "Validation failed", UNAUTHENTICATED: 401 "Authentication required", FORBIDDEN: 403 "Forbidden", NOT_FOUND: 404 "Not found", CONFLICT: 409 "Conflict", PAYLOAD_TOO_LARGE: 413 "Payload too large", RATE_LIMITED: 429 "Too many requests", INTERNAL: 500 "Internal error", UNAVAILABLE: 503 "Service unavailable" })`.
  - `src/platform/kernel/problem.ts`: `toProblem(error: unknown, { requestId, instance })` returns the RFC 9457 body `{ type: "urn:plinth:error:<CODE>", title, status, detail, instance, code, requestId, errors? }`. A non-`AppError` maps to `INTERNAL`. For status ≥ 500, `detail` is always the definition's title; for 4xx it is the `AppError` message or the title. `errors` (`[{ path, message }]`) comes from `details.errors` when present.
  - `src/platform/kernel/ports/clock.ts`: `interface Clock { now(): Date }` and `systemClock`. `src/platform/kernel/ports/id-generator.ts`: `interface IdGenerator { next(): string }` and `uuidV7Generator`, using `crypto.randomUUIDv7()` from `node:crypto`.
  - `src/platform/kernel/ports/logger.ts`: `interface Logger` with `fatal|error|warn|info|debug|trace(obj: object, msg?: string): void` and `child(bindings: object): Logger`.
  - `src/platform/config/schema.ts`: a Zod object with `NODE_ENV` (`development|test|production`, default `development`), `PORT` (int 1–65535, default 3000), `LOG_LEVEL` (`fatal|error|warn|info|debug|trace`, default `info`), `HTTP_ADAPTER` (`express`, default `express`), `TRUST_PROXY` (int ≥ 0, default 0), `CORS_ORIGINS` (comma-separated absolute http(s) origins, default empty list), `BODY_LIMIT_BYTES` (int 1–10485760, default 1048576), `PUBLIC_DOCS` (only `"true"` or `"false"`, default true). Export `type Config`.
  - `src/platform/config/load.ts`: `loadConfig(env = process.env): Config`. On failure it throws `ConfigError` whose message is `Invalid configuration:` followed by one `- KEY: reason` line per invalid key. It never includes a value. This is the only file that reads `process.env`.
  - `src/platform/logger/create-logger.ts`: `createLogger(config, destination?)` returns pino (JSON) at `LOG_LEVEL` with base `{ service: "plinth", env: NODE_ENV }`, redacting `password`, `token`, `refreshToken`, `secret`, `hash`, `authorization`, `cookie` at any depth up to 4, censored as `[REDACTED]`.
  - `.env.example`: every config key with its default, generated by `scripts/env-example.ts` from the schema (run with `node scripts/env-example.ts`). The check that it matches is part of this item's tests.
  - Dependencies: `zod` 4.6.7, `pino` 10.4.0 (exact; see VERSIONS).
- Files in scope: `src/platform/kernel/**`, `src/platform/config/**`, `src/platform/logger/**`, `scripts/env-example.ts`, `scripts/__tests__/env-example.test.ts`, `.env.example`, `package.json`, `pnpm-lock.yaml`
- Must not touch: `scripts/kit/**`, tool configs
- Test cases:
  1. env `{}` → defaults: PORT 3000, NODE_ENV development, LOG_LEVEL info, PUBLIC_DOCS true, CORS_ORIGINS [] — missing defaults break boot
  2. PORT `"0"` → ConfigError naming PORT; `"65536"` → ConfigError; `"65535"` → 65535 — port boundaries
  3. PORT `"abc"` and LOG_LEVEL `"loud"` together → one ConfigError listing both keys — all errors reported at once
  4. PORT `"s3cr3t-value"` → the ConfigError message does not contain `s3cr3t-value` — secret leak in errors
  5. PUBLIC_DOCS `"yes"` → ConfigError; `"false"` → false — loose boolean parsing
  6. CORS_ORIGINS `"https://a.com,https://b.com"` → two origins; `"ftp://a.com"` → ConfigError — malformed origin accepted
  7. `toProblem(new AppError(platformErrors.CONFLICT, { message: "Key taken" }))` → status 409, code CONFLICT, detail "Key taken", type `urn:plinth:error:CONFLICT` — error convention shape
  8. `toProblem(new Error("password=hunter2"))` → status 500, code INTERNAL, detail "Internal error" — internal detail leak
  9. Logger writing `{ password: "p", nested: { token: "t", deeper: { secret: "s" } } }` → output has `[REDACTED]` for all three and no raw values — secrets in logs
  10. 10 000 `uuidV7Generator.next()` values (property) → all unique, each matches the UUIDv7 regex — id collisions or wrong version
  11. `.env.example` on disk → equals the generator's output — config docs drift
- Acceptance: `pnpm check`
- Manual check: none

### P0-02 HTTP port, pipeline, Express adapter, DI and health

- Type: feat
- Spec: §3.5, §3.6, §6.13, §8, §16 F02, F03, F05
- Depends on: P0-01
- Size: M
- Risk: high
- Tier: strong
- Follow: `src/platform/kernel/errors.ts`, `src/platform/config/load.ts` (whole files: export style, error construction)
- Decisions:
  - `src/platform/kernel/http.ts`: `RouteDefinition` exactly as SPEC §3.5. `PermissionKey`, `EntitlementKey` and `FlagKey` are declared in `src/platform/kernel/keys.ts` as `never` until their registries exist (E05, E06, F32 widen them). `errors` is `ErrorDefinition[]`. `HttpResult = { status: number; body?: unknown; headers?: Readonly<Record<string, string>> }`. `RequestContext = { requestId, logger, container, params, query, body, headers, ip }` (headers lower-cased and read-only).
  - Registering a route that sets `rateLimit` or `idempotent`, or whose `auth` is not `"public"`, throws at boot with `Not supported until E01/E03: <method> <path>`. This fails loudly instead of silently ignoring the setting.
  - `src/platform/http/pipeline.ts`: `createPipeline(deps)` returns `handle(request: NeutralRequest, route: RouteDefinition): Promise<NeutralResponse>`. Stages, in order: request id (keep incoming `x-request-id` if it matches `^[A-Za-z0-9-]{8,64}$`, otherwise a new UUIDv7) → security headers → CORS → Zod validation of params, query and body (schemas strict; failure → `VALIDATION_FAILED` with `errors[{ path, message }]`) → handler → response-schema validation when `NODE_ENV !== "production"` (mismatch → 500 and an error log) → error mapping with `toProblem` → one access-log line `{ method, route: path template, status, durationMs, requestId }`. Errors are logged once, here, at `error` for 5xx and not at all for 4xx.
  - Security headers on every response: `content-security-policy: default-src 'none'; frame-ancestors 'none'`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`, `cross-origin-resource-policy: same-origin`, `x-frame-options: DENY`, plus `strict-transport-security: max-age=31536000; includeSubDomains` when NODE_ENV is production. No `x-powered-by`.
  - CORS: echo `access-control-allow-origin` only for an exact match in `CORS_ORIGINS`, with `vary: origin`. Preflight `OPTIONS` from an allowed origin → 204 with allowed methods and headers; from any other origin → 204 without CORS headers.
  - `src/platform/http/express/express-server.ts` implements `HttpServerPort` with Express 5. Path `{key}` becomes `:key`. Uses `express.json({ limit: BODY_LIMIT_BYTES })`. A JSON parse error → `VALIDATION_FAILED`; over the limit → `PAYLOAD_TOO_LARGE`; an unmatched route or method → `NOT_FOUND`. All of these are problem responses produced by the pipeline's error mapping. `trust proxy` = `TRUST_PROXY`.
  - DI with awilix 13.0.5: `createContainer({ injectionMode: InjectionMode.PROXY, strict: true })` in `src/platform/di/container.ts`, exposing `createRootContainer(config, logger)` and `createRequestScope(root, values)`. Factories take the cradle: `({ clock, logger }) => …`. The `Cradle` interface lives in `src/platform/di/cradle.ts`; modules extend it by declaration merging in their manifest file.
  - `src/platform/kernel/module.ts`: `interface ModuleManifest { name: string; register(container, config): void; routes(container): RouteDefinition[]; readiness?(container): ReadinessCheck[] }`. `ReadinessCheck = { name: string; check(): Promise<void> }`. `src/modules/index.ts` exports `enabledModules: ModuleManifest[]`, followed by the line `// plinth:modules (generator inserts above)`.
  - `src/modules/health/`: `GET /livez` → 200 `{ status: "ok" }`. `GET /readyz` runs every module's readiness checks in parallel, each with a 1000 ms timeout: all pass → 200 `{ status: "ready", checks: { <name>: "ok" } }`; any fail → 503, `retry-after: 5`, body `{ status: "unready", failing: [names] }` with no error messages. Both routes are `auth: "public"` and outside `/v1`.
  - `src/main/api.ts` (composition root): load config → logger → container → register `enabledModules` → server → listen. On SIGTERM or SIGINT it stops accepting connections, waits up to 10 s for in-flight requests, closes, and exits 0.
  - Tests start servers with `listen(0)` and call them with global `fetch`. The helper `test/support/http.ts` exports `startTestServer(routes, configOverrides)`.
  - Dependencies: `express` 5.3.0, `@types/express` 5.0.6 (dev), `awilix` 13.0.5.
- Files in scope: `src/platform/kernel/**`, `src/platform/http/**`, `src/platform/di/**`, `src/modules/index.ts`, `src/modules/health/**`, `src/main/api.ts`, `test/support/**`, `package.json`, `pnpm-lock.yaml`
- Must not touch: `src/platform/config/schema.ts` (no new keys needed), `scripts/kit/**`
- Test cases:
  1. GET an unknown path → 404, content-type `application/problem+json`, code NOT_FOUND, body requestId equals the `x-request-id` response header — 404 shape and correlation
  2. Handler throws `AppError(platformErrors.CONFLICT)` → 409 problem with code CONFLICT, nothing logged at error — error mapping and log noise
  3. Handler throws `new Error("db password=x")` → 500, response body does not contain `password`, exactly one error log line carrying the requestId — internal leak, double logging
  4. POST body with a field the strict schema lacks → 400 VALIDATION_FAILED, `errors[0].path` names the field — mass assignment
  5. POST a malformed JSON body → 400 VALIDATION_FAILED, not 500 — malformed body crashes
  6. Body of exactly BODY_LIMIT_BYTES → accepted; one byte more → 413 PAYLOAD_TOO_LARGE — size boundary
  7. Incoming `x-request-id: abc` → replaced by a UUIDv7; `req-12345678` → echoed unchanged — header injection
  8. Any response → has nosniff and `default-src 'none'`, has no `x-powered-by` — missing security headers
  9. Origin in CORS_ORIGINS → allow-origin echoed; other origin → no allow-origin; preflight from allowed origin → 204 — CORS bypass
  10. `/readyz` with one check rejecting and one hanging 5 s → 503 within 1500 ms, `retry-after: 5`, `failing` lists both names, no error text — hung dependency, leaked internals
  11. Handler returns a body violating its response schema with NODE_ENV test → 500 and an error log — contract drift
  12. SIGTERM during an in-flight 300 ms request (spawned `src/main/api.ts`) → the request completes 200 and the process exits 0 — dropped requests on deploy
- Acceptance: `pnpm check`
- Manual check: `mise x -- node src/main/api.ts`, then open `http://localhost:3000/livez` → `{"status":"ok"}`

### P0-03 OpenAPI document and API docs

- Type: feat
- Spec: §2, §6.13, §18, §16 F04
- Depends on: P0-02
- Size: S
- Risk: low
- Tier: any
- Follow: `src/modules/health/http/routes.ts` (route definition style), `src/platform/http/pipeline.ts` (how routes are consumed)
- Decisions:
  - `zod-openapi` 6.0.2. `src/platform/openapi/build-document.ts` exports `buildDocument(routes, version)`, which returns OpenAPI `3.1.0` with `info { title: "Plinth API", version }` from package.json and `servers [{ url: "/" }]`. `operationId` = method plus path, lower-case, with non-alphanumerics as `_` (for example `get_v1_plans_key`). Each `errors` entry adds a response at its status that references `components.schemas.ProblemDetails`.
  - `assertRouteDocs(routes)` throws one error listing every route with an empty summary, description or tags, or a response without an example. `src/main/api.ts` calls it at boot.
  - `scripts/openapi.ts` writes `openapi.json` with sorted keys, 2-space indent and a trailing newline; `--check` compares instead and exits 1 naming the first differing JSON path. Add package scripts `openapi` and `openapi:check`, and add an `openapi` stage after `tests` in `scripts/kit/check.ts`.
  - When `PUBLIC_DOCS` is true: `GET /openapi.json` serves the in-memory document; `GET /docs` serves HTML containing `<script id="api-reference" data-url="/openapi.json"></script><script src="/docs/scalar.js"></script>`; `GET /docs/scalar.js` serves the standalone bundle from `@scalar/api-reference` 1.77.0. Confirm the file path inside the package with `pnpm run docs @scalar/api-reference` before coding. `/docs` and `/docs/scalar.js` override the CSP to `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:`. When false, all three are 404.
  - Dependencies: `zod-openapi` 6.0.2, `@scalar/api-reference` 1.77.0.
- Files in scope: `src/platform/openapi/**`, `src/platform/http/**`, `src/modules/health/http/**`, `src/main/api.ts`, `scripts/openapi.ts`, `scripts/__tests__/openapi.test.ts`, `scripts/kit/check.ts`, `openapi.json`, `package.json`, `pnpm-lock.yaml`
- Must not touch: `src/platform/kernel/http.ts`
- Test cases:
  1. A route with an empty description → `assertRouteDocs` throws naming its method and path — undocumented route ships
  2. A response without an example → throws — incomplete docs
  3. Route with `errors: [platformErrors.NOT_FOUND]` → document has a `404` response referencing ProblemDetails — errors undocumented
  4. Building the document twice → byte-identical JSON — nondeterministic diff
  5. Committed `openapi.json` edited by hand → `openapi:check` exits 1 naming the differing path — contract drift
  6. PUBLIC_DOCS false → `/docs`, `/docs/scalar.js` and `/openapi.json` return 404 — docs exposed when disabled
  7. GET `/docs` → 200 text/html, CSP contains no `unsafe-eval` — CSP weakened
- Acceptance: `pnpm check`
- Manual check: run the API, open `http://localhost:3000/docs`, and see `/livez` and `/readyz` listed

### P0-04 Postgres, Drizzle, migrate process and history declarations

- Type: feat
- Spec: §5, §3.6, §6.10, §18, §16 F06
- Depends on: P0-02
- Size: M
- Risk: high
- Tier: strong
- Follow: `src/platform/config/schema.ts` (adding keys), `src/modules/health/health.module.ts` (readiness registration)
- Decisions:
  - Dependencies: `drizzle-orm` 0.45.4, `pg` 8.23.1, `drizzle-kit` 0.31.11 (dev), `@types/pg` 8.23.1 (dev), `testcontainers` and `@testcontainers/postgresql` 12.2.1 (dev). Image `postgres:18.7-alpine` everywhere (compose, Testcontainers, CI).
  - Config adds `DATABASE_URL` (required; must start with `postgres://` or `postgresql://`) and `DATABASE_POOL_MAX` (int 1–100, default 10).
  - `src/platform/db/client.ts`: `createDatabase(config)` returns `{ db, pool, close() }`, registered as singleton `database`. It contributes readiness check `postgres` (`select 1`) through a `platform` manifest in `src/platform/platform.module.ts`, listed first in `enabledModules`.
  - `src/platform/db/columns.ts`: `idColumn()` (uuid primary key, value from `IdGenerator`, no DB default), `timestampColumns()` (`created_at`, `updated_at` timestamptz not null default `now()`), `citext(name)` custom type. The first migration runs `create extension if not exists citext`.
  - `src/platform/db/history.ts`: `declareHistory(table, { mode: "tracked", columns })` or `declareHistory(table, { mode: "untracked", reason })`. `columns` is a mapped type requiring every column of the table to be `"track" | "redact" | "ignore"`. Declarations go into a module-level registry read by tests.
  - `drizzle.config.ts`: schema `./src/modules/*/infra/schema.ts`, out `./drizzle`, dialect `postgresql`. Package scripts: `db:generate` = `drizzle-kit generate`, `db:migrate` = `node src/main/migrate.ts`.
  - `src/main/migrate.ts` applies migrations with drizzle's node-postgres migrator inside `pg_advisory_lock(727274)`, releases the lock in `finally`, and exits 0 on success and 1 on failure, logging the failing migration's name.
  - Test harness: vitest `globalSetup` in `test/support/postgres-global.ts` starts one Postgres container per run and applies migrations to database `plinth_template`; `test/support/postgres.ts` exports `createTestDatabase()`, which runs `CREATE DATABASE <random> TEMPLATE plinth_template` per test file. Integration tests are named `*.int.test.ts`.
  - `src/platform/db/__tests__/history-declarations.int.test.ts` imports every `src/modules/*/infra/schema.ts` and fails listing each exported pgTable without a declaration.
  - `compose.yml`: service `postgres` with a healthcheck and named volume, port 5432.
- Files in scope: `src/platform/db/**`, `src/platform/platform.module.ts`, `src/platform/config/**`, `src/modules/index.ts`, `src/main/migrate.ts`, `src/main/api.ts`, `drizzle.config.ts`, `drizzle/**`, `test/support/**`, `vitest.config.ts`, `compose.yml`, `.env.example`, `package.json`, `pnpm-lock.yaml`
- Must not touch: `src/platform/http/**`
- Test cases:
  1. DATABASE_URL missing → ConfigError naming DATABASE_URL — boot without a database
  2. DATABASE_URL `mysql://u@h/db` → ConfigError — wrong dialect accepted
  3. Fresh database → migrate exits 0 and applies all migrations; a second run → exits 0 and applies none — non-idempotent migrate
  4. Two migrate processes started together on an empty database → both exit 0 and each migration is recorded once — concurrent deploy race
  5. A migration file with invalid SQL in its second statement → exit 1 and its first statement is rolled back — partial migration
  6. A test-only schema module exporting a pgTable without `declareHistory` → the declarations test fails naming that table — undeclared table
  7. A tracked declaration omitting one column → `tsc` error (asserted with `@ts-expect-error`) — unclassified column
  8. Postgres stopped → `/readyz` 503 listing `postgres`; restarted → 200 — database outage
  9. In a citext column, insert `A@X.com`, query `a@x.COM` → one row — case-sensitive email duplicates
- Acceptance: `pnpm check` (needs Docker running)
- Manual check: none

### P0-05 Container image, smoke test, GHCR release and rollback

- Type: ci
- Spec: §12, §17, §16 F07
- Depends on: P0-03, P0-04
- Size: M
- Risk: high
- Tier: any + review
- Follow: `.github/workflows/ci.yml` (job layout, pinned actions with version comments)
- Decisions:
  - `Dockerfile`, multi-stage. Base `node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5`. Install pnpm with `npm install -g pnpm@12.21.0` (Node 26 ships no corepack), then `pnpm install --prod --frozen-lockfile --ignore-scripts`. Copy `src/`, `drizzle/`, `package.json`. Run as `USER node`. `ENV NODE_ENV=production`. `HEALTHCHECK` calls `/livez` with `node -e` and `fetch`. `CMD ["node", "src/main/api.ts"]`; `migrate` runs as `node src/main/migrate.ts` from the same image. No build step: Node strips types at run time.
  - `.dockerignore` excludes everything except what the image copies.
  - `compose.yml` gains profile `app` with services `migrate` (runs once, depends on healthy postgres) and `api` (depends on migrate completing successfully), port 3000.
  - `scripts/smoke.ts <baseUrl> [--timeout-ms N]` (default 30000): polls `/readyz` every 500 ms until 200 or timeout, then asserts `/livez` 200 and `/openapi.json` 200. It prints one line per assertion and exits 0 or 1; on failure it prints no stack trace.
  - CI job `smoke` in `.github/workflows/ci.yml`: `docker compose --profile app up -d --build`, then `node scripts/smoke.ts http://localhost:3000`, then assert the image user id is not 0 and the gzip size of `docker save` is ≤ 250 MB. On failure it prints compose logs; it always runs `down -v`.
  - `.github/workflows/release.yml`: on push of tag `v*.*.*`, runs `pnpm check`, then builds and pushes `ghcr.io/devnadeemashraf/plinth:<X.Y.Z>` and `:latest`. Permissions `contents: read`, `packages: write`. Uses `docker/login-action`, `docker/setup-buildx-action` and `docker/build-push-action`, each pinned by full SHA to the newest release at least 7 days old (find with `gh api repos/<owner>/<repo>/releases`), with the version in a trailing comment.
  - `.github/dependabot.yml` gains a `docker` entry with the same schedule, cooldown and major-version ignore as the npm entry.
  - HANDBOOK chapter 8 gains "Release" and "Roll back" procedures. Roll back means `docker buildx imagetools create -t ghcr.io/devnadeemashraf/plinth:latest ghcr.io/devnadeemashraf/plinth:<previous>`, then redeploying that tag.
- Files in scope: `Dockerfile`, `.dockerignore`, `compose.yml`, `scripts/smoke.ts`, `scripts/__tests__/smoke.test.ts`, `.github/workflows/**`, `.github/dependabot.yml`, `docs/HANDBOOK.md`
- Must not touch: `src/**`
- Test cases:
  1. Server whose `/readyz` returns 503 for 2 s, then 200 → smoke exits 0 — slow boot reported as failure
  2. Server whose `/readyz` always returns 503, `--timeout-ms 1000` → exit 1 within 2 s, message names `/readyz` — hung deploy passes
  3. Unreachable base URL → exit 1, output contains no stack trace — noisy failure
  4. Built image → `id -u` is not 0 (CI assertion) — container runs as root
  5. Built image → gzip size ≤ 250 MB (CI assertion) — image bloat
- Acceptance: `pnpm check`, and the CI `smoke` job is green on the PR
- Manual check: after merge, tag `v0.1.0`, then tag `v0.1.1` on a later commit; confirm both images exist under the repo's Packages; follow HANDBOOK "Roll back" to point `latest` at `0.1.0`; confirm with `docker buildx imagetools inspect ghcr.io/devnadeemashraf/plinth:latest`.

### P0-06 Public plan catalog (reference slice)

- Type: feat
- Spec: §6.5, §5, §20, §16 F08
- Depends on: P0-03, P0-04, P0-05
- Size: M
- Risk: low
- Tier: strong
- Follow: `src/modules/health/` (manifest and route files), `src/platform/db/columns.ts` and `src/platform/db/history.ts` (table conventions)
- Decisions:
  - This item is the reference slice that every later item copies, so build each layer to the full standard of AGENTS.md §7.
  - `src/modules/entitlements/domain/plan.ts`: `type PlanAudience = "user" | "tenant"`; `interface Plan { readonly id; key; name; audience; isDefault; sort }`. `domain/errors.ts`: `entitlementsErrors = defineErrors({ PLAN_NOT_FOUND: { status: 404, title: "Plan not found" } })`.
  - `application/ports.ts`: `interface PlanRepository { list(filter: { audience?: PlanAudience }): Promise<Plan[]>; findByKey(key: string): Promise<Plan | undefined> }`. One use case per file: `application/list-plans.ts` exports `listPlans({ planRepository })`, returning `(input) => Promise<Plan[]>` ordered by `sort` ascending, then `key` ascending; `application/get-plan.ts` exports `getPlan(...)`, which throws `AppError(entitlementsErrors.PLAN_NOT_FOUND)`. Neither logs.
  - `infra/schema.ts`: table `plans` with `id`, `key` text unique, `name` text, `audience` text with `CHECK (audience in ('user','tenant'))`, `is_default` boolean not null default false, `sort` integer not null default 0, and timestamps. Partial unique index on `audience` where `is_default`. `declareHistory` tracked: all columns `track`, timestamps `ignore`. `infra/drizzle-plan-repository.ts` implements the port.
  - The migration seeds one row: key `free`, name `Free`, audience `user`, `is_default` true, sort 0, with the fixed id `01930000-0000-7000-8000-000000000001`.
  - `http/schemas.ts`: `planSchema` (output `{ key, name, audience, isDefault, sort }`, strict, never `id` or timestamps), `listPlansQuerySchema` (`audience?`), `planParamsSchema` (`key` matches `^[a-z][a-z0-9_]{1,39}$`). `http/routes.ts`: `GET /v1/plans` → 200 `{ data: Plan[], nextCursor: null }` and `GET /v1/plans/{key}` → 200 Plan, both `auth: "public"`, tag `Plans`, header `cache-control: public, max-age=60`.
  - `entitlements.module.ts` registers `planRepository` (singleton) and the use cases; `index.ts` exports only the types `Plan` and `PlanAudience`. Add the manifest to `enabledModules`.
  - Extend `scripts/smoke.ts` to assert that `GET /v1/plans` contains key `free`.
  - HANDBOOK (triggers: new module, first flow): chapter 4 traces `GET /v1/plans/{key}` from adapter to repository; chapter 5 gets `### Module: entitlements`; chapter 7 gets recipe "Add a read endpoint", built from this slice.
- Files in scope: `src/modules/entitlements/**`, `src/modules/index.ts`, `drizzle/**`, `openapi.json`, `scripts/smoke.ts`, `scripts/__tests__/smoke.test.ts`, `docs/HANDBOOK.md`
- Must not touch: `src/platform/**`
- Test cases:
  1. Seeded database → GET `/v1/plans` → 200 `{ data: [{ key: "free", … }], nextCursor: null }` — seed missing in fresh installs
  2. Fake repository with plans (b, sort 2), (c, sort 1), (a, sort 1) → `listPlans` returns a, c, b — nondeterministic order
  3. `?audience=tenant` with only user plans → 200 `data: []` — empty filter treated as error
  4. `?audience=admin` → 400 VALIDATION_FAILED with path `audience` — invalid enum accepted
  5. GET `/v1/plans/FREE` → 400 VALIDATION_FAILED — key format not enforced
  6. Key of 40 valid chars that does not exist → 404 PLAN_NOT_FOUND; 41 chars → 400 — length boundary
  7. Insert a second `is_default` plan for audience `user` → unique violation — two default plans
  8. Any plan response → has no `id`, `created_at` or `updated_at` — internal field leak
  9. `plans` → declared tracked with every column classified — history foundation skipped
- Acceptance: `pnpm check`
- Manual check: `docker compose --profile app up --build`, open `http://localhost:3000/docs`, run GET `/v1/plans`, see `free`

## Phase 1 — MVP (MUST)

The phase gate splits these epics into items. Cut line: v1's definition of done (SPEC §16) holds after E09.

- E01 Platform data services: Redis, BullMQ worker, outbox, idempotency, rate limits; adds `check:slow` with Stryker — Spec: §6.13, §3.6, §16 F09
- E02 Activity history: TrackedRepository, unit of work, pipeline capture, read APIs, e2e activity assertion, retention — Spec: §6.10, §16 F10
- E03 Users, email + password, sessions and devices — Spec: §6.1, §6.2, §6.7, §16 F11, F12, F13
- E04 Notifications, email OTP, magic link, step-up, account deletion — Spec: §6.1, §6.11, §16 F14, F15, F16
- E05 Access: permission registry, role compiler, bitsets, system roles, rbac commands — Spec: §6.4, §16 F17
- E06 Entitlements: registry, assignments, overrides, resolver — Spec: §6.5, §16 F18
- E07 Tenancy: modes, onboarding, limits, invites, lifecycle — Spec: §6.3, §16 F19
- E08 CLI: `plinth init`, `g module`, `g migration` — Spec: §10, §16 F20
- E09 Reference deployment, starting with a host spike — Spec: §12, §17, §16 F21

## Phase 2 — SHOULD

- E10 Fastify adapter and HTTP conformance — Spec: §2, §3.5, §16 F30
- E11 Admin API, platform roles, admin second step — Spec: §7.2, §6.4, §16 F31
- E12 Feature flags — Spec: §6.9, §16 F32
- E13 Files and avatar — Spec: §6.8, §6.7, §16 F33
- E14 Billing with Stripe — Spec: §6.6, §6.3, §16 F34
- E15 OAuth Google and GitHub — Spec: §6.1, §16 F35
- E16 Custom roles and role settings — Spec: §6.4, §16 F36
- E17 Resend email adapter — Spec: §6.11, §16 F37
- E18 Telemetry, metrics, Sentry — Spec: §8, §16 F38
- E19 Remaining generators — Spec: §10, §16 F39
- E20 Admin activity explorer and export — Spec: §6.10, §16 F40

## Phase 3 — LATER

- E21 Admin console — Spec: §7, §16 F50
- E22 Realtime gateway — Spec: §6.12, §16 F51
- E23 Phone OTP and username login — Spec: §6.1, §16 F52
- E24 Observability bundle — Spec: §8, §16 F53
- E25 k6 budgets — Spec: §13, §16 F54
- E26 Postgres RLS — Spec: §6.3, §16 F55
- E27 Config-matrix suite — Spec: §9, §16 F56
- E28 llms.txt, devcontainer, automated releases — Spec: §10, §11, §16 F57
- E29 Agent tooling and design skills review — Spec: §7.7, §11, §16 F58

## Phase 4 — Brush-up

- E30 Performance tuning against measured k6 results, refactors flagged at gates, error-message and docs polish — Spec: §13
