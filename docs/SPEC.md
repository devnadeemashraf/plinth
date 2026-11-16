# Plinth Build Specification v1

## 0. Identity

- **Name:** Plinth
- **Tagline:** The production-grade TypeScript backend you'd build yourself, if you had six months.
- **GitHub description:** Production-ready TypeScript backend template. Modular monolith with pluggable Express/Fastify, 7 auth methods, device-limited sessions, multi-tenancy with hierarchical RBAC, plans and entitlements, billing, file uploads, feature flags, WebSockets, full change history, an extensible admin console and full observability. 100% tested. Clone and ship.
- **Topics:** typescript, backend, boilerplate, starter-template, express, fastify, modular-monolith, authentication, rbac, multi-tenancy, saas, stripe, postgresql, openapi, admin-dashboard, hexagonal-architecture

**Changes from v1.0:** subscription-governed tenancy (§6.3, §6.5) · hierarchical O(1) RBAC with custom roles and per-tenant role metadata (§6.4) · `entitlements` split out of `billing` (§6.5) · `audit` replaced by full `activity` history (§6.10) · admin console with API docs and Handbook (§7) · admin UI removed from non-goals · repo becomes a two-package pnpm workspace.

## 1. Goals and non-goals

**Goals**

1. Clone → `plinth init` → running, deployable backend in under 10 minutes.
2. Adding a business module touches only that module's folder plus one manifest line (written by the generator). Adding an admin screen for it is one descriptor file.
3. Swapping any infrastructure choice is a config change, never a refactor.
4. Every feature ships with unit, integration, e2e and security tests; CI blocks anything less.
5. Every state change is attributable: who, what, when, where, before and after.
6. Stateless processes that scale horizontally and meet the latency budgets in §13.

**Non-goals (do not build)**
Microservices · GraphQL · customer-facing/storefront UI · CQRS/event sourcing · point-in-time restore or undo from history · policy engines/ABAC · multiple roles per membership · Kubernetes/Helm charts · multiple SQL dialects · a custom card-entry form · usage-based metering · SAML/SCIM · i18n framework · email template designer.

## 2. Tech stack (final unless an ADR changes it)

| Concern              | Choice                                                                                                                               | Reason                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Runtime              | Node.js Active LTS (≥ 24), ESM only                                                                                                  | Native type stripping in dev; stable `AsyncLocalStorage`    |
| Language             | TypeScript 7.x, `strict`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`                                   | Source runs under Node directly                             |
| Repo                 | pnpm workspace, two packages: root (API) and `admin/` (console)                                                                      | Frontend deps never enter the API image layer               |
| HTTP                 | Express 5 (default) and Fastify behind `HttpServerPort`                                                                              | Two adapters prove the port                                 |
| Validation           | Zod 4                                                                                                                                | One source for validation, types, OpenAPI                   |
| DI                   | Awilix, explicit registration, no decorators                                                                                         | Transpiler-independent                                      |
| Database             | PostgreSQL via Drizzle ORM + drizzle-kit                                                                                             | SQL-first, typed, thin                                      |
| Cache / coordination | Redis-protocol server via ioredis                                                                                                    | Sessions, rate limits, caches, pub/sub                      |
| Jobs                 | BullMQ, separate `worker` process                                                                                                    | Retries, backoff, scheduling                                |
| Realtime             | Socket.IO + Redis adapter behind `RealtimeGatewayPort`                                                                               | Rooms, reconnects, scale-out                                |
| Crypto               | `@node-rs/argon2`, `jose` (EdDSA), Node `crypto`                                                                                     | Vetted; hashing off the event loop                          |
| OAuth                | `arctic`                                                                                                                             | Small, PKCE-correct                                         |
| Logging / telemetry  | pino; OpenTelemetry → OTLP; Prometheus-format `/metrics`                                                                             | Vendor-neutral                                              |
| Tests                | Vitest, Testcontainers, fast-check, k6; Playwright + Testing Library (admin)                                                         |                                                             |
| Lint/format          | Biome (both packages)                                                                                                                | Independent of the TS compiler API                          |
| API docs             | OpenAPI 3.1 from Zod; Scalar                                                                                                         |                                                             |
| Admin console        | React + Vite SPA (no meta-framework, no SSR), TanStack Router/Query/Table, Tailwind CSS, **coss ui** components copied into the repo | coss ui is React-based; SPA keeps build and hosting trivial |
| Default providers    | Stripe, S3, Resend, Twilio, Google + GitHub OAuth                                                                                    | Each has a `console`/`local` dev adapter                    |

Imports use Node subpath imports (`#platform/*`, `#modules/*`).

## 3. Architecture

### 3.1 Modules

`auth` · `sessions` · `users` · `tenancy` (tenants, memberships, invites) · `access` (permissions, roles, role settings) · `entitlements` (plans, entitlement resolution, overrides) · `billing` (provider, subscriptions, webhooks) · `files` · `flags` · `activity` (history) · `notifications` · `realtime` · `health`

### 3.2 Layers inside a module

```
modules/<name>/
  domain/         entities, value objects, errors, events, permissions.ts, entitlements.ts. Pure TS.
  application/    use cases, port interfaces
  infra/          Drizzle repositories, schema.ts (this module's tables)
  http/           routes.ts, admin.routes.ts (RouteDefinition[]), schemas.ts (Zod)
  jobs/
  <name>.module.ts  manifest: DI registration, routes, jobs, subscriptions, permissions, entitlements
  index.ts        PUBLIC API — the only file other modules may import
  README.md       ≤ 60 lines: purpose, public API, events, tables, permissions
  __tests__/
```

### 3.3 Dependency rules (enforced by the arch test)

- `domain` imports nothing outside itself and `#platform/kernel`.
- `application` imports `domain` and ports only. `infra` and `http` import `application`, never each other.
- Module A may import only `#modules/b/index.ts`. No cross-module joins; each module owns its tables.
- Cross-module side effects go through domain events (in-process bus + transactional outbox).

### 3.4 Ports

`HttpServerPort`, `StoragePort`, `PaymentProviderPort`, `EmailSenderPort`, `SmsSenderPort`, `OAuthProviderPort`, `CachePort`, `QueuePort`, `RealtimeGatewayPort`, `FlagProviderPort`, `ErrorReporterPort`, `Clock`, `IdGenerator`, and one `<Entity>Repository` per aggregate. Repositories are interfaces, so a module can be backed by a non-SQL store; only Postgres implementations ship.

### 3.5 HTTP port

