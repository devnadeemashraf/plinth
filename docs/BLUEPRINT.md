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
