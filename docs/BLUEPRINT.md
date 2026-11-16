# Blueprint

The ordered list of PRs. `pnpm brief` prints the next item. Plan lint (`pnpm check`) enforces the format.
Done items collapse to one line: `- <ID> <title> — #<PR> — <F-ids>`.

## Writing items (phase gate only; implementing sessions skip this section)

- An item is executable by a model that has read only AGENTS.md and `pnpm brief`. Use the fields and order of the existing items; plan lint rejects missing fields.
- Size S (one session) or M (two to four). Split anything larger. Risk is high if it touches auth, permissions, payments, the data model or migrations, deletion, secrets, concurrency or a public interface. High risk → Tier `strong`, or `any + review`.
- Decisions leave nothing consequential to choose: data shapes, names, libraries with exact versions (the newest release at least 7 days old, checked with `npm view <pkg> time`), patterns, error behavior.
- An item that adds a dependency is checked before it is written: on a scratch branch, run `pnpm add -E <pkg>@<version>` and then `pnpm install --frozen-lockfile`. If pnpm refuses a build script, the item says what to do (usually deny it in `allowBuilds`) and lists `pnpm-workspace.yaml` in Files in scope. Also record the file path or export the item relies on (for example a bundled asset), as checked.
- Files in scope are backticked paths or globs. An existing test file may change only if its exact path is listed.
- Order within a phase: what unblocks the most later items, then the highest technical risk, then user value. Authentication and authorization, input validation, secrets handling, data integrity and migrations, the error convention and tests on critical paths are never deferred. No "set up X" item exists unless a delivering item depends on it. Anything unproven (an API limit, a library's behavior, a budget) gets a time-boxed spike item first, whose output is a HANDBOOK Decisions entry.
- Test cases: derive them, don't brainstorm them. For each input and piece of state, list the equivalence classes and boundaries; for each dependency, its failure modes; for each actor, its authorization states. Write one case per class that could fail differently, choosing the boundary over a typical value. Walk this list: invalid input, empty or oversized data, unauthorized actor, duplicate or retried request, concurrent action, dependency slow or down, partial failure midway. If two cases guard the same risk, keep the harsher one. Where a rule can be stated generally (parsing, money, dates, permissions, state transitions), use one property-based test. Never test the framework, trivial accessors, or a mock of the thing under test. Write each case as `given state and input → expected result — risk in ≤ 8 words`; aim for 4–10, never more than 12.
- Cite the SPEC as `§<n>` and `§16 F<nn>`. Every MUST feature ID must be cited by an open item, an epic or a Done line.

## Done

- P0-01 Kernel, config and logger — #1 — F01
- P0-02 HTTP port, pipeline, Express adapter, DI and health — #3 — F02, F03, F05
- P0-03 OpenAPI document and API docs — #5 — F04
- P0-04 Postgres, Drizzle, migrate process and history declarations — #9 — F06
- P0-05 Container image, smoke test, GHCR release and rollback — #10 — F07
- P0-06 Public plan catalog (reference slice) — #11 — F08

## Phase 0 — Walking skeleton and reference slice

## Phase 1 — MVP (MUST)

Items P1-01 to P1-21 deliver E01–E03, plus F15 (email notifications), which sign-up needs. The remaining epics are split at the gate that `pnpm brief` calls once these items are done. Cut line: v1's definition of done (SPEC §16) holds after E09.

- E04 Email OTP, magic link, step-up, account deletion — Spec: §6.1, §16 F14, F16
- E05 Access: permission registry, role compiler, bitsets, system roles, rbac commands; records `denied` outcomes — Spec: §6.4, §6.10, §16 F17
- E06 Entitlements: registry, assignments, overrides, resolver; replaces the fixed device limit of P1-17 — Spec: §6.5, §16 F18
- E07 Tenancy: modes, onboarding, limits, invites, lifecycle, tenant activity read API — Spec: §6.3, §6.10, §16 F19
- E08 CLI: `plinth init`, `g module`, `g migration` — Spec: §10, §16 F20
- E09 Reference deployment, starting with a host spike — Spec: §12, §17, §16 F21

### P1-01 Image scan, zlib fix, cold-start budget and schema drift check

- Type: ci
- Spec: §12, §17, §18, §16 F07, F06
- Depends on: none
- Size: S
- Risk: low
- Tier: any
- Follow: `.github/workflows/ci.yml` (steps named after test cases), `scripts/smoke.ts` (one line per assertion, no stack traces), `test/support/process.ts` (`spawnApi`)
- Decisions:
  - The phase 0 gate found the image ships `zlib 1.3.2-r1` from the pinned base (ALPINE-CVE-2026-4738, critical, fixed in `1.4-r0`). In the `Dockerfile` runtime stage, before `USER node`, add `RUN apk upgrade --no-cache zlib`. Keep the base digest.
  - CI `smoke` job: after the size step, add step `"[P1-01 #1] image has no known vulnerability"` running `osv-scanner scan image --config osv-scanner.toml plinth:local`. osv-scanner comes from `mise.toml` through mise-action. An unfixable finding is accepted only by an `osv-scanner.toml` ignore with a reason and an expiry date, like the existing ones.
  - `scripts/db-drift.ts [--schema <glob>]` (default `./src/modules/*/infra/schema.ts`): copies `drizzle/` to `node_modules/.cache/plinth-drift/`, runs `drizzle-kit generate --dialect postgresql --schema <glob> --out ./node_modules/.cache/plinth-drift` (the out path must be relative: drizzle-kit 0.31.11 breaks on absolute Windows paths), deletes the copy, prints one line and exits 0 only when the output contains `No schema changes`. Otherwise it prints `✗ schema.ts and drizzle/ differ: run mise x -- pnpm run db:generate` and exits 1.
  - `scripts/kit/check.ts`: new stage `migrations` after `openapi`, command `drizzle-kit check && node scripts/db-drift.ts`.
  - `test/e2e/cold-start.e2e.test.ts`: on a `createTestDatabase()` copy, `spawnApi({ DATABASE_URL, PORT })` with a free port; poll `/readyz` every 50 ms from the moment of spawn.
  - HANDBOOK chapter 8 "Container image" and "Database and migrations": one sentence each on the scan and the drift stage.
- Files in scope: `Dockerfile`, `.github/workflows/ci.yml`, `scripts/db-drift.ts`, `scripts/__tests__/db-drift.test.ts`, `scripts/__tests__/fixtures/**`, `scripts/kit/check.ts`, `test/e2e/cold-start.e2e.test.ts`, `osv-scanner.toml`, `docs/HANDBOOK.md`
- Must not touch: `src/**`, `drizzle/**`
- Test cases:
  1. Built image → `osv-scanner scan image` reports nothing (CI step) — critical CVE shipped in the image
  2. Committed schemas and migrations → `db-drift` exits 0 — false alarm blocks every PR
  3. `--schema` pointing at a fixture equal to `plans` plus one extra column → exit 1, output names `db:generate` — schema changed without a migration
  4. API spawned against a migrated database → `/readyz` 200 within 3000 ms of spawn — slow cold start
- Acceptance: `pnpm check`, and the CI `smoke` job is green on the PR
- Manual check: `docker build -t plinth:local .`, then `mise x -- osv-scanner scan image plinth:local` reports no vulnerabilities

### P1-02 Redis-protocol cache, readiness check and test harness

- Type: feat
- Spec: §2, §3.4, §6.13, §16 F09
- Depends on: none
- Size: M
- Risk: low
- Tier: any
- Follow: `src/platform/platform.module.ts` (singleton with disposer, readiness check), `src/platform/db/client.ts`, `test/support/postgres-global.ts`
- Decisions:
  - Dependency `ioredis` 6.0.0 (checked: installs with no build script). Server image `valkey/valkey:9.1.3-alpine` (Redis protocol, ships `redis-server` and `valkey-cli`, logs `Ready to accept connections` when up). Both have planned VERSIONS lines: move them to their sections and drop the versions.
  - Config `REDIS_URL`: required, must start with `redis://` or `rediss://` and parse as a URL, reported like `DATABASE_URL`. Regenerate `.env.example`. Add a placeholder `redis://127.0.0.1:1` where tests and `scripts/openapi.ts` already pass a placeholder `DATABASE_URL`.
  - `src/platform/redis/client.ts`: `createRedis(config, logger)` → `new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false })`; an `error` listener logs at `warn` (like the pg pool). Platform module registers `redis` (singleton, disposer `quit()`) and a second readiness check `redis` (`PING`).
  - Port `Cache` in `src/platform/kernel/ports/cache.ts`: `get(key): Promise<string | undefined>`, `set(key, value, ttlSeconds): Promise<void>`, `delete(key): Promise<void>`. Adapter `RedisCache` in `src/platform/redis/redis-cache.ts`, registered as `cache`. Values are strings; callers serialize. Every key is prefixed with `plinth:`.
  - `compose.yml`: service `redis` (image above, port 6379, healthcheck `valkey-cli ping`); the `app` anchor gets `REDIS_URL: redis://redis:6379` and `migrate` and `api` wait for it healthy.
  - Tests: `test/support/redis-global.ts` is a second vitest global setup that starts the image with testcontainers' `GenericContainer` (no extra package), waits for the log line, and provides `redisUrl`. `test/support/redis.ts` exports `createTestRedis()` returning a client whose `keyPrefix` is unique per test file.
  - HANDBOOK chapter 3: new `### Redis (src/platform/redis/)` paragraph; chapter 8: local Redis line.
- Files in scope: `src/platform/redis/**`, `src/platform/kernel/ports/cache.ts`, `src/platform/kernel/__tests__/**`, `src/platform/platform.module.ts`, `src/platform/di/**`, `src/platform/config/**`, `src/platform/db/__tests__/platform-module.int.test.ts`, `test/support/**`, `vitest.config.ts`, `scripts/openapi.ts`, `.env.example`, `compose.yml`, `package.json`, `pnpm-lock.yaml`, `docs/VERSIONS.md`, `docs/HANDBOOK.md`
- Must not touch: `src/modules/**`, `drizzle/**`
- Test cases:
  1. REDIS_URL missing → ConfigError naming REDIS_URL; `http://x` → ConfigError — boot with an unusable cache URL
  2. `set("k", "v", 1)`, read at once → `"v"`; after 1.1 s → undefined — TTL ignored, stale data served
  3. Two `createTestRedis()` clients write the same key → each reads its own value — tests leak state into each other
  4. Valkey stopped → `/readyz` 503 listing `redis`; restarted → 200 without restarting the API — cache outage crashes or sticks
  5. Valkey unreachable → `cache.get` rejects within 1 s instead of queueing — requests hang on a dead cache
  6. Container disposed → the client is closed (a later command rejects) — connection leak on shutdown
- Acceptance: `pnpm check`
- Manual check: `docker compose up -d postgres redis`, start the API with `mise x -- pnpm run dev` (with `REDIS_URL=redis://localhost:6379`), `curl -i http://localhost:3000/readyz` shows `redis: ok`; `docker compose stop redis` makes it 503

### P1-03 Mutation testing with Stryker (`check:slow`)

- Type: chore
- Spec: §9, §17, §16 F09
- Depends on: none
- Size: S
- Risk: low
- Tier: any
- Follow: `vitest.config.ts`, `package.json` scripts
- Decisions:
  - Dev dependencies `@stryker-mutator/core` 10.1.1 and `@stryker-mutator/vitest-runner` 10.1.1 (checked: install with no build script; the runner's peer is `vitest >=2`). Move their planned VERSIONS lines to Dev dependencies without versions.
  - `stryker.config.json`: `testRunner: "vitest"`, `vitest.configFile: "vitest.mutation.config.ts"`, `mutate` = `src/platform/kernel/**/*.ts`, `src/platform/http/pipeline.ts`, `src/modules/*/domain/**/*.ts`, `src/modules/*/application/**/*.ts`, each excluding `__tests__`. Reporters `clear-text`, `json`, `html` into `reports/mutation/`. `thresholds.break: null`: the gate reads survivors; it does not fail the run. `concurrency: 2`, `timeoutMS: 10000`.
  - `vitest.mutation.config.ts`: the unit tests only (`src/**/*.test.ts` excluding `*.int.test.ts` and `test/e2e/**`), no global setup, no coverage.
  - Script `"check:slow": "stryker run"`. `.gitignore` gains `reports/` and `.stryker-tmp/`.
  - If the runner fails on Vitest 5, stop and ask (AGENTS.md §11); do not change the Vitest version.
  - HANDBOOK chapter 8: "Mutation testing" paragraph: when it runs (every phase gate), where the report is, what a surviving mutant in a high-risk module means (a Fix first entry).
- Files in scope: `package.json`, `pnpm-lock.yaml`, `stryker.config.json`, `vitest.mutation.config.ts`, `.gitignore`, `docs/VERSIONS.md`, `docs/HANDBOOK.md`
- Must not touch: `src/**`
- Test cases:
  1. `mise x -- pnpm run check:slow` on this branch → exits 0 and `reports/mutation/mutation.json` lists `src/modules/entitlements/application/list-plans.ts` — mutation run broken or covering nothing
  2. Same run → no mutant of an `*.int.test.ts`-only file is reported as killed by a test that needs Docker — slow run depends on containers
- Acceptance: `pnpm check`; `check:slow` output pasted in the PR
- Manual check: `mise x -- pnpm run check:slow`, then open `reports/mutation/mutation.html`

### P1-04 Unit of work

- Type: feat
- Spec: §6.10, §6.13, §13, §16 F09
- Depends on: none
- Size: M
- Risk: high
- Tier: strong
- Follow: `src/platform/db/client.ts`, `src/platform/kernel/ports/clock.ts` (port style), `src/modules/entitlements/infra/drizzle-plan-repository.ts`
- Decisions:
  - Dev dependency `fast-check` 4.10.2 (checked: no build script). Move its planned VERSIONS line to Dev dependencies without the version.
  - Port `UnitOfWork` in `src/platform/kernel/ports/unit-of-work.ts`: `run<T>(work: () => Promise<T>): Promise<T>` and `afterCommit(callback: () => Promise<void> | void): void`. A `run` inside another `run` joins the outer transaction (no savepoint). `afterCommit` outside `run` throws `AppError(platformErrors.INTERNAL)`. Callbacks run in order after the outermost commit; a failing callback is logged at `error` and does not fail the request; on rollback they are dropped.
  - Adapter `DrizzleUnitOfWork` in `src/platform/db/unit-of-work.ts`: one `AsyncLocalStorage` holding the Drizzle transaction and its callbacks; isolation `read committed`.
  - `Database` gains `executor()`: the current transaction inside `run`, else `db`. Repositories call `database.executor()` for every query from now on; change `DrizzlePlanRepository` accordingly (its tests must still pass unchanged).
  - Platform module registers `unitOfWork` (singleton). Use cases receive it by injection; HTTP handlers never open transactions.
  - HANDBOOK chapter 3 "Database": unit of work paragraph; chapter 9 Decisions: AsyncLocalStorage over passing a transaction argument (rejected: every port method would take `tx`, leaking infra into application).
- Files in scope: `src/platform/kernel/ports/unit-of-work.ts`, `src/platform/kernel/__tests__/**`, `src/platform/db/**`, `src/platform/platform.module.ts`, `src/platform/di/cradle.ts`, `src/modules/entitlements/infra/drizzle-plan-repository.ts`, `package.json`, `pnpm-lock.yaml`, `docs/VERSIONS.md`, `docs/HANDBOOK.md`
- Must not touch: `drizzle/**`
- Test cases:
  1. `run` inserting two rows, then throwing → neither row exists and the error is rethrown unchanged — partial write survives a failure
  2. Nested `run` whose inner work throws, caught by the outer work → the whole transaction rolls back — inner failure silently committed
  3. `afterCommit` registered, then rollback → callback never runs — side effect for data that was never saved
  4. Two `afterCommit` callbacks, the first throws → second still runs, one error log, `run` resolves — one bad hook breaks the request
  5. `afterCommit` outside `run` → INTERNAL — side effect fires without a transaction
  6. 20 concurrent `run`s each inserting one row (property: any interleaving of delays) → each sees only its own uncommitted row — transactions leak across requests
  7. `executor()` outside `run` → returns `db`; inside → the transaction — repository bypasses the transaction
- Acceptance: `pnpm check`
- Manual check: none

### P1-05 Worker process, queue port and module jobs

- Type: feat
- Spec: §2, §3.4, §3.6, §6.13, §16 F09
- Depends on: P1-02
- Size: M
- Risk: high
- Tier: any + review
- Follow: `src/main/api.ts` (composition root, shutdown), `src/platform/kernel/module.ts`, `test/support/process.ts`
- Decisions:
  - Dependency `bullmq` 6.7.2 (MIT). Checked: pnpm refuses the build script of its optional native addon `msgpackr-extract`; deny it in `allowBuilds` (`msgpackr-extract: false # optional native addon of msgpackr (bullmq); msgpackr falls back to JS`). Move its planned VERSIONS line to Dependencies without the version.
  - Kernel `src/platform/kernel/jobs.ts`: `interface JobDefinition<P> { name: string; schema: ZodType<P>; attempts?: number; handler(ctx: JobContext, payload: P): Promise<void> }` with `name` as `<module>.<verb-noun>`; `JobContext { jobId; attempt; logger; container }`. `ModuleManifest` gains optional `jobs?(container): JobDefinition<unknown>[]`.
  - Port `Queue` in `src/platform/kernel/ports/queue.ts`: `enqueue(name, payload, options?: { jobId?: string; delayMs?: number }): Promise<void>`. Adapter `BullmqQueue` (`src/platform/queue/`), one BullMQ queue named `jobs`; a repeated `jobId` is a no-op (BullMQ dedupe). Defaults: `attempts` 5, exponential backoff from 1 s, `removeOnComplete: true`, `removeOnFail: false` (failed jobs are the dead-letter set). Payloads are validated with the job's schema before enqueue (INTERNAL on mismatch) and again in the worker.
  - `src/main/worker.ts`: config → logger → container → modules → one BullMQ `Worker` on `jobs` with concurrency `WORKER_CONCURRENCY` (new config key, 1–64, default 5) and its own ioredis connection with `maxRetriesPerRequest: null`. It dispatches by job name to the registered definitions; an unknown name fails the job without retry. One request-like DI scope per job. Logs one `job` line per attempt (name, jobId, attempt, outcome, durationMs), never the payload. SIGTERM, SIGINT and the IPC `"shutdown"` message close the worker (waiting for active jobs), dispose the container, exit 0.
  - `compose.yml`: service `worker` (profile `app`, command `node src/main/worker.ts`, depends on migrate completing). `package.json` script `"worker": "node --watch src/main/worker.ts"`.
  - `test/support/process.ts` gains `spawnWorker(env)` resolving on the log line `worker ready`.
  - HANDBOOK chapter 2 (processes), chapter 3 `### Jobs (src/platform/queue/)`, chapter 8 (running the worker; inspecting failed jobs).
- Files in scope: `src/platform/kernel/jobs.ts`, `src/platform/kernel/module.ts`, `src/platform/kernel/ports/queue.ts`, `src/platform/kernel/__tests__/**`, `src/platform/queue/**`, `src/platform/platform.module.ts`, `src/platform/di/**`, `src/platform/config/**`, `src/main/worker.ts`, `test/support/**`, `.env.example`, `compose.yml`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `docs/VERSIONS.md`, `docs/HANDBOOK.md`
- Must not touch: `src/modules/**`, `drizzle/**`
- Test cases:
  1. Enqueue a registered job → handler runs once with the parsed payload — job never runs
  2. Enqueue twice with the same `jobId` → handler runs once — duplicate side effects
  3. Handler throws twice, then succeeds, `attempts: 3` → succeeds on attempt 3, three `job` log lines — no retry on transient failure
  4. Handler always throws, `attempts: 2` → job ends in the failed set with its error; no further attempts — poison job retried forever
  5. Enqueue with a payload failing the schema → INTERNAL, nothing queued — malformed job reaches the worker
  6. Job name no module registered → fails at once, one attempt — unknown job retried forever
  7. SIGTERM (IPC on Windows) while a 300 ms job runs → job completes, process exits 0 — shutdown kills work midway
  8. Handler logs a payload field named `token` → `[REDACTED]`; the `job` line has no payload — secrets in job logs
- Acceptance: `pnpm check`
- Manual check: `docker compose --profile app up -d --build`, `docker compose --profile app logs worker` shows `worker ready`, `docker compose --profile app down -v`

### P1-06 Transactional outbox and event subscriptions

- Type: feat
- Spec: §3.3, §6.13, §16 F09
- Depends on: P1-04, P1-05
- Size: M
- Risk: high
- Tier: strong
- Follow: `src/platform/db/unit-of-work.ts`, `src/platform/queue/`, `src/modules/entitlements/infra/schema.ts` (table conventions)
- Decisions:
  - Kernel `src/platform/kernel/events.ts`: `interface DomainEvent { type: string; payload: unknown }` with `type` as `<module>.<entity>.<past-verb>` (`users.user.created`); `interface EventSubscription<P> { event: string; consumer: string; schema: ZodType<P>; handler(ctx: JobContext, payload: P, meta: { eventId; occurredAt }): Promise<void> }`. `ModuleManifest` gains `subscriptions?(container)`.
  - Port `Outbox` (`src/platform/kernel/ports/outbox.ts`): `stage(event: DomainEvent): Promise<void>`, valid only inside `unitOfWork.run` (INTERNAL otherwise). Adapter `DrizzleOutbox` writes to `outbox_events` (`id` uuid, `type` text, `payload` jsonb, `occurred_at` timestamptz, `published_at` timestamptz null, index on `occurred_at` where `published_at is null`), declared `untracked("delivery bookkeeping; the business change is tracked by its own table")`. Platform tables live in `src/platform/db/schema.ts`; extend the drizzle-kit `schema` glob and the history-declarations test glob to include it.
  - Relay: platform job `platform.outbox-relay`, scheduled every 1 s by a BullMQ job scheduler the worker upserts at start. One run: in one transaction, select up to 100 unpublished rows `ORDER BY occurred_at FOR UPDATE SKIP LOCKED`; for each subscription of the row's type, enqueue job `platform.deliver-event` with `jobId` `<eventId>:<consumer>`; set `published_at`. Then delete rows published more than 24 h ago (payloads may carry one-time tokens; see P1-13).
  - Delivery: `platform.deliver-event` runs the subscription handler inside `unitOfWork.run`, first inserting `(event_id, consumer)` into `outbox_consumptions` (primary key on both, untracked: "delivery bookkeeping"); a conflict means already handled, so it returns without running the handler. Delivery is at least once; the table makes handlers effectively once.
  - Migration via `db:generate`.
  - HANDBOOK chapter 3 "Events and outbox"; chapter 4 flow "From a staged event to a consumer".
- Files in scope: `src/platform/kernel/events.ts`, `src/platform/kernel/module.ts`, `src/platform/kernel/ports/outbox.ts`, `src/platform/kernel/__tests__/**`, `src/platform/db/**`, `src/platform/queue/**`, `src/platform/platform.module.ts`, `src/platform/di/**`, `src/main/worker.ts`, `drizzle.config.ts`, `drizzle/**`, `test/support/**`, `docs/HANDBOOK.md`
- Must not touch: `src/modules/**`
- Test cases:
  1. Stage an event, then the transaction rolls back → no row, no delivery — event for a change that never happened
  2. Stage and commit with two subscriptions → each consumer handles it exactly once — event lost or fanned out wrong
  3. Delivery job run twice for the same event and consumer → handler runs once — duplicate side effect on redelivery
  4. Handler throws → its `outbox_consumptions` row is rolled back and the retry runs the handler — failed delivery marked done
  5. Two relays running concurrently over 50 events → every event enqueued once per consumer, all `published_at` set — double publish under concurrency
  6. `stage` outside `unitOfWork.run` → INTERNAL — non-transactional event
  7. Event published 25 h ago → deleted by the next relay run; one published 23 h ago → kept — tokens kept forever in payloads
  8. Event type with no subscription → marked published, nothing enqueued — relay stalls on unknown types
- Acceptance: `pnpm check`
- Manual check: none

### P1-07 Sliding-window rate limits

- Type: feat
- Spec: §3.5, §6.1, §6.13, §9, §16 F09
- Depends on: P1-02
- Size: M
- Risk: high
- Tier: any + review
- Follow: `src/platform/http/pipeline.ts`, `src/platform/redis/redis-cache.ts`
- Decisions:
  - Kernel `RateLimitPolicy` becomes `{ limit: number; windowSeconds: number; by: "ip" | "actor" }`. `by: "actor"` falls back to the IP while no actor exists. Port `RateLimiter` (`src/platform/kernel/ports/rate-limiter.ts`): `consume(key: string, policy: { limit; windowSeconds }): Promise<{ allowed: boolean; retryAfterSeconds: number }>`; use cases use it directly for per-identifier limits (auth items).
  - Adapter `RedisRateLimiter` (`src/platform/redis/`): a sliding-window log in one Lua script on a sorted set (`ZREMRANGEBYSCORE` older than the window, `ZCARD`, `ZADD` only when under the limit, `PEXPIRE` the window); members are `<now ms>-<random>` so equal timestamps don't collide. Time comes from the server (`redis.call('TIME')`), not the API's clock. Keys: `plinth:rl:<operationId>:<subject>`.
  - Pipeline: for routes with `rateLimit`, consume before validation. Denied → 429 RATE_LIMITED with `retry-after: <seconds>`. Limiter unavailable → 503 UNAVAILABLE with `retry-after: 5` (fail closed: limits guard auth). The IP is the adapter's `req.ip`, which honours `TRUST_PROXY`; `x-forwarded-for` is ignored when `TRUST_PROXY` is 0. Remove `rateLimit` from `assertSupported`; document the 429 in OpenAPI for rate-limited routes (`buildDocument` adds RATE_LIMITED and UNAVAILABLE when `rateLimit` is set).
  - HANDBOOK chapter 3 "HTTP": rate limit paragraph.
- Files in scope: `src/platform/kernel/http.ts`, `src/platform/kernel/ports/rate-limiter.ts`, `src/platform/kernel/__tests__/**`, `src/platform/redis/**`, `src/platform/http/**`, `src/platform/openapi/**`, `src/platform/platform.module.ts`, `src/platform/di/**`, `test/support/**`, `docs/HANDBOOK.md`
- Must not touch: `src/modules/**`
- Test cases:
  1. Property (fast-check): any sequence of request times → allowed count in every window of `windowSeconds` ≤ `limit` — window math lets bursts through
  2. Limit 3/60 s: 3 requests → 200; 4th → 429 RATE_LIMITED with `retry-after` between 1 and 60 — no enforcement or bad retry hint
  3. 20 concurrent requests, limit 5 → exactly 5 allowed — race lets extra requests in
  4. `TRUST_PROXY` 0 and a spoofed `x-forwarded-for` per request → still limited as one client — limit bypass via spoofed header
  5. `TRUST_PROXY` 1, two different forwarded client IPs → limited separately — one client's abuse blocks everyone behind the proxy
  6. Redis down → 503 UNAVAILABLE `retry-after: 5`, handler not called — brute force allowed during cache outage
  7. Denied request → handler not called and no validation error even with an invalid body — limit checked after expensive work
  8. Route with `rateLimit` → OpenAPI lists 429 and 503 problems — undocumented failure modes
- Acceptance: `pnpm check`
- Manual check: none (exercised by the auth items)

### P1-08 Activity store, context and explicit events

- Type: feat
- Spec: §5, §6.10, §16 F10
- Depends on: P1-04
- Size: M
- Risk: high
- Tier: strong
- Follow: `src/modules/entitlements/` (module layout), `src/platform/db/unit-of-work.ts`
- Decisions:
  - Kernel `src/platform/kernel/activity.ts`: `type ActorType = "user" | "platform_admin" | "system" | "job" | "webhook" | "anonymous"` (`anonymous` is pending a SPEC answer; see HANDOFF), `type Surface = "api" | "admin" | "worker" | "webhook"`, `type Outcome = "success" | "denied" | "failed"`, `interface ActivityContext { actor: { type; id: string | null; sessionId: string | null }; surface; tenantId: string | null; requestId: string | null; traceId: string | null; ip: string | null; userAgent: string | null }`, `interface ActivityRecord { action; targetType; targetId; outcome; changes?: { field; before; after }[]; metadata?: Record<string, unknown>; tenantId? }`, plus `activityContext` (an `AsyncLocalStorage<ActivityContext>`) and port `HistorySink { stage(record: ActivityRecord): Promise<void> }`.
  - Module `activity`: table `activity_events` with the SPEC §5 columns, `id` uuid, primary key `(occurred_at, id)`, `PARTITION BY RANGE (occurred_at)`; indexes `(actor_id, occurred_at desc)`, `(tenant_id, occurred_at desc)`, `(target_type, target_id, occurred_at desc)`, `(request_id)`. Declared `untracked("it is the history")`. The migration (custom SQL, `drizzle-kit generate --custom`) creates the parent table, a `DEFAULT` partition, function `activity_ensure_partitions(months_ahead int)` creating `activity_events_yYYYYmMM` for the current month through `months_ahead`, calls it with 2, and a trigger rejecting `UPDATE` and `DELETE` with SQLSTATE `P0001` and message `activity_events is append-only`. `CHECK`s for actor type, surface and outcome.
  - `DrizzleHistorySink` inserts through `database.executor()`, so a record commits or rolls back with the change. Outside a transaction it inserts on its own. Fields missing from the record come from `activityContext`; with no context, actor `system` and surface `worker`.
  - Public API (index): type exports plus `ActivityRecorder` (`record(record)`), registered as `activityRecorder`; the module also registers `historySink`. Only this module writes `activity_events`.
  - `metadata` and `changes` values pass through the logger's redaction rules for keys (`password`, `token`, `secret`, `hash`, …): such keys are stored as `"[REDACTED]"`.
  - HANDBOOK chapter 5 `### Module: activity`; chapter 9 Decisions: partitions created ahead by the migration and the P1-11 job, `DEFAULT` partition as a safety net.
- Files in scope: `src/platform/kernel/activity.ts`, `src/platform/kernel/__tests__/**`, `src/platform/di/cradle.ts`, `src/modules/activity/**`, `src/modules/index.ts`, `drizzle/**`, `docs/HANDBOOK.md`
- Must not touch: `src/platform/http/**`
- Test cases:
  1. Record inside `unitOfWork.run` that then throws → no activity row — history of a change that never happened
  2. Record inside a committed run → one row with context fields filled from `activityContext` — attribution lost
  3. `UPDATE activity_events …` and `DELETE …` as the app connection → both fail with `activity_events is append-only` — history tampering
  4. Insert with `occurred_at` 5 months ahead → lands in the `DEFAULT` partition, no error — write fails when partitions run out
  5. Metadata `{ password: "x", nested: { token: "y" } }` → stored values `[REDACTED]` — secret leakage in history
  6. `actor_type` `root` → check violation — invalid attribution stored
  7. Record with no `activityContext` → actor `system`, surface `worker` — null attribution from jobs
- Acceptance: `pnpm check`
- Manual check: none

### P1-09 Tracked repositories: automatic entity history

- Type: feat
- Spec: §6.10, §16 F10
- Depends on: P1-08
- Size: M
- Risk: high
- Tier: strong
- Follow: `src/platform/db/history.ts`, `src/modules/entitlements/infra/drizzle-plan-repository.ts`
- Decisions:
  - `src/platform/db/tracked-repository.ts`: abstract class `TrackedRepository<T extends PgTable>` constructed with `{ database, unitOfWork, historySink }`, the table and a `targetType` (`<module>.<entity>`). Protected `insertTracked(values)`, `updateTracked(id, patch)`, `deleteTracked(id)` each run inside `unitOfWork.run`, read the row before (`SELECT … FOR UPDATE` for update and delete), write, and stage one record: action `<targetType>:create|update|delete`, outcome `success`, `changes` from the table's history declaration: `track` → before and after values, `redact` → `{ field, redacted: true }` with no values, `ignore` → left out. An update that changes only ignored columns stages nothing. Throws INTERNAL at construction if the table is not declared `tracked`.
  - Diffs compare JSON-serialized values (dates as ISO strings).
  - Retrofit nothing: `plans` has no write path yet.
  - HANDBOOK chapter 3 "Database": tracked repositories; chapter 7 recipe "Track a table".
- Files in scope: `src/platform/db/**`, `docs/HANDBOOK.md`
- Must not touch: `src/modules/**`, `drizzle/**`
- Test cases:
  1. Insert through a tracked repository → one record, action `…:create`, `changes` lists every `track` column with `before: null` — creation not attributable
  2. Update of a `track` and a `redact` column → changes: tracked field with before and after, redacted field with no values — secret leakage in diffs
  3. Update touching only an `ignore` column → no record — noise floods history
  4. Write succeeds but staging the record throws → write rolled back — change without history
  5. Delete → record with every tracked field's `after: null` — deletion leaves no trace
  6. Repository built on an `untracked` table → INTERNAL at construction — tracking silently skipped
  7. Two concurrent updates of one row → two records whose before/after chain without gaps — lost update hidden in history
- Acceptance: `pnpm check`
- Manual check: none

### P1-10 Request attribution and the e2e activity assertion

- Type: feat
- Spec: §6.10, §3.5, §9, §16 F10
- Depends on: P1-08
- Size: M
- Risk: high
- Tier: any + review
- Follow: `src/platform/http/pipeline.ts`, `test/support/http.ts`
- Decisions:
  - Pipeline: every request runs inside `activityContext.run` with actor `anonymous` (until P1-15 sets the user), surface `api`, requestId, ip, user agent (truncated to 512 chars), tenant null. The worker runs each job inside a context with actor `job`, surface `worker`, the job id as requestId.
  - `RouteDefinition.activity` (`"auto"` default or `{ none: reason }`) is checked at boot: a non-GET route with `{ none: "" }` (empty reason) throws. The pipeline itself records nothing; use cases and tracked repositories do.
  - `test/support/app.ts`: `startApp(options)` boots the real `enabledModules` on a test database and Redis and returns `{ url, request(method, path, body?, headers?), activityFor(requestId) }`. `request` asserts, for every 2xx non-GET response, that `activityFor(x-request-id)` has at least one row, unless the matched route declares `activity: { none }`. All e2e tests use it.
  - HANDBOOK chapter 3 "HTTP": attribution; chapter 7: how to write an e2e test.
- Files in scope: `src/platform/http/**`, `src/platform/kernel/http.ts`, `src/platform/queue/**`, `src/main/worker.ts`, `test/support/**`, `test/e2e/**`, `docs/HANDBOOK.md`
- Must not touch: `src/modules/**`, `drizzle/**`
- Test cases:
  1. POST route whose use case records one event → the row has the response's `x-request-id`, actor `anonymous`, surface `api`, the client IP — attribution missing
  2. POST route recording nothing, no `activity` field → `startApp().request` fails the test naming the route — silent unaudited mutation
  3. Same route with `activity: { none: "probe" }` → passes — escape hatch unusable
  4. Route with `activity: { none: "" }` → boot error naming the route — opt-out without a reason
  5. Two concurrent requests → each row carries its own request id — context bleeds between requests
  6. Job recording an event → actor `job`, surface `worker`, requestId = job id — job writes unattributed
  7. User agent of 2000 chars → stored truncated to 512 — oversized header stored
- Acceptance: `pnpm check`
- Manual check: none

### P1-11 Activity partitions and retention jobs

- Type: feat
- Spec: §6.10, §4, §16 F10
- Depends on: P1-06, P1-08
- Size: S
- Risk: high
- Tier: any + review
- Follow: `src/modules/activity/`, the jobs of `src/platform/queue/`
- Decisions:
  - Config `ACTIVITY_RETENTION_DAYS` (30–3650, default 730).
  - Job `activity.maintain-partitions`, scheduled daily at 03:00 UTC: calls `activity_ensure_partitions(2)`, then detaches and drops every monthly partition whose upper bound is older than now − `ACTIVITY_RETENTION_DAYS`. It never drops the `DEFAULT` partition or a partition that overlaps the retention window. It records one event `activity.partition:drop` per dropped partition (actor `job`).
  - The worker upserts the schedule at start through a new optional manifest hook `schedules?()` returning `{ job, cron }[]`.
  - HANDBOOK chapter 8: retention paragraph (GDPR note from SPEC §21).
- Files in scope: `src/modules/activity/**`, `src/platform/kernel/module.ts`, `src/platform/queue/**`, `src/platform/config/**`, `src/main/worker.ts`, `.env.example`, `docs/HANDBOOK.md`
- Must not touch: `drizzle/meta/**`
- Test cases:
  1. Partitions for the last 30 months, retention 730 days → partitions entirely older than 730 days dropped, the one straddling the cutoff kept — data kept forever or deleted early
  2. Run twice the same day → second run drops nothing and creates nothing — non-idempotent maintenance
  3. Rows in `DEFAULT` partition → never dropped — data loss in the safety net
  4. Each dropped partition → one `activity.partition:drop` event — silent history deletion
  5. `ACTIVITY_RETENTION_DAYS` `10` → ConfigError — retention misconfigured to near zero
- Acceptance: `pnpm check`
- Manual check: none

### P1-12 Users and profiles data

- Type: feat
- Spec: §5, §6.7, §16 F11
- Depends on: P1-09
- Size: M
- Risk: high
- Tier: any + review
- Follow: `src/modules/entitlements/` (reference slice), `src/platform/db/tracked-repository.ts`
- Decisions:
  - Module `users`, no routes yet. Tables (tracked; timestamps `ignore`): `users` (`id`, `status` text CHECK in `active`, `pending_onboarding`, `suspended`, default `active`; `deleted_at` timestamptz null) and `profiles` (`user_id` uuid primary key referencing `users.id`, `display_name` text not null default `''` max 80, `avatar_file_id` uuid null, `locale` text not null default `en` (BCP 47, ≤ 35 chars), `timezone` text not null default `UTC` (IANA name, validated with `Intl.supportedValuesOf("timeZone")`)).
  - Repositories `DrizzleUserRepository` and `DrizzleProfileRepository` extend `TrackedRepository`.
  - Public facade (index exports the type `UsersApi`; the module registers `usersApi`): `create({ displayName? }) → User` (user and empty profile in one unit of work; stages event `users.user.created`), `findById(id)`, `getProfile(userId)`, `updateProfile(userId, patch)`. Errors `USER_NOT_FOUND` (404), `INVALID_TIMEZONE` (400).
  - HANDBOOK chapter 5 `### Module: users`; chapter 2: module facades registered in DI, types exported from `index.ts`.
- Files in scope: `src/modules/users/**`, `src/modules/index.ts`, `drizzle/**`, `docs/HANDBOOK.md`
- Must not touch: `src/platform/**`
- Test cases:
  1. `create()` → user `active`, profile with defaults, one `users.user:create` and one `users.profile:create` record, one outbox event — user without profile or history
  2. `create()` where the profile insert fails → no user row, no event — orphan user
  3. `updateProfile` with timezone `Mars/Base` → 400 INVALID_TIMEZONE; `Asia/Karachi` → saved — invalid timezone stored
  4. `updateProfile` with display name of 81 chars → 400 VALIDATION_FAILED; 80 → saved — oversized field
  5. `findById` for a soft-deleted user → USER_NOT_FOUND — deleted account resurfaces
  6. `users.status` set to `banned` directly in SQL → check violation — invalid state persisted
- Acceptance: `pnpm check`
- Manual check: none

### P1-13 Email notifications: console and SMTP senders

- Type: feat
- Spec: §6.11, §3.4, §16 F15
- Depends on: P1-06
- Size: M
- Risk: high
- Tier: any + review
- Follow: `src/modules/entitlements/` (module layout), the subscriptions of `src/platform/kernel/events.ts`
- Decisions:
  - Dependencies `nodemailer` 10.4.0 and dev `@types/nodemailer` 8.0.2 (checked: no build scripts). Image `axllent/mailpit:v1.33.1` in compose (SMTP 1025, UI 8025). Move their planned VERSIONS lines to their sections without versions.
  - Config: `EMAIL_DRIVER` `console` | `smtp` (default `console`); `SMTP_URL` (`smtp://` or `smtps://`, required when `smtp`); `EMAIL_FROM` (required, an address). The config layer rejects `smtp` without `SMTP_URL`.
  - Module `notifications`. Port `EmailSender { send(message: { to; subject; text; html? }): Promise<void> }`. `ConsoleEmailSender` writes one JSON line `{"email":{"to","subject","text"}}` to `process.stdout` (not the logger, which must never carry full addresses); at boot in production it logs a `warn` that emails are printed, not sent. `SmtpEmailSender` uses one pooled nodemailer transport.
  - Facade `NotificationsApi.sendEmail(message)` (type from index; registered `notificationsApi`) stages event `notifications.email.requested` with the rendered message; the module's subscription sends it, 5 attempts with backoff, then the failed set (dead letters). The payload carries the message, so one-time tokens sit in `outbox_events` for at most 24 h (P1-06 cleanup) and in Redis only until the job completes.
  - Compose: `mailpit` service; the `app` anchor uses `EMAIL_DRIVER: console`, `EMAIL_FROM: Plinth <no-reply@plinth.local>`.
  - HANDBOOK chapter 5 `### Module: notifications`; chapter 8: reading emails locally (Mailpit UI or console output).
- Files in scope: `src/modules/notifications/**`, `src/modules/index.ts`, `src/platform/config/**`, `.env.example`, `compose.yml`, `package.json`, `pnpm-lock.yaml`, `docs/VERSIONS.md`, `docs/HANDBOOK.md`
- Must not touch: `src/platform/http/**`, `drizzle/**`
- Test cases:
  1. `sendEmail` inside a unit of work that rolls back → nothing sent — email for an action that failed
  2. `sendEmail` committed → exactly one message reaches Mailpit (SMTP adapter against a Mailpit testcontainer) — email lost or duplicated
  3. SMTP refuses twice, then accepts → delivered on attempt 3 — transient outage drops email
  4. SMTP always refuses → job ends in the failed set after 5 attempts — infinite retries
  5. `EMAIL_DRIVER=smtp` without `SMTP_URL` → ConfigError naming SMTP_URL — boot with no way to send
  6. Any `job` log line for an email → contains no recipient address and no body — PII in logs
- Acceptance: `pnpm check`
- Manual check: `docker compose --profile app up -d --build`, then follow HANDBOOK chapter 8 to see emails once P1-14 exists; until then none

### P1-14 Email and password sign-up with verification

- Type: feat
- Spec: §6.1, §5, §9, §16 F12
- Depends on: P1-07, P1-12, P1-13
- Size: M
- Risk: high
- Tier: strong
- Follow: `src/modules/entitlements/` (reference slice), `src/modules/users/` (facade use)
- Decisions:
  - Dependency `@node-rs/argon2` 2.2.2 (checked: prebuilt binaries including `linux-x64-musl`, no build script; argon2id m=19456 KiB, t=2, p=1 took 22 ms on the dev machine). Move its planned VERSIONS line to Dependencies without the version.
  - Module `auth`. Tables (tracked): `identities` (`user_id` FK indexed, `type` text CHECK in `email`, `identifier` citext, `verified_at` null, unique `(type, identifier)`), `password_credentials` (`user_id` primary key FK, `hash` text, history `redact`), `verification_tokens` (`purpose` text CHECK in `verify_email`, `password_reset`, `identifier` citext, `token_hash` text unique, `attempts` int default 0, `expires_at`, `consumed_at` null) declared `untracked("short-lived secrets; sign-up and verification are recorded as explicit events")`.
  - Port `PasswordHasher { hash(password); verify(hash, password) }`, adapter `Argon2PasswordHasher` with a semaphore of `PASSWORD_HASH_CONCURRENCY` (config, 1–32, default 4); excess callers wait (bounded concurrency, §13).
  - Config `TOKEN_HMAC_KEY`: required, base64 of ≥ 32 bytes, never logged. Tokens are 32 random bytes, base64url; stored as HMAC-SHA256 hex with that key.
  - `POST /v1/auth/sign-up` `{ email, password }` (email ≤ 254, lower-cased for display only; password 8–128 chars): always 202 `{ status: "verification_sent" }`. New email: user (via `usersApi.create`), identity, credential, token (TTL 24 h), verification email, event `auth.sign-up:create`, in one unit of work. Existing email: no writes, the same hashing work (hash the submitted password and discard it), the same response. Rate limits: route 10 per hour `by: "ip"`, and 5 per hour per lower-cased email through `RateLimiter`.
  - `POST /v1/auth/verify-email` `{ token }`: valid, unexpired, unconsumed → identity `verified_at` set, token consumed, 200 `{ status: "verified" }`; anything else → 400 INVALID_TOKEN, same body for every reason. Rate limit 20 per hour by IP.
  - Errors in `auth/domain/errors.ts`: `INVALID_TOKEN` (400). HANDBOOK chapter 5 `### Module: auth`; chapter 4 flow "Sign-up to verified".
- Files in scope: `src/modules/auth/**`, `src/modules/index.ts`, `src/platform/config/**`, `drizzle/**`, `openapi.json`, `.env.example`, `compose.yml`, `package.json`, `pnpm-lock.yaml`, `docs/VERSIONS.md`, `docs/HANDBOOK.md`
- Must not touch: `src/platform/http/**`, `src/modules/users/**`
- Test cases:
  1. New email → 202, one user, one unverified identity, credential hash starts `$argon2id$v=19$m=19456,t=2,p=1`, one email containing a token — sign-up incomplete or weak hash
  2. Existing email → identical status and body; median latency within 25% of the new-email case over 20 runs — account enumeration
  3. Password of 7 chars → 400; 128 → 202; 129 → 400 — length rule not enforced
  4. Verify with the emailed token → 200; same token again → 400 INVALID_TOKEN — token replay
  5. Token 1 s past 24 h → 400 INVALID_TOKEN — expired token accepted
  6. Token from the email with one character changed → 400, identical body to the expired case — token guessing feedback
  7. Sixth sign-up for one email within an hour from different IPs → 429 — per-identifier abuse
  8. Database write fails after the user insert → no user, identity or email — orphan account
  9. 50 concurrent sign-ups, `PASSWORD_HASH_CONCURRENCY` 4 → never more than 4 hashes in flight, all 202 — event loop or memory exhaustion
  10. Logs and activity rows of a sign-up → contain neither the password nor the token — secret leakage
- Acceptance: `pnpm check`
- Manual check: `docker compose --profile app up -d --build`; `curl -i -X POST http://localhost:3000/v1/auth/sign-up -H "content-type: application/json" -d '{"email":"a@example.com","password":"correct horse"}'`; copy the token from `docker compose --profile app logs worker`; `curl -i -X POST http://localhost:3000/v1/auth/verify-email -H "content-type: application/json" -d '{"token":"<token>"}'` → 200; `docker compose --profile app down -v`

### P1-15 Sessions: access tokens, refresh rotation, sign-in and sign-out

- Type: feat
- Spec: §6.2, §6.1, §3.5, §9, §16 F13, F12
- Depends on: P1-14
- Size: M
- Risk: high
- Tier: strong
- Follow: `src/modules/auth/`, `src/platform/http/pipeline.ts`
- Decisions:
  - Dependency `jose` 6.2.16 (checked: EdDSA sign, verify and a local JWKS work on Node 26). Move its planned VERSIONS line to Dependencies without the version.
  - Config `JWT_SIGNING_KEYS`: required JSON array of private Ed25519 JWKs, each with a unique `kid`; the first signs, all verify (rotation: prepend the new key, remove the old after 10 min). `ACCESS_TOKEN_TTL_SECONDS` 600, `REFRESH_TOKEN_TTL_DAYS` 30, `REQUIRE_EMAIL_VERIFICATION` true. `scripts/generate-keys.ts` prints a fresh one-key array.
  - Module `sessions`, table `sessions` with the SPEC §5 columns (`tenant_id` null until E07; `refresh_hash` history `redact`, `last_seen_at` `ignore`), indexes `(user_id)` and unique `(refresh_hash)`. Access token claims: `sub` user id, `sid` session id, `iat`, `exp`, header `alg: EdDSA`, `kid`. Verification accepts only `EdDSA` and known `kid`s.
  - Refresh token: 32 random bytes base64url, stored as HMAC (P1-14 key). `POST /v1/auth/refresh` `{ refreshToken }` → new pair; the old hash is moved to `previous_refresh_hash`; presenting a previous token revokes every session of its `family_id` (`revoke_reason: "refresh_reuse"`), records `sessions.session:revoke` with outcome `denied`, and answers 401 REFRESH_TOKEN_REUSED. Refresh expiry slides to now + 30 days on each rotation.
  - `POST /v1/auth/sign-in` `{ email, password }`: success → 200 `{ accessToken, refreshToken, expiresIn }` (bearer mode). Unknown email or wrong password → 401 INVALID_CREDENTIALS, same body, same hashing work (verify against a fixed dummy hash). Unverified email with the right password → 403 EMAIL_NOT_VERIFIED. Records `auth.sign-in:create` success or failure (failure without the email, with a hashed identifier).
  - `GET /.well-known/jwks.json`: public keys only. `POST /v1/auth/sign-out` (`auth: "session"`): revokes the current session.
  - Pipeline: `auth: "session"` reads `authorization: Bearer`, verifies, rejects a `sid` found in Redis key `plinth:revoked:<sid>` (written on every revocation, TTL = access TTL) and sets `ctx.actor` and `activityContext.actor` to `{ type: "user", id, sessionId }`; failures → 401 UNAUTHENTICATED. `RequestContext` gains `actor`. Remove `"session"` from `assertSupported`.
  - Rate limits: sign-in 10 per 15 min by IP and 5 per 15 min per email; refresh 60 per hour by IP.
  - HANDBOOK chapter 5 `### Module: sessions`; chapter 4 flow "Sign-in, refresh, reuse"; chapter 8 "Rotate signing keys".
- Files in scope: `src/modules/sessions/**`, `src/modules/auth/**`, `src/modules/index.ts`, `src/platform/http/**`, `src/platform/kernel/http.ts`, `src/platform/config/**`, `scripts/generate-keys.ts`, `drizzle/**`, `openapi.json`, `test/support/**`, `.env.example`, `compose.yml`, `package.json`, `pnpm-lock.yaml`, `docs/VERSIONS.md`, `docs/HANDBOOK.md`
- Must not touch: `src/modules/users/**`
- Test cases:
  1. Verified user signs in → 200; the access token calls a `session` route → 200 with `ctx.actor.id` = the user — sign-in broken
  2. Wrong password and unknown email → identical 401 bodies, median latencies within 25% — account enumeration
  3. Token signed with `alg: none`, with HS256 using the public key, or with an unknown `kid` → 401 — JWT alg/kid confusion
  4. Refresh → new pair; the old refresh token again → 401 REFRESH_TOKEN_REUSED and the new token from step 1 is also dead — refresh-token reuse
  5. Sign-out, then the still-unexpired access token → 401 — sign-out not immediate
  6. Access token 1 s after `exp` → 401 — expired token accepted
  7. Unverified user with the right password → 403 EMAIL_NOT_VERIFIED, no session row — unverified access
  8. Two concurrent refreshes with the same token → one succeeds, the other is treated as reuse — refresh race forks a family
  9. JWKS → contains `kid`, `x`, `crv`, never `d` — private key leak
  10. Sign-in failure activity row → no plaintext email — PII in history
- Acceptance: `pnpm check`
- Manual check: `docker compose --profile app up -d --build`; sign up and verify as in P1-14; `curl -s -X POST http://localhost:3000/v1/auth/sign-in -H "content-type: application/json" -d '{"email":"a@example.com","password":"correct horse"}'` returns tokens; `curl -s http://localhost:3000/.well-known/jwks.json`; `docker compose --profile app down -v`

### P1-16 Cookie mode with CSRF protection

- Type: feat
- Spec: §6.2, §9, §16 F13
- Depends on: P1-15
- Size: S
- Risk: high
- Tier: strong
- Follow: `src/modules/sessions/`, `src/platform/http/pipeline.ts`, `src/platform/http/express/express-server.ts`
- Decisions:
  - `HttpResult` gains `cookies?: { name; value; maxAgeSeconds; httpOnly; path }[]`; the Express adapter writes them with `Secure` (except when `NODE_ENV` is `development` or `test`), `SameSite=Lax`. The pipeline parses the `cookie` header into `ctx.cookies` (no new dependency).
  - Sign-in and refresh accept `{ mode: "cookie" | "bearer" }` (default `bearer`). Cookie mode sets `plinth_access` (httpOnly, path `/`, max-age = access TTL), `plinth_refresh` (httpOnly, path `/v1/auth`, max-age = refresh TTL) and `plinth_csrf` (not httpOnly, 32 random bytes base64url), and returns `{ expiresIn }` without tokens. Refresh in cookie mode reads `plinth_refresh` when the body has no token.
  - Pipeline: a `session` route authenticated by cookie with method other than GET requires header `x-csrf-token` equal to the `plinth_csrf` cookie (constant-time compare) → otherwise 403 CSRF_FAILED. Bearer requests need no CSRF token. If both a bearer header and a cookie are present, the bearer header wins.
  - Sign-out in cookie mode clears all three cookies.
- Files in scope: `src/modules/sessions/**`, `src/platform/http/**`, `src/platform/kernel/http.ts`, `src/platform/kernel/errors.ts`, `openapi.json`, `test/support/**`, `docs/HANDBOOK.md`
- Must not touch: `drizzle/**`
- Test cases:
  1. Cookie sign-in → three Set-Cookie headers with the stated flags and no token in the body — tokens exposed to scripts
  2. Cookie-authenticated POST without `x-csrf-token` → 403 CSRF_FAILED; with a mismatching token → 403; matching → 2xx — CSRF
  3. Cookie-authenticated GET without the header → 200 — safe methods blocked
  4. Bearer POST without CSRF header → 2xx — bearer clients broken
  5. Sign-out in cookie mode → cookies cleared and the old access cookie → 401 — sign-out leaves a live cookie
  6. `NODE_ENV` production → every cookie has `Secure` — cookie sent over plain HTTP
- Acceptance: `pnpm check`
- Manual check: none

### P1-17 Devices: list, revoke and device limit

- Type: feat
- Spec: §6.2, §9, §16 F13
- Depends on: P1-15
- Size: M
- Risk: high
- Tier: strong
- Follow: `src/modules/sessions/`
- Decisions:
  - Sign-in body gains optional `deviceName` (≤ 100 chars); the session stores it, the user agent (≤ 512) and the IP; `last_seen_at` is updated at most once a minute per session on refresh.
  - `GET /v1/sessions` → `{ data: [{ id, deviceName, userAgent, ip, lastSeenAt, createdAt, current }], nextCursor: null }` for the actor's active sessions, newest first. `DELETE /v1/sessions/{id}` → revoke one of the actor's sessions (404 SESSION_NOT_FOUND for another user's id — same as unknown). `POST /v1/sessions/revoke-others` → revoke all but the current. Every revocation writes the Redis revoked key (P1-15) and records `sessions.session:revoke`.
  - Device limit: port `DeviceLimitPolicy { maxDevices(userId): Promise<number> }`; this item's adapter returns 5 (the planned default of entitlement `sessions.max_devices`; E06 replaces it). Config `SESSION_LIMIT_POLICY` `reject` | `evict_oldest` (default `evict_oldest`). On sign-in, inside one unit of work holding `pg_advisory_xact_lock(hashtext('sessions:' || user_id))`: count active sessions; at the limit, `reject` → 409 DEVICE_LIMIT_REACHED, `evict_oldest` → revoke the least recently seen (`revoke_reason: "evicted"`), then insert.
- Files in scope: `src/modules/sessions/**`, `src/platform/config/**`, `drizzle/**`, `openapi.json`, `.env.example`, `docs/HANDBOOK.md`
- Must not touch: `src/platform/http/**`
- Test cases:
  1. Three sessions → list shows three, `current` true on exactly one — device list wrong
  2. Revoke another user's session id → 404 SESSION_NOT_FOUND, that session still active — IDOR on session revocation
  3. Revoke one → its access token gets 401 at once — revocation not immediate
  4. `revoke-others` → only the current session still works — sign-out-everywhere incomplete
  5. `evict_oldest`, limit 5, sixth sign-in → 200, the least recently seen session revoked with reason `evicted` — limit not enforced
  6. `reject`, sixth sign-in → 409 DEVICE_LIMIT_REACHED, no session created — limit bypass
  7. Ten concurrent sign-ins at 4 active sessions, `reject` → exactly one succeeds — device-limit race
  8. `deviceName` of 101 chars → 400 VALIDATION_FAILED — oversized input stored
- Acceptance: `pnpm check`
- Manual check: none

### P1-18 Password reset and progressive lockout

- Type: feat
- Spec: §6.1, §9, §16 F12
- Depends on: P1-17
- Size: M
- Risk: high
- Tier: strong
- Follow: `src/modules/auth/`
- Decisions:
  - `POST /v1/auth/password-reset` `{ email }` → always 202 `{ status: "reset_sent" }`; for a verified email identity, a `password_reset` token (TTL 30 min, single use) is emailed; prior unconsumed reset tokens for that email are consumed. Same hashing-free timing for unknown emails (no writes, same response). Rate limits: 5 per hour per email, 20 per hour per IP.
  - `POST /v1/auth/password-reset/confirm` `{ token, password }` → 200; sets the new hash, consumes the token, revokes every session of the user (`revoke_reason: "password_reset"`), records `auth.password:update`. Invalid token → 400 INVALID_TOKEN.
  - Progressive lockout on sign-in per lower-cased email, in Redis: after 5 consecutive failures, lock 1 min; each further failure while locked doubles the lock, capped at 1 h; success resets. While locked, sign-in answers 429 RATE_LIMITED with `retry-after` whether or not the password is right, and the response is identical for unknown emails (they lock the same way). A successful password reset clears the lock.
- Files in scope: `src/modules/auth/**`, `openapi.json`, `docs/HANDBOOK.md`
- Must not touch: `src/platform/**`, `drizzle/meta/**`
- Test cases:
  1. Reset for a verified email → one email; confirm with its token → 200, old password fails, new succeeds — reset broken
  2. Confirm → every prior session's access token gets 401 — attacker session survives reset
  3. Same reset token twice → second 400 INVALID_TOKEN; an older token after a newer request → 400 — reset token replay
  4. Reset for unknown and for existing emails → identical 202 bodies — account enumeration
  5. Five wrong passwords → sixth attempt with the right password → 429 with `retry-after` ≤ 60 — brute force
  6. Locked for 1 min, then another wrong attempt after expiry → next lock 2 min; lock never exceeds 3600 s — lockout not progressive or unbounded
  7. Unknown email, five failures → sixth answer identical to a locked existing account — enumeration via lockout
  8. Confirm with a 7-char password → 400 VALIDATION_FAILED, token not consumed — weak password accepted
- Acceptance: `pnpm check`
- Manual check: none

### P1-19 Current user API, own activity and the authenticated smoke flow

- Type: feat
- Spec: §6.7, §6.10, §17, §16 F11, F10
- Depends on: P1-10, P1-15
- Size: M
- Risk: high
- Tier: any + review
- Follow: `src/modules/entitlements/http/` (route style), `scripts/smoke.ts`
- Decisions:
  - `GET /v1/users/me` (`auth: "session"`) → `{ id, status, profile: { displayName, locale, timezone }, email, emailVerified }` (email from the auth facade `AuthApi.primaryEmail(userId)`, type from auth's index). `PATCH /v1/users/me` `{ displayName?, locale?, timezone? }` (strict; `status`, `id` and anything else → 400) → the same shape.
  - `GET /v1/users/me/activity?cursor&limit` (limit 1–100, default 20) → `{ data: [{ id, occurredAt, action, outcome, targetType, targetId, surface, ip, changes }], nextCursor }`, events whose actor is the caller, newest first. The cursor is an opaque base64url of `(occurred_at, id)`; activity exposes this as `ActivityApi.listForActor`. Redacted changes show `{ field, redacted: true }`.
  - `scripts/smoke.ts` gains `--email-command "<cmd>"`: after the plan check, sign up a random `smoke-<uuid>@example.com`, read the token from the newest JSON email line in the command's stdout, verify, sign in, `GET /v1/users/me` 200, and check that `/v1/users/me/activity` lists an event with the sign-in response's `x-request-id`. CI runs it with `--email-command "docker compose --profile app logs --no-log-prefix worker"`.
- Files in scope: `src/modules/users/**`, `src/modules/auth/index.ts`, `src/modules/auth/application/**`, `src/modules/auth/auth.module.ts`, `src/modules/activity/**`, `scripts/smoke.ts`, `scripts/__tests__/smoke.test.ts`, `.github/workflows/ci.yml`, `openapi.json`, `test/e2e/**`, `docs/HANDBOOK.md`
- Must not touch: `src/platform/**`, `drizzle/meta/**`
- Test cases:
  1. Signed-in user → `GET /v1/users/me` 200 with their email and defaults — current user unavailable
  2. No token → 401 UNAUTHENTICATED — anonymous access to profile
  3. PATCH `{ "status": "active" }` or `{ "id": "x" }` → 400 VALIDATION_FAILED — mass assignment
  4. PATCH display name → 200 and one `users.profile:update` event with before and after — profile change unaudited
  5. Own activity → contains only the caller's events, never another user's — cross-user history access
  6. 45 events, `limit 20` → pages of 20, 20, 5 with no duplicates or gaps, last `nextCursor` null — broken pagination
  7. Tampered cursor → 400 VALIDATION_FAILED — cursor injection
  8. Smoke against a server whose activity misses the request id → exit 1 naming `/v1/users/me/activity` — smoke passes without history
- Acceptance: `pnpm check`, and the CI `smoke` job is green on the PR
- Manual check: `docker compose --profile app up -d --build`, then `node scripts/smoke.ts http://localhost:3000 --email-command "docker compose --profile app logs --no-log-prefix worker"`, then `docker compose --profile app down -v`

### P1-20 Idempotency keys

- Type: feat
- Spec: §3.5, §6.13, §9, §16 F09
- Depends on: P1-15
- Size: M
- Risk: high
- Tier: strong
- Follow: `src/platform/http/pipeline.ts`, `src/platform/db/schema.ts`
- Decisions:
  - Table `idempotency_keys` in `src/platform/db/schema.ts`: `user_id` uuid, `key` text (1–255 printable ASCII), `operation_id` text, `request_hash` text (SHA-256 of method, path and canonical JSON body), `status` text CHECK in `in_progress`, `completed`, `response_status` int null, `response_body` jsonb null, `created_at`; primary key `(user_id, key)`. Declared `untracked("replay cache; the original request is tracked")`. Rows older than 24 h are deleted by a daily platform job.
  - Only routes with `idempotent: true` and `auth: "session"` use it; `idempotent` on a public route throws at boot. Remove `idempotent` from `assertSupported`.
  - Pipeline, with header `idempotency-key` present: insert `in_progress` (conflict → existing row). Existing `completed` with the same hash → replay its status and body with header `idempotent-replayed: true`, handler not called. Same key, different hash → 422 IDEMPOTENCY_KEY_REUSED. Existing `in_progress` → 409 IDEMPOTENCY_IN_PROGRESS with `retry-after: 1`. After the handler: 2xx and 4xx responses are stored as `completed`; on 5xx the row is deleted so the client may retry. Without the header the route runs normally.
  - Platform errors gain `IDEMPOTENCY_KEY_REUSED` (422) and `IDEMPOTENCY_IN_PROGRESS` (409). OpenAPI documents the header and both errors on idempotent routes.
- Files in scope: `src/platform/http/**`, `src/platform/kernel/**`, `src/platform/db/**`, `src/platform/openapi/**`, `src/platform/queue/**`, `drizzle/**`, `openapi.json`, `test/support/**`, `docs/HANDBOOK.md`
- Must not touch: `src/modules/**`
- Test cases:
  1. Same key and body twice → handler runs once; second response identical with `idempotent-replayed: true` — duplicate charge or write
  2. Same key, different body → 422 IDEMPOTENCY_KEY_REUSED — key reused for another operation
  3. Two concurrent requests with one key → one runs, the other 409 with `retry-after: 1` — race runs the handler twice
  4. Handler fails with 500 → row removed; retry with the same key runs the handler — failed request can never be retried
  5. Two users using the same key → independent — cross-user replay leaks a response
  6. `idempotent: true` on a public route → boot error — anonymous keys collide
  7. Key of 256 chars → 400 VALIDATION_FAILED — oversized key stored
- Acceptance: `pnpm check`
- Manual check: none

### P1-21 Resource history route helper

- Type: feat
- Spec: §6.10, §16 F10
- Depends on: P1-19
- Size: S
- Risk: high
- Tier: any + review
- Follow: `src/modules/users/http/routes.ts` (own activity route)
- Decisions:
  - `historyRoute({ path, targetType, tags, authorize })` exported from activity's index: builds `GET <path>` (`path` ends in `/{id}/history`, `auth: "session"`) answering `{ data: [{ occurredAt, action, outcome, actor: { type, id }, changes }], nextCursor }` for records with that `targetType` and target id, newest first, same cursor and limits as P1-19. `authorize(ctx, id): Promise<boolean>` is required; false → 404 NOT_FOUND (never 403, so ids are not confirmed). Until E05, modules authorize by ownership.
  - First use: `GET /v1/users/{id}/history`, authorized only when `id` is the caller's own id.
- Files in scope: `src/modules/activity/**`, `src/modules/users/**`, `openapi.json`, `docs/HANDBOOK.md`
- Must not touch: `src/platform/**`
- Test cases:
  1. Own user id → 200 with profile and user records only — wrong records returned
  2. Another user's id → 404 NOT_FOUND, identical to a random id — IDOR on history
  3. Redacted column change → `{ field, redacted: true }` without values — secret leakage in history
  4. Route built without `authorize` → type error (`@ts-expect-error`) — unguarded history route
- Acceptance: `pnpm check`
- Manual check: none

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