```ts
export interface RouteDefinition {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  description: string;
  tags: string[];
  auth: "public" | "session" | { permission: PermissionKey }; // typed union, typos fail to compile
  entitlement?: EntitlementKey; // 402/403 when the subject lacks it
  flag?: FlagKey; // 404 when off
  activity?: "auto" | { none: string }; // default 'auto'; opting out needs a reason
  rateLimit?: RateLimitPolicy;
  idempotent?: boolean;
  rawBody?: boolean;
  request: { params?: ZodType; query?: ZodType; body?: ZodType };
  responses: Record<
    number,
    { schema: ZodType; description: string; example: unknown }
  >;
  errors: ErrorCode[];
  handler(ctx: RequestContext): Promise<HttpResult>;
}

export interface HttpServerPort {
  register(routes: RouteDefinition[]): void;
  serveStatic(mount: string, dir: string, opts: StaticOptions): void; // admin console
  listen(port: number): Promise<void>;
  close(): Promise<void>;
  nodeServer(): import("node:http").Server;
}
```

Handlers never see `req`/`res`. Request id, auth, tenant resolution, permission/entitlement/flag gates, rate limit, validation, activity context, error mapping and metrics live in a framework-neutral pipeline in `#platform/http`.

### 3.6 Dependency injection and processes

- Root container in `#platform/di`; one scoped container per request/job carrying `RequestContext` (requestId, actor, session, tenant, role, logger).
- Each `*.module.ts` exports `register(container, config)`; `src/modules/index.ts` lists enabled modules (generator edits at a marker).
- `createTestContainer({ overrides })` builds a container with in-memory fakes.
- Processes: `api` (HTTP + WS + optional admin static files), `worker`, `migrate`. One image.

## 4. Configuration switches

```bash
HTTP_ADAPTER=express                  # express | fastify
AUTH_METHODS=email_password,email_otp,magic_link,oauth_google,oauth_github
TENANCY_MODE=single                   # single | multi
TENANT_ONBOARDING=account_first       # account_first | tenant_first | provisioned   (multi only)
BILLING_SUBJECT=user                  # user | tenant | both
OVER_LIMIT_POLICY=block_new           # block_new | freeze_excess
TENANCY_CUSTOM_ROLES=entitlement      # off | on | entitlement
TENANCY_RLS=false
SESSION_LIMIT_POLICY=evict_oldest     # reject | evict_oldest
STORAGE_DRIVER=s3  PAYMENT_DRIVER=stripe  EMAIL_DRIVER=resend  SMS_DRIVER=twilio
ADMIN_UI=embedded                     # embedded | external | off
PUBLIC_DOCS=true
ACTIVITY_RETENTION_DAYS=730
```

All env is Zod-validated at boot; invalid combinations (e.g. `BILLING_SUBJECT=tenant` with `TENANCY_MODE=single`) fail fast with a readable error.

## 5. Data model

**Conventions:** snake_case; UUIDv7 primary keys; `created_at`/`updated_at timestamptz`; `citext` for emails/usernames; text + `CHECK` instead of PG enums; every FK indexed; money as integer minor units + currency; secrets stored as hashes; tenant-scoped tables carry `tenant_id` with a leading composite index; forward-only expand → backfill → contract migrations. **Every table declares `tracked` or `untracked(reason)` for history (§6.10).**

| Module       | Table                               | Key columns                                                                                                                                                                                                        |
| ------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| users        | `users`                             | status (`active`/`pending_onboarding`/`suspended`), deleted_at                                                                                                                                                     |
| users        | `profiles`                          | user_id, display_name, avatar_file_id, locale, timezone                                                                                                                                                            |
| auth         | `identities`                        | user_id, type, identifier, verified_at, unique(type, identifier)                                                                                                                                                   |
| auth         | `password_credentials`              | user_id, hash                                                                                                                                                                                                      |
| auth         | `verification_tokens`               | purpose, identifier, token_hash, attempts, expires_at, consumed_at                                                                                                                                                 |
| sessions     | `sessions`                          | user_id, tenant_id, refresh_hash, family_id, device_name, user_agent, ip, last_seen_at, expires_at, revoked_at, revoke_reason, elevated_until                                                                      |
| tenancy      | `tenants`                           | slug (unique), name, owner_user_id, status (`active`/`frozen`/`suspended`/`deleted`), roles_version                                                                                                                |
| tenancy      | `memberships`                       | tenant_id, user_id, role_id, unique(tenant_id, user_id)                                                                                                                                                            |
| tenancy      | `invites`                           | tenant_id, email, role_id, token_hash, invited_by, expires_at, accepted_at                                                                                                                                         |
| access       | `roles`                             | tenant_id (null = system), scope (`tenant`/`platform`), key, parent_role_id, rank, grants text[], effective_permissions text[], is_system, unique(tenant_id, key)                                                  |
| access       | `role_settings`                     | tenant_id, role_id, alias, color (`CHECK ~ '^#[0-9a-fA-F]{6}$'`), icon, description, sort_order, metadata jsonb, unique(tenant_id, role_id)                                                                        |
| access       | `platform_role_assignments`         | user_id, role_id, granted_by                                                                                                                                                                                       |
| entitlements | `plans`                             | key (unique), name, audience (`user`/`tenant`), is_default, sort                                                                                                                                                   |
| entitlements | `plan_entitlements`                 | plan_id, key, value jsonb, unique(plan_id, key)                                                                                                                                                                    |
| entitlements | `plan_assignments`                  | subject_type, subject_id, plan_id, source (`default`/`subscription`/`manual`), unique(subject_type, subject_id)                                                                                                    |
| entitlements | `entitlement_overrides`             | subject_type, subject_id, key, value, reason, expires_at, granted_by                                                                                                                                               |
| billing      | `plan_prices`                       | plan_id, provider, provider_price_id, interval, amount_minor, currency                                                                                                                                             |
| billing      | `billing_customers`                 | subject_type, subject_id, provider, provider_customer_id                                                                                                                                                           |
| billing      | `subscriptions`                     | customer_id, plan_id, status, current_period_end, cancel_at_period_end, grace_until, provider_subscription_id                                                                                                      |
| billing      | `billing_events`                    | provider, provider_event_id (unique), type, payload, processed_at                                                                                                                                                  |
| files        | `files`                             | owner_user_id, tenant_id, purpose, storage_key, mime, size_bytes, checksum, status, variants jsonb                                                                                                                 |
| flags        | `feature_flags`                     | key (unique), enabled, default_value, rollout_percent, description, group                                                                                                                                          |
| flags        | `flag_overrides`                    | flag_id, subject_type (`user`/`tenant`/`plan`), subject_id, value                                                                                                                                                  |
| activity     | `activity_events`                   | occurred_at, tenant_id, actor_type, actor_id, session_id, surface, action, target_type, target_id, outcome, changes jsonb, metadata jsonb, request_id, trace_id, ip, user_agent — append-only, partitioned monthly |
| platform     | `outbox_events`, `idempotency_keys` | as v1.0                                                                                                                                                                                                            |

Users are global identities; tenant access is through `memberships`. In single mode one default tenant is seeded and every new user is auto-joined with the `member` role.

## 6. Feature specifications

### 6.1 Authentication (`auth`)

Enabled methods come from `AUTH_METHODS`; disabled methods register no routes and no docs. Each also has a runtime kill-switch flag `auth.<method>.enabled`.

| Method                                | Notes                                                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `username_password`, `email_password` | argon2id (≥ 19 MiB, t=2, p=1; tune to ~50–100 ms). Length 8–128, optional breached-password check. Email verification before session issue (configurable). |
| `email_otp`, `phone_otp`              | 6 digits, 10-min TTL, 5 attempts, 60 s resend cooldown, HMAC-hashed. E.164 phones, SMS country allowlist.                                                  |
| `magic_link`                          | 32-byte token, hashed, single use, 15-min TTL.                                                                                                             |
| `oauth_google`, `oauth_github`        | Code + PKCE + `state`. Link to an existing account only on a provider-verified email.                                                                      |

Shared: identical responses and timing for existing/non-existing accounts; per-IP and per-identifier limits; progressive lockout; password reset revokes all sessions; **step-up** (`sessions.elevated_until`, re-verify via password or OTP) required for sensitive actions; account deletion (soft delete + purge job).

### 6.2 Sessions and devices (`sessions`)

- Access JWT (EdDSA, 10 min, `kid` rotation, JWKS) + opaque refresh token rotated on every use; reuse revokes the family.
- Cookie mode (httpOnly, Secure, SameSite=Lax, CSRF double-submit) and bearer mode.
- Revoked session ids held in Redis for the access TTL → sign-out and eviction are immediate, including live sockets.
- Device limit from entitlement `sessions.max_devices`; policy `SESSION_LIMIT_POLICY`; check-and-insert under a per-user lock.
- Endpoints: list devices, revoke one, revoke all others.

### 6.3 Tenancy (`tenancy`)

**Resolution.** `single` → fixed default tenant. `multi` → resolver chain (subdomain, `X-Tenant` header, token claim; order configurable). Tenant-scoped repositories extend `TenantScopedRepository`; optional Postgres RLS via `TENANCY_RLS`.

**Onboarding (`TENANT_ONBOARDING`, multi only)**
| Mode | Behaviour |
|---|---|
| `account_first` | Sign-up creates a user only. The user later calls `POST /v1/tenants`, gated by `tenants.max_owned`. |
| `tenant_first` | Sign-up body requires `tenant: { name, slug }`; user, tenant and owner membership are created in one transaction. OAuth sign-ups land in `pending_onboarding` until `POST /v1/onboarding/tenant` completes. Invited users skip tenant creation. |
| `provisioned` | Only platform admins create tenants; users join by invite. |

**Subscription-governed limits.** All limits are entitlements (§6.5), never hard-coded:

- `tenants.max_owned` (user scope): tenants a user may own. Checked transactionally under a per-user lock.
- `members.max` (tenant scope): seats, counting pending invites.
- Any `feature.*` or module entitlement (tenant scope): what a specific tenant can use.
- On downgrade below current usage, `OVER_LIMIT_POLICY` applies: `block_new` (nothing removed; creation blocked) or `freeze_excess` (newest excess tenants become `frozen` = read-only until resolved).

**Lifecycle.** Create, update, transfer ownership (step-up required), leave (last owner cannot), suspend/unsuspend (platform), freeze/unfreeze, delete (soft + purge job). Invites: create, resend, revoke, accept. Switch active tenant.

### 6.4 Access control (`access`) — hierarchical RBAC, O(1) checks

**Naming scheme.** `<module>.<resource>:<action>`, lowercase, singular resource: `tenancy.member:invite`, `files.file:delete`. Core actions `create | read | update | delete | list`; domain verbs allowed (`invite`, `revoke`, `assign`, `export`, `suspend`). Wildcards (`files.file:*`, `billing.*`, `*`) are legal only inside role grants and are expanded when the role is compiled; runtime never matches patterns.

**Declaring permissions (per module, in `domain/permissions.ts`)**

```ts
export const filesPermissions = definePermissions("files", {
  file: {
    scope: "tenant", // 'tenant' | 'platform'
    actions: ["create", "read", "delete", "list"],
    assignable: true, // may appear in custom roles
    describe: { delete: "Delete any file in the workspace" },
  },
});
```

`PermissionKey` is a type derived from all registrations, so routes and `ctx.can()` calls are compile-checked.

**System roles (code, `access/domain/system-roles.ts`)**

```ts
export const tenantRoles = defineRoles("tenant", {
  owner: { rank: 100, grants: ["*"] },
  admin: {
    rank: 80,
    inherits: "member",
    grants: ["tenancy.*", "access.role:*", "activity.event:list"],
  },
  member: { rank: 10, grants: ["files.file:*", "users.profile:read"] },
});
export const platformRoles = defineRoles("platform", {
  super_admin: { rank: 100, grants: ["*"] },
  operator: {
    rank: 70,
    inherits: "support",
    grants: ["flags.*", "entitlements.*", "billing.*"],
  },
  support: {
    rank: 40,
    inherits: "viewer",
    grants: ["users.user:suspend", "sessions.session:revoke"],
  },
  viewer: { rank: 10, grants: ["*:read", "*:list"] },
});
```

**Hierarchy.** Single inheritance (`inherits` / `parent_role_id`, max depth 5, cycles rejected). Effective permissions = own grants ∪ parent's effective permissions. `rank` governs management: an actor may create, edit, assign or delete only roles with a rank strictly below their own, and may grant only permissions they themselves hold.

**O(1) resolution.**

1. At boot the registry gives every permission a bit index.
2. Each role's effective set is flattened **at write time** (boot for system roles; on create/update for custom roles, cascading to descendants) and stored in `roles.effective_permissions`, then compiled to a bitset.
3. A check is one bit test on the bitset already in `RequestContext`. No tree walk, no pattern match, no I/O.
4. Bitsets are cached in process keyed by `(role_id, tenants.roles_version)`; any role change bumps the version and broadcasts invalidation over Redis pub/sub. Membership → role lookup rides the session cache.

**Custom roles.** `TENANCY_CUSTOM_ROLES`: `off`, `on`, or `entitlement` (requires `roles.custom.enabled`, capped by `roles.custom.max`). A custom role belongs to one tenant, may inherit from a system or custom role, uses only `assignable` permissions, and obeys the rank and no-escalation rules. Deleting a role requires reassigning its members in the same request.

**Per-tenant role metadata (`role_settings`).** Every tenant can decorate any role it can see, system roles included: `alias`, `color` (validated hex), `icon`, `description`, `sort_order`, plus a size-capped `metadata` object validated by an extendable Zod schema (`access/domain/role-metadata.ts`). Role APIs return the role merged with that tenant's settings. Metadata never affects authorization.

**One role per membership.** Single mode uses the same model on the default tenant.

**DX.**

- `plinth g permission <module> <resource> <actions…>` · `plinth g role <key>` · `plinth rbac:matrix` (role × permission table) · `plinth rbac:sync` (upserts system roles; runs in `migrate`).
- Changing what a role allows = editing one `grants` array.
- Tests fail if a route references an unknown permission, a permission is unused, or a system role's compiled set changes without an updated snapshot.
- Permissions removed from code are stripped from custom roles at sync and recorded in activity.

**Endpoints.** List permissions (grouped, described), list/create/update/delete roles, get/update role settings, assign role to member.

### 6.5 Entitlements and plans (`entitlements`)

Works with or without a payment provider.

**Declaring (per module, `domain/entitlements.ts`)**

```ts
export const tenancyEntitlements = defineEntitlements({
  "tenants.max_owned": { scope: "user", type: "limit", default: 1 },
  "members.max": { scope: "tenant", type: "limit", default: 5 },
  "roles.custom.enabled": { scope: "tenant", type: "boolean", default: false },
  "roles.custom.max": { scope: "tenant", type: "limit", default: 0 },
});
```

Types: `boolean`, `limit` (integer, `-1` = unlimited), `config` (Zod-validated JSON). Built-ins also include `sessions.max_devices`, `storage.max_mb`, `activity.retention_days`.

**Who the plan belongs to (`BILLING_SUBJECT`)**
| Value | User-scope entitlements from | Tenant-scope entitlements from |
|---|---|---|
| `user` | the user's plan | the plan of the tenant's owner |
| `tenant` | platform defaults | the tenant's plan |
| `both` | the user's plan (`audience=user`) | the tenant's plan (`audience=tenant`) |

**Resolution order per key:** unexpired override for the subject → plan entitlement via `plan_assignments` → registry default. Results are cached per subject and invalidated on assignment, plan or override change.

**API for other modules:** `entitlements.get(ctx, key)`, `entitlements.assertWithin(ctx, key, currentUsage)`, and the `entitlement` route field. Modules depend on entitlement keys, never on plan names.

**Customization:** plans, their entitlements and per-subject overrides (custom deals, trials with expiry) are editable at runtime via admin API/console; every change is tracked.

### 6.6 Billing (`billing`)

- Client sends a plan key, never an amount. Checkout and card entry are provider-hosted.
- Webhooks: verify signature on raw body → insert `billing_events` (duplicates return 200) → acknowledge → process in a job. Handlers are idempotent and re-fetch provider state rather than trusting event order.
- Plan assignment changes only from verified provider state, never from the checkout redirect.
- States: `trialing`, `active`, `past_due` (kept until `grace_until`), `canceled`, `unpaid`, `paused`. Upgrade, downgrade, cancel-at-period-end, resume. Downgrades trigger `OVER_LIMIT_POLICY`.
- Nightly reconciliation repairs drift.
- `PaymentProviderPort` also exposes one-time payment checkout and refunds and emits `billing.payment.*` events, so product modules can reuse the webhook pipeline. No order logic ships.
- `PAYMENT_DRIVER=none` removes billing routes; plans are assigned by default or manually.

### 6.7 Users and profile (`users`)

`GET/PATCH /v1/users/me`, avatar set/remove, change email/phone with re-verification, delete account, own activity.

### 6.8 Files (`files`)

Request upload (policy + `storage.max_mb` check) → presigned URL with enforced type/size → direct upload → complete → worker verifies size and magic bytes, re-encodes images, marks `ready`/`rejected`. Orphan sweep. Adapters `s3`, `local`. `FileScannerPort` hook.

### 6.9 Feature flags (`flags`)

Order: disabled → user override → tenant override → plan override → percentage rollout → default. Postgres + in-process cache + Redis pub/sub invalidation. Flags are for operational rollout and kill switches; entitlements are for commercial access. Flags in the `system` group (auth kill switches, maintenance mode, sign-ups open) are the runtime controls surfaced on the console's Settings page.

### 6.10 Activity and history (`activity`)

One append-only stream answers: what did this user do, what happened in this tenant, how did this record change, and what did staff do.

**Record shape.** Actor (`user` / `platform_admin` / `system` / `job` / `webhook`, plus session), surface (`api` / `admin` / `worker` / `webhook`), action (permission-style key), target type + id, tenant, outcome (`success` / `denied` / `failed`), field-level `changes` (`[{ field, before, after }]`), metadata, request and trace ids, IP, user agent.

**Capture — three layers**

1. **Automatic entity history.** Repositories of tracked tables extend `TrackedRepository`. On insert/update/delete it diffs state and stages a record in the unit of work, committed in the **same transaction** as the change. Each column is classified in the schema: `track`, `redact` (records that it changed, never the value), or `ignore` (noise such as `last_seen_at`).
2. **Explicit events.** `activity.record()` in use cases for things that are not row changes: sign-in success/failure, token reuse detected, export requested, webhook received. High-volume failures are batched through the queue.
3. **Pipeline.** Stamps actor, surface and request context on every record and automatically records `denied` outcomes from permission, entitlement and tenant checks.

**Tracked by default:** users, profiles, identities, credentials (redacted), sessions, tenants, memberships, invites, roles, role settings, platform role assignments, plans, plan entitlements, plan assignments, overrides, prices, subscriptions, flags and overrides, files.

**Guarantees (enforced by tests)**

- Every table is declared `tracked` or `untracked(reason)`; undeclared tables fail the arch test.
- The e2e harness asserts that every successful non-GET request produced at least one activity event with its request id, unless the route declares `activity: { none: reason }`.
- Append-only: the application DB role has no UPDATE/DELETE grant on `activity_events` and a trigger rejects both.
- Redaction, cross-tenant isolation and retention each have security tests.

**Retention.** Monthly partitions; a job drops partitions older than `ACTIVITY_RETENTION_DAYS` (tenant-scope entitlement `activity.retention_days` can shorten what tenant admins see).

**Read APIs**

- `GET /v1/users/me/activity` — own account history.
- `GET /v1/tenants/:id/activity` — permission `activity.event:list`; filter by actor, action, target, outcome, time; cursor paginated.
- `GET /v1/<resource>/:id/history` — any tracked resource, via the `historyRoute()` helper.
- `GET /v1/admin/activity` — platform-wide; export to CSV/NDJSON as an async job.

### 6.11 Notifications · 6.12 Realtime

As v1.0: `EmailSenderPort` (`resend`, `smtp`, `console`), `SmsSenderPort` (`twilio`, `console`), sends as outbox-triggered jobs with retries and DLQ. Realtime gateway authenticates the handshake, joins `user:<id>` and `tenant:<id>` rooms, disconnects on revocation; payloads are Zod schemas documented in `docs/realtime.md`. Ships `session.revoked` and `role.changed` examples.

### 6.13 Platform services

Zod-validated config · typed `AppError`s with stable codes, RFC 9457 problem responses · `/v1` prefix, cursor pagination, `Idempotency-Key` · Redis sliding-window rate limits · security headers, CORS allowlist, body limits, strict schemas, explicit `trust proxy`, log redaction · transactional outbox with idempotent consumers.

## 7. Admin console (`admin/`)

### 7.1 Principles

- A client of the public API like any other: it calls only `/v1/admin/*` and `/v1/*` through the typed client generated from `openapi.json`. No private endpoints.
- Authorization is platform-scope RBAC (§6.4). The UI hides what a role cannot do; the API is what enforces it.
- Extending it is one file for CRUD screens, one generator command for custom pages.

### 7.2 Access and security

- Same sign-in as the product. Entry requires a platform role; the first admin is created by `pnpm plinth admin:create <email>` (no public path to admin).
- Admin sessions require a second step (email OTP), have a shorter TTL, and need step-up for destructive actions. Optional IP allowlist.
- Every action is recorded with `surface=admin`.
- `ADMIN_UI=embedded` serves the built files at `/admin` from the API (same origin, strict CSP, no CORS). `external` deploys `admin/dist` to any static host. `off` removes it.

### 7.3 Structure

```
admin/
  AGENTS.md  DESIGN.md
  src/
    app/              shell: router, providers, layout, nav, command palette, error boundary
    components/ui/    coss ui primitives (owned copies)
    components/       DataTable, ResourceForm, PageHeader, ConfirmDialog, DiffView, EmptyState, Can
    lib/              generated API client, auth, useCan(), query helpers, formatters
    resources/        defineResource descriptors
    features/<name>/  feature.ts (manifest), pages/, components/, api.ts, __tests__/
    handbook/         markdown loader, sidebar, search index
    styles/           tokens.css, globals.css
```

Rules: features import from `lib` and `components`, never from each other · server state in TanStack Query, URL state in the router, no global store · all requests through the generated client · every nav item, route and action is wrapped in a permission check.

### 7.4 Extension model

```ts
// admin/src/resources/flags.ts — this file alone yields list, detail, create/edit, delete, history tab, nav item
export default defineResource({
  name: "flags",
  label: "Feature flags",
  icon: "flag",
  group: "Platform",
  permission: "flags.flag",
  api: { base: "/v1/admin/flags" },
  columns: [
    { key: "key", sortable: true },
    { key: "enabled", as: "boolean" },
    { key: "rollout_percent", label: "Rollout" },
  ],
  filters: ["enabled", "group"],
  form: { fields: "auto", overrides: { description: { as: "textarea" } } }, // 'auto' = from the OpenAPI request schema
  history: true,
});
```

- `plinth g admin-resource <name> --from /v1/admin/<path>` writes a descriptor from the OpenAPI spec.
- `plinth g admin-page <feature> <name>` scaffolds a custom page, its route, nav entry and test.
- `plinth g module <name> --with-admin` creates backend admin routes and the descriptor together.
- A feature manifest (`feature.ts`) declares `{ id, nav, routes, permission }`; the shell discovers manifests by glob, so adding a feature never edits shared files.

### 7.5 Screens shipped

| Screen              | Contents and actions                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Overview            | Health and readiness, key counts, queue depth, recent activity, links to Grafana                                                   |
| Users               | Search; detail tabs: identities, devices, memberships, entitlements, activity. Suspend, revoke sessions, force reset, delete       |
| Tenants             | Detail tabs: members, roles, plan, entitlements + overrides, flags, activity. Suspend, freeze, transfer, create (provisioned mode) |
| Roles & permissions | System role matrix (read-only), per-tenant custom roles and role settings, platform role assignment                                |
| Plans & billing     | Plans, prices, entitlement editor, assignments, subscriptions, webhook events with reprocess                                       |
| Feature flags       | CRUD, overrides, rollout                                                                                                           |
| Files               | Browse, quarantine, delete                                                                                                         |
| Activity            | Filterable explorer, field-level diff viewer, export                                                                               |
| Jobs                | Queues, failed jobs, retry/discard, outbox lag                                                                                     |
| Settings            | System flags, auth method status, effective config (secrets masked, read-only)                                                     |
| API docs            | Scalar reference embedded against `/openapi.json`                                                                                  |
| Handbook            | Everything under `docs/` rendered with sidebar and full-text search                                                                |

### 7.6 Handbook

`docs/` is the single source, readable on GitHub, in the console and by AI agents. Chapters: Tour · Architecture · Request lifecycle · Module reference (module READMEs included automatically) · Auth · Tenancy and RBAC · Plans and entitlements · Activity and history · Extending the backend (recipes) · Extending the console · Writing an adapter · Testing · Deployment and runbooks · ADRs. Rendered at build time from Markdown with front-matter ordering; a docs test fails on broken links or a module without a chapter entry.

### 7.7 Design system

- Components: coss ui only (`npx shadcn@latest add @coss/<component>`), copied into `components/ui` and owned. No second component library.
- `admin/DESIGN.md` is the design contract: dense, table-first layouts; neutral palette with one accent; tokens in `styles/tokens.css`; 4 px spacing grid; one type family; light and dark themes; no gradients, glows or decorative emoji; WCAG 2.2 AA; full keyboard operation; `⌘K` command palette.
- Design skills for agents (install into `.claude/skills/` or the agent's equivalent; verify commands upstream):
  - **Impeccable** — primary build and audit skill; run its audit on every new screen.
  - **unslop** — final polish pass on new or changed screens (CC BY 4.0; keep attribution).
  - **coss skill** — correct coss/Base UI component APIs and composition.

### 7.8 Quality gates

Component and resource-engine tests (Vitest + Testing Library, 100% coverage on `lib/` and the resource engine) · Playwright flow per screen against a seeded API, with axe accessibility checks · route-level code splitting with an initial bundle budget enforced in CI · Biome + typecheck.

## 8. Observability

JSON logs with requestId, traceId, userId, tenantId, route, status, duration · OpenTelemetry for HTTP, pg, Redis, BullMQ; RED metrics per route; event-loop lag, pool saturation, queue depth, auth/billing/RBAC-denial counters · `/livez`, `/readyz` · `ErrorReporterPort` (`sentry`, `none`) · `deploy/compose.observability.yml` with a Grafana, Prometheus, Loki and Tempo bundle, starter dashboard and alert rules. Operational telemetry lives here; business history lives in `activity`.

## 9. Testing strategy (definition of "100% tested")

| Layer         | Scope                                                                                      | Tools              |
| ------------- | ------------------------------------------------------------------------------------------ | ------------------ |
| Unit          | Domain + use cases with fakes; RBAC compiler; entitlement resolver                         | Vitest, fast-check |
| Integration   | Repositories, cache, queue, history capture                                                | Testcontainers     |
| Conformance   | One suite per port; every adapter must pass                                                | Vitest             |
| E2E           | Full flows over HTTP on both HTTP adapters; activity assertion on every mutation           | Vitest             |
| Config matrix | Core flows under each `TENANCY_MODE` × `TENANT_ONBOARDING` × `BILLING_SUBJECT` combination | Vitest             |
| Security      | Abuse-case matrix                                                                          | Vitest             |
| Admin         | §7.8                                                                                       | Vitest, Playwright |
| Load          | Latency budgets as thresholds                                                              | k6                 |
| Docs / arch   | Route docs complete; dependency rules; tracked-table declarations; handbook links          | Vitest             |

**CI gates:** 100% line/branch/function coverage on API `src/` (exclusions listed in config); zero skipped tests; committed `openapi.json` and RBAC snapshot match generated output.

**Security matrix — each feature needs a test for every applicable row:**
account enumeration · brute force and lockout · OTP guessing/replay · magic-link replay · refresh-token reuse · session fixation · device-limit race · CSRF · OAuth `state`/PKCE tampering and unverified-email linking · JWT `alg`/`kid` confusion · IDOR on every `:id` route · cross-tenant read/write · **granting permissions the actor lacks** · **assigning or editing a role of equal or higher rank** · **custom roles when disabled or over limit** · **non-assignable permissions in custom roles** · **stale permission cache after role change** · **role metadata injection (invalid color, oversized or script-bearing values)** · **tenant-limit and seat-limit races** · **limit bypass after downgrade** · **entitlement spoofing via client input** · **tenant-first sign-up creating orphan tenants on failure** · **history tampering, secret leakage in diffs, cross-tenant history access** · **admin access without platform role or second step; step-up bypass** · mass assignment · injection · oversized/malformed bodies · upload MIME spoofing and path traversal · webhook forgery, replay, out-of-order · price tampering · rate-limit bypass via spoofed headers · secrets or PII in logs and errors.

## 10. DX tooling — `pnpm plinth <cmd>`

| Command                                                                                | Does                                                                                       |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `init`                                                                                 | Rename, generate keys, choose modules, auth methods, tenancy/billing modes; prune the rest |
| `g module <name> [--with-admin]`                                                       | Full module tree, tests, README, DI registration                                           |
| `g usecase` · `g route` · `g job` · `g event` · `g migration`                          | As named, each with tests and wiring                                                       |
| `g adapter <port> <name>`                                                              | Adapter skeleton wired to its conformance suite                                            |
| `g permission <module> <resource> <actions…>` · `g role <key>` · `g entitlement <key>` | Registry entries with tests                                                                |
| `g admin-resource <name> --from <path>` · `g admin-page <feature> <name>`              | Console screens                                                                            |
| `rbac:matrix` · `rbac:sync`                                                            | Print role × permission table · upsert system roles                                        |
| `admin:create <email>`                                                                 | Bootstrap a platform super admin                                                           |
| `routes` · `doctor` · `openapi` · `openapi:client`                                     | Route table · environment check · regenerate spec · typed client                           |
| `ai:sync`                                                                              | Regenerate `docs/ai/REPO_MAP.md` and refresh the code graph                                |

Also: `pnpm dev` (API + console with proxy), `pnpm check`, `pnpm check:changed`, `pnpm test:ai`, pre-commit hook, Conventional Commits, automated releases, devcontainer.

## 11. AI collaboration kit

```
AGENTS.md                        canonical instructions (below)
CLAUDE.md                        @AGENTS.md
.github/copilot-instructions.md  pointer
.cursor/rules/plinth.mdc         pointer
llms.txt                         index of docs
admin/AGENTS.md  admin/DESIGN.md console-specific rules and design contract
docs/ai/REPO_MAP.md              GENERATED: modules, public APIs, routes, tables, events, permissions, entitlements
docs/ai/CONVENTIONS.md           coding standard with good/bad examples
docs/ai/recipes/*.md             add-module, add-route, add-adapter, add-auth-method, add-permission, add-role,
                                 add-entitlement, track-a-table, add-admin-resource, add-admin-page, add-migration
docs/ai/TOOLING.md               token-saving and design tools: install + usage
src/modules/*/README.md          module cards
```

### AGENTS.md (ship this text)

```markdown
# Plinth — agent instructions

## Orient (cheapest first; stop when you have enough)

1. docs/ai/REPO_MAP.md — what exists and where.
2. The module card: src/modules/<name>/README.md.
3. Code graph: graphify-out/GRAPH_REPORT.md or a graph query, before any grep/glob.
4. Only then open the specific files those point to.
   Never read whole directories. Never open openapi.json, lockfiles, dist/, migrations/meta.

## Build

- Scaffold with `pnpm plinth g ...`; never hand-create module trees, DI wiring, permissions or admin screens.
- Follow the matching recipe in docs/ai/recipes/.
- Smallest change that satisfies the task. No speculative abstractions. New dependency = ask first.

## Standards (full: docs/ai/CONVENTIONS.md)

- Layering: domain → application → infra/http. Cross-module imports only via index.ts.
- No `any`, enums, default exports or parameter properties.
- Every input is a Zod schema; every route fills summary, description, examples, errors.
- All I/O through a port. No `process.env` outside platform/config. No `console`.
- Authorization: declare permissions with definePermissions; gate with the route `auth` field or ctx.can().
  Never compare role names. Never check plans; check entitlements.
- Tenant data only through TenantScopedRepository.
- New table: declare tracked/untracked and classify columns (track | redact | ignore).
- Every change ships tests: unit + e2e + the security-matrix rows that apply.

## Admin console

Work inside admin/ follows admin/AGENTS.md and admin/DESIGN.md. Prefer a resource descriptor
over a custom page. Use only components in admin/src/components.

## Verify

`pnpm check:changed` then `pnpm test:ai`. If routes changed: `pnpm plinth openapi`.
If permissions/roles changed: `pnpm plinth rbac:matrix` and update the snapshot.
If structure changed: `pnpm plinth ai:sync`.

## Research

Prefer a CLI with `--help` over large tool schemas. Use the compact-page tool in
docs/ai/TOOLING.md for the web. Fetch docs for the exact versions in package.json.

## Never

Edit applied migrations · weaken or skip tests · lower coverage thresholds · log secrets ·
trust client-supplied prices, tenant ids, roles or plan names · write to activity_events
outside the activity module · add auth logic outside the auth module.
```

### admin/AGENTS.md (ship this text)

```markdown
# Plinth console — agent instructions

- Read DESIGN.md before any UI work. Run the Impeccable audit, then an unslop pass, on new screens.
- CRUD screen → `pnpm plinth g admin-resource`. Anything else → `pnpm plinth g admin-page`.
- Components: only admin/src/components (coss ui). Add a primitive with the coss CLI; do not hand-write one.
- Data: generated API client + TanStack Query hooks in the feature's api.ts. No fetch(), no global store.
- Gate every nav item, route and action with <Can> / useCan(). Destructive actions use ConfirmDialog.
- Features never import each other. Styling uses tokens; no hard-coded colors or spacing.
- Each page ships a Playwright flow with an accessibility check.
```

### docs/ai/TOOLING.md covers (verify commands against each project's README)

| Goal                         | Tool                                                                        |
| ---------------------------- | --------------------------------------------------------------------------- |
| Fewer tokens finding code    | Graphify (graph refreshed by `plinth ai:sync` and a git hook)               |
| Less generated code          | Ponytail (not applied to tests or security checks)                          |
| Fewer tokens calling APIs    | OnlyCLI, generated from Plinth's `openapi.json`                             |
| Fewer tokens on web research | only-cli (`oc`)                                                             |
| Console design quality       | Impeccable, unslop, coss skill (§7.7)                                       |
| Less terminal noise          | `pnpm test:ai`, `pnpm check:changed`, `plinth routes`, `plinth rbac:matrix` |

## 12. Deployment and operations

- **Dockerfile:** multi-stage; builds the console when `ADMIN_UI=embedded`; production deps only; non-root; `HEALTHCHECK`; graceful shutdown.
- **Compose:** `compose.yml` (Postgres, Redis, Mailpit, MinIO), `compose.observability.yml`.
- **Render / Railway:** blueprints for `api`, `worker`, managed Postgres and Redis, pre-deploy `migrate` (runs migrations + `rbac:sync`).
- **CI:** check → tests (API + admin) → build → image scan → publish on tag.
- **Docs:** production checklist and runbooks (Redis down, webhook backlog, key rotation, migration rollback, locked-out admin).

## 13. Performance budgets

Reference: one `api` container, 2 vCPU / 2 GB, Postgres and Redis in-region. Initial targets, re-baselined after the first k6 run:

| Class                                                     | p95                 | p99      |
| --------------------------------------------------------- | ------------------- | -------- |
| Authenticated cached read                                 | ≤ 40 ms             | ≤ 100 ms |
| Write with one transaction (including its history record) | ≤ 80 ms             | ≤ 200 ms |
| Password hash endpoints                                   | budgeted separately |          |

Rules: no CPU-heavy work on the event loop · bounded concurrency on password endpoints · session, membership, role bitset, entitlement and flag lookups from cache, so the authorization path adds no database round trip · history written in the same transaction as the change (one extra insert), high-volume non-transactional events batched · at most one pooled connection per request · indexes verified on hot paths · load shedding with 503 + `Retry-After` · compression and TLS at the proxy · file bytes never transit the app · console assets served with immutable caching.

## 14. Build order (each milestone ends green)

- **M0 Foundation:** tooling, config, logger, errors, DI, HTTP port + pipeline, Express adapter, health, OpenAPI, Dockerfile, CI, arch test, CLI skeleton.
- **M1 Data + platform:** Drizzle, Redis, BullMQ, outbox, rate limiter, idempotency, telemetry.
- **M2 Activity:** `TrackedRepository`, unit of work, pipeline capture, read APIs, e2e activity assertion. Everything after this is tracked from day one.
- **M3 Users + email/password + sessions.**
- **M4 Remaining auth methods + notifications + step-up.**
- **M5 Access:** permission registry, role compiler, bitset checks, system roles, `rbac:*` commands.
- **M6 Entitlements + flags:** registry, plans, assignments, overrides, resolver.
- **M7 Tenancy:** modes, onboarding variants, limits, invites, custom roles, role settings, optional RLS.
- **M8 Files.**
- **M9 Billing:** Stripe adapter, webhooks, reconciliation, over-limit policy.
- **M10 Realtime.**
- **M11 Fastify adapter + HTTP conformance; e2e on both.**
- **M12 Admin API:** `admin.routes.ts` in every module, platform roles, admin second step, `admin:create`.
- **M13 Admin console:** shell, resource engine, generators, screens, API docs, Handbook, design pass.
- **M14 Hardening:** full security matrix, config matrix, k6 budgets, observability stack, deploy blueprints.
- **M15 Docs + AI kit + `plinth init`.**

## 15. Post-v1 roadmap

TOTP/passkeys · admin impersonation with dual attribution · multiple roles per membership · restore from history · data export · more OAuth, payment, storage and SMS adapters (community) · SSO.

---

Sections 16–21 were added at kit generation (2026-11-16) with the owner's approval. Where they conflict with §1–§15, they win.

## 16. Scope: MUST, SHOULD, LATER

Feature IDs are cited by blueprint items and epics. Plan lint fails if a MUST ID is not cited.

**MUST (v1)**

- F01 MUST Config (Zod env), pino logging with redaction, typed `AppError` + RFC 9457 problems, request ids — §4, §6.13, §8
- F02 MUST `HttpServerPort`, framework-neutral pipeline, Express 5 adapter, security headers, CORS allowlist, body limits — §3.5, §6.13
- F03 MUST DI root and scoped containers, module manifests, `createTestContainer` — §3.6
- F04 MUST OpenAPI 3.1 generated from route definitions, committed `openapi.json`, Scalar at `/docs` — §2, §6.13
- F05 MUST `/livez`, `/readyz` — §8
- F06 MUST Postgres via Drizzle, `migrate` process, history declaration on every table — §5, §3.6
- F07 MUST Docker image, compose, CI, image published to GHCR on tag, rollback procedure — §12
- F08 MUST Public plan catalog `GET /v1/plans`, `GET /v1/plans/{key}` (reference slice) — §6.5
- F09 MUST Redis cache, BullMQ `worker`, transactional outbox, `Idempotency-Key`, sliding-window rate limits — §6.13
- F10 MUST Activity history: three capture layers, guarantees, user/tenant/resource read APIs, retention — §6.10
- F11 MUST Users and profile, without avatar — §6.7
- F12 MUST `email_password` auth: verification, reset, lockout, enumeration-safe responses — §6.1
- F13 MUST Sessions and devices: EdDSA JWT + JWKS, refresh rotation and reuse detection, cookie and bearer modes, device limit — §6.2
- F14 MUST `email_otp` and `magic_link` — §6.1
- F15 MUST Notifications: `EmailSenderPort` with `console` and `smtp`, outbox-triggered jobs, retries, DLQ — §6.11
- F16 MUST Step-up and account deletion — §6.1
- F17 MUST Access: permission registry, role compiler, bitset checks, system roles, `rbac:matrix`, `rbac:sync` — §6.4
- F18 MUST Entitlements: registry, plans, assignments, overrides, resolver — §6.5
- F19 MUST Tenancy: modes, onboarding variants, limits, invites, lifecycle, switch tenant — §6.3
- F20 MUST CLI: `plinth init` (rename, generate keys, write `.env`, choose tenancy mode), `g module`, `g migration` — §10
- F21 MUST Reference deployment of `api` + `worker` + `migrate` on a free host — §12

**SHOULD (after v1)**

- F30 SHOULD Fastify adapter, HTTP conformance suite, e2e on both adapters — §2, §3.5
- F31 SHOULD Admin API, platform roles, admin second step, `admin:create` — §7.2, §6.4
- F32 SHOULD Feature flags — §6.9
- F33 SHOULD Files with `s3` and `local` adapters, avatar — §6.8, §6.7
- F34 SHOULD Billing with Stripe, webhooks, reconciliation, over-limit policy — §6.6, §6.3
- F35 SHOULD OAuth Google and GitHub — §6.1
- F36 SHOULD Custom roles and role settings — §6.4
- F37 SHOULD Resend email adapter — §6.11
- F38 SHOULD OpenTelemetry, Prometheus `/metrics`, Sentry adapter — §8
- F39 SHOULD Remaining generators: usecase, route, job, event, adapter, permission, role, entitlement — §10
- F40 SHOULD Admin activity explorer API and async export — §6.10

**LATER**

- F50 LATER Admin console — §7
- F51 LATER Realtime gateway — §6.12
- F52 LATER `phone_otp` with Twilio, `username_password` — §6.1
- F53 LATER Observability compose bundle — §8
- F54 LATER k6 load tests against §13 budgets — §13
- F55 LATER Postgres RLS — §6.3
- F56 LATER Full config-matrix suite — §9
- F57 LATER `llms.txt`, devcontainer, automated releases — §10, §11
- F58 LATER Agent token tooling and console design skills, re-evaluated when the console starts — §7.7, §11

**v1 is done when** every MUST holds, `pnpm check` is green on `main`, the reference deployment passes the smoke test, and a fresh clone reaches a running API in under 10 minutes by following README.

**Overrides of §1–§15 approved at kit generation**

- Coverage (§9): 100% line, branch and function coverage on `src/modules/*/domain` and `src/modules/*/application`; 90% of changed lines elsewhere in `src/`; mutation testing on high-risk modules at every phase gate. A blanket 100% is dropped.
- E2E runs on Express only until F30.
- AI kit (§11) and handbook (§7.6): one `AGENTS.md`, one `docs/HANDBOOK.md`. Module READMEs, `docs/ai/*`, `CONVENTIONS.md` and recipes are replaced by HANDBOOK chapters 5 and 7 plus lint config. `REPO_MAP.md` is replaced by `pnpm map`, which prints and is not committed. `admin/AGENTS.md` and `admin/DESIGN.md` arrive with F50 as sections of `AGENTS.md` and `HANDBOOK.md`.
- §3.2: no per-module `README.md`; the module card is the module's section in HANDBOOK chapter 5.
- §3.2 layout: entry points live in `src/main/` (`api.ts`, `worker.ts`, `migrate.ts`); shared code in `src/platform/`; `src/modules/index.ts` lists enabled modules.

## 17. Project-type answers (non-functional)

Plinth is an API server distributed as a template.

- **Deployed** means a Git tag `vX.Y.Z` on `main` whose image is published to `ghcr.io/devnadeemashraf/plinth:X.Y.Z`; after F21, also running on the reference host. **Rollback** means redeploying the previous image tag. Migrations are forward-only, so a rollback never runs a down migration; the expand → backfill → contract rule keeps the previous image compatible.
- **Smoke test (main flow):** Phase 0: start the image with Postgres → `/readyz` 200 → `GET /v1/plans` returns the seeded default plan. From F12: sign up → read the verification token from the `console` email adapter → verify → sign in → `GET /v1/users/me` 200 → one activity event exists with that request id. Automated by `scripts/smoke.ts` against a base URL, in CI on every PR.
- **Test layers:** unit (Vitest, fast-check), integration (Testcontainers Postgres and Redis), port conformance, e2e over HTTP, security-matrix rows per feature. Slow: mutation (Stryker), k6 (F54).
- **Budgets:** §13 latencies (enforced by F54; until then, an e2e test asserts the authorization path makes no DB query). Image ≤ 250 MB compressed. Cold start to `/readyz` 200 ≤ 3 s against a running Postgres.
- **Template-specific concerns:** generator output must pass `check` (tested by generating into a temp copy). `plinth init` must leave a green `check`. Public ports, `RouteDefinition`, the module manifest and the generator CLI are the template's public API and follow SemVer.
- **Not applicable:** code signing, store review, mobile, offline, installers.

## 18. Contracts (sources of truth)

| Contract | File | Checked by |
| --- | --- | --- |
| HTTP API | `openapi.json`, generated from route definitions | `check` regenerates it and fails on diff |
| Database | `src/modules/*/infra/schema.ts`; migrations in `drizzle/` | drizzle-kit `check`; integration tests apply all migrations |
| History classification | the `history` declaration beside each table | arch test fails on an undeclared table |
| Environment | `src/platform/config/schema.ts` | boot fails fast; `.env.example` is generated from it |
| Permissions and roles | `src/modules/*/domain/permissions.ts`, `src/modules/access/domain/system-roles.ts`, snapshot under `src/modules/access/__tests__/` | snapshot test |
| Entitlements | `src/modules/*/domain/entitlements.ts` | registry test |
| Module manifest and ports | `src/platform/kernel/module.ts`, `src/platform/kernel/ports/` | `tsc`; conformance suites |

## 19. Concerns dismissed for v1

- Backup and restore beyond the host's managed Postgres backups: the restore drill runs at the phase gate once F21 exists; no custom backup tooling.
- Cost limits: free tiers only; the reference host's limits are recorded in VERSIONS.
- Accessibility: no UI in v1; WCAG 2.2 AA applies from F50.
- Abuse beyond rate limiting and lockout (CAPTCHA, bot scoring): out of scope.

## 20. Open decisions

| Decision | Assumption in use | First item it blocks |
| --- | --- | --- |
| F08 (public plan catalog) is not in §1–§15; it was added as the reference slice | Approved as part of v1 | P0-06 |
| Reference host for F21 | Render free tier, confirmed by a spike in E9 | first item of E9 |

## 21. Legal flags

- Licence MIT. Third-party licences are recorded in VERSIONS; `opengrep` is LGPL-2.1 and is used only as a dev tool, never distributed.
- Plinth advertises security-sensitive features (auth, sessions, billing). The MIT warranty disclaimer applies, but get an independent security review before promoting v1 as production-grade.
- Activity records hold personal data (emails, IPs, user agents), which makes adopters data controllers under GDPR and similar laws; HANDBOOK Operations will document retention and deletion. This is not legal advice; adopters need their own counsel.
