# plinth

**The production TypeScript backend you would spend 6 months building—architected to Prodictiongrade standards and ready on Day One.**

`plinth` is a loosely coupled, hexagonal TypeScript backend platform and interactive scaffolding CLI (`plinth init`) designed so you can drop in your business logic and ship straight to production without reinventing tenancy, auth, permissions, billing, observability, or deployment plumbing.

Built for **Node.js 24+/26 LTS**, **TypeScript 7.0** (Go-native `tsc`), **Biome**, **Vitest**, and **pnpm 12** strict workspaces.

---

## Why `plinth`?

Most backend boilerplates collapse the moment real production requirements arrive: an ORM leaks into every route handler, multi-tenancy is bolted on as an afterthought `WHERE` clause (one forgotten filter away from a cross-tenant data breach), secrets live in plaintext config tables, and local development requires five cloud accounts just to test a login flow.

`plinth` solves this structurally:

| Pillar                                            | What `plinth` Ships Out of the Box                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Interactive Scaffolding (`plinth init`)**       | `shadcn init`-style CLI. Pick tenancy mode, SQL dialect, HTTP engine, cache/queue, billing provider, compliance pack, and deployment target. Get a clean, dependency-trimmed standalone repo.                                                                                                                                                                       |
| **Strict Hexagonal Architecture**                 | Core domain and business modules have **zero imports** from Express, Fastify, Drizzle, Redis, Stripe, or Razorpay—enforced automatically by CI **Architectural Fitness Tests**.                                                                                                                                                                                     |
| **100% Multi-Tenant Isolation**                   | Choose `single` or `multi` at scaffold time. Compile-time branded `TenantContext` makes unscoped tenant queries a TypeScript build error, backed by PostgreSQL Row-Level Security (`SET LOCAL`) defense-in-depth.                                                                                                                                                   |
| **Discord-Style `O(1)` Bitmask RBAC**             | Arbitrary-width `BigInt` permission bitmasks (`1n << n`), hierarchical scope overwrites (`@everyone -> roles -> member`, depth <= 4), strict rank anti-escalation invariants, global or tenant-isolated roles, and Zod-validated extensible role metadata (`colorHex`, badges, icons).                                                                              |
| **Slim, Feature-Flagged Auth + Encrypted Config** | Email/Username + Argon2id password and OAuth2/OIDC (Google, GitHub, Apple, generic OIDC, Local Mock OIDC) behind live Admin toggles. Runtime secrets are **AES-256-GCM envelope-encrypted** at rest. Dual sessions: `HttpOnly` opaque cookies + CSRF for browsers; `Ed25519` JWTs + rotating refresh tokens with reuse-detection revocation for mobile/API clients. |
| **Zero-Build SSR Admin Panel**                    | Clean, minimal, brand-themed server-rendered HTML/CSS admin panel (`/_admin`) with zero frontend build pipeline. CLI-only super user creation (`plinth admin:create-superuser`) with mandatory TOTP MFA, optional CIDR IP allowlist, strict CSP, and built-in Dev/Ops Inspector.                                                                                    |
| **Region-Aware Pluggable Billing**                | Normalized checkout, subscriptions, plan entitlements, and raw-body HMAC idempotent webhooks. Ships with **Local Fake Checkout + Webhook Simulator**, **Razorpay** (INR, UPI, cards, subscriptions, GST/HSN metadata), and **Stripe** (Global).                                                                                                                     |
| **100% Visibility, Zero PII Leakage**             | Pino structured JSON logs + OpenTelemetry (OTLP) traces & RED/USE metrics wrapped in a mandatory dual-layer `RedactionEngine` + typed `Redacted<T>` wrapper. Full correlation without ever leaking passwords, tokens, emails, PAN/Aadhaar, or card numbers.                                                                                                         |
| **Zero-Account Local Stubs**                      | Run the entire backend offline immediately: SQLite, In-Memory LRU, DB-backed Job Runner + Transactional Outbox, Local Email Catcher (rendered in Admin UI), Local Object Storage, Mock OIDC, and Fake Billing Simulator—each paired with a 1-page **Swap-to-Production Handbook**.                                                                                  |
| **Deploy Anywhere Handbooks**                     | Ready-to-run IaC and layer-by-layer operational handbooks for **Render / Railway** (including $0 free-tier single-container mode), **VPS (Docker Compose + Caddy)**, **AWS (Terraform)**, and **GCP (Terraform)**.                                                                                                                                                  |
| **AI-Native Engineering Kit**                     | Ships with canonical architecture rules, session-continuity trackers, live-documentation policies, and native skills for **Gemini CLI / Antigravity**, **Claude Code**, **OpenAI Codex**, and **Cursor**.                                                                                                                                                           |

---

## Architecture at a Glance

```text
                        Inbound HTTP / SSE / Webhooks
                                     |
          +--------------------------+--------------------------+
          |  HTTP Transport Adapters (Fastify v5 | Express 5)   |
          |  Zod Route Contracts -> OpenAPI 3.1 + RFC 9457      |
          +--------------------------+--------------------------+
                                     |
          +--------------------------v--------------------------+
          |  Security & Resilience Pipeline                     |
          |  Timeouts | Body Caps | Rate Limits | TenantContext |
          |  Idempotency-Key | Dual Session | BigInt RBAC O(1)  |
          +--------------------------+--------------------------+
                                     |
          +--------------------------v--------------------------+
          |  Domain Modules (src/modules/* & packages/modules)  |
          |  Auth | Tenants | RBAC | Users | Brand | Billing    |
          |  Compliance (GDPR/DPDP) | Admin SSR | Your Domain   |
          |  ** ZERO direct imports of infra SDKs (CI-enforced)**|
          +--------------------------+--------------------------+
                                     |
          +--------------------------v--------------------------+
          |  Core Ports (@plinth/core)                          |
          |  Database | Cache | Queue/Outbox | Storage | Email  |
          |  Billing | Analytics | Telemetry + RedactionEngine  |
          +--+-------+-------+-------+-------+-------+-------+--+
             |       |       |       |       |       |       |
          SQLite   Memory  DB Poll  Local   Stub    Stub    Pino
          PG+RLS   Redis   BullMQ   S3/R2   SMTP   Razorpay OTel
          MySQL                                    Stripe
```

---

## Performance & Reliability Budgets (Baked In)

`plinth` refuses unbounded defaults. Every I/O path carries explicit guardrails:

- **Latency Target:** p50 < 25ms | **p95 < 100ms** | **p99 < 250ms** (RBAC bitmask check < 0.1ms in memory)
- **Throughput Envelope:** 10–5,000 RPS stateless horizontal scaling
- **Hard Payload Caps:** 1 MB JSON body | 5 MB avatar upload (magic-byte verified & EXIF-stripped) | 4 KB role metadata | 8 KB profile metadata
- **Bounded Timeouts:** 10s HTTP request | 5s DB query | 3s outbound HTTP | 2s `/health/ready` | 15s graceful `SIGTERM` drain
- **Pagination:** Cursor-based by default (default 20, hard cap 100)
- **Graceful Degradation:** Read caches fail open behind a circuit breaker if Redis drops; rate-limiting & revocation degrade to bounded local in-memory fallback with high-severity alerts.

---

## Monorepo Layout (Source of Truth)

```text
plinth/
├── packages/
│   ├── core/                     # Zero-framework kernel, ports, config, redaction, bitmask RBAC, RFC 9457
│   ├── modules/                  # Auth, Tenants, RBAC, Users, Brand, Billing, Compliance, Admin SSR
│   ├── adapter-http-fastify/     # Default HTTP driver
│   ├── adapter-http-express/     # Express 5 HTTP driver
│   ├── adapter-db-sqlite/        # Instant zero-config SQL adapter
│   ├── adapter-db-postgres/      # Drizzle PostgreSQL + RLS defense-in-depth
│   ├── adapter-db-mysql/         # Drizzle MySQL
│   ├── adapter-cache-memory/     # Bounded LRU local cache
│   ├── adapter-cache-redis/      # Redis / Valkey production cache
│   ├── adapter-queue-db/         # DB polling queue + transactional outbox (free-tier safe)
│   ├── adapter-queue-bullmq/     # Distributed Redis BullMQ worker
│   ├── adapter-storage-local/    # Local disk bucket stub
│   ├── adapter-storage-s3/       # AWS S3, Cloudflare R2, MinIO, GCS S3-interop
│   ├── adapter-billing-stub/     # Local checkout + one-click webhook simulator
│   ├── adapter-billing-razorpay/ # India payments (UPI, cards, subscriptions, GST/HSN)
│   ├── adapter-billing-stripe/   # Global payments & subscriptions
│   ├── adapter-email-stub/       # Local Email Catcher (viewed in Admin UI)
│   ├── adapter-email-smtp/       # SMTP / Resend / SES-compatible email adapter
│   ├── adapter-analytics-stub/   # Consent-aware masked event logger + PostHog/OTLP hook
│   ├── contract-tests/           # Shared black-box compliance suites every adapter MUST pass
│   └── cli/                      # `plinth init`, `plinth add`, `plinth deploy:add`, `plinth admin:*`
├── blueprints/                   # Render/Railway, VPS+Caddy, AWS Terraform, GCP Terraform
├── docs/                         # EDD, Roadmap, ADRs, AI Rules, Deployment & Adapter Handbooks
└── .gemini/skills/               # Ready-to-use Gemini CLI / Antigravity engineering skills
```

---

## Getting Started (Building `plinth` with Gemini)

This repository kit is engineered to be built cleanly chunk-by-chunk (C01 through C12) using **Gemini** (Gemini CLI, Antigravity, or any AI coding agent) with **zero architectural drift** across fresh or continued sessions.

1. **Read the Control Plane First:**
   - [`GEMINI.md`](./GEMINI.md) — Root AI operating instructions (loaded automatically by Gemini CLI / Antigravity).
   - [`docs/EDD.md`](./docs/EDD.md) — Locked Engineering Design Document (all architectural decisions).
   - [`docs/ROADMAP.md`](./docs/ROADMAP.md) — 5-Wave, 12-Chunk MVP-first build plan.
   - [`docs/ai/PROJECT_STATE.md`](./docs/ai/PROJECT_STATE.md) — Current build progress & handoff state.
2. **Use the Built-In Skills:**
   - See [`SKILLS_GUIDE.md`](./SKILLS_GUIDE.md) for every skill included in `.gemini/skills/` and exact copy-paste prompts.
3. **Run Quality Gates on Every Chunk:**
   ```bash
   pnpm verify   # Biome lint -> TS 7.0 typecheck -> Architectural Fitness Tests -> Vitest + 85% coverage
   ```

---

## Documentation Map

- **[`GEMINI.md`](./GEMINI.md)** — Primary Gemini instructions & session bootstrap checklist
- **[`SKILLS_GUIDE.md`](./SKILLS_GUIDE.md)** — Complete guide to installing and invoking all 7 engineering skills
- **[`docs/EDD.md`](./docs/EDD.md)** — Locked Engineering Design Document
- **[`docs/ROADMAP.md`](./docs/ROADMAP.md)** — 12-Chunk MVP-first roadmap (C01–C12)
- **[`docs/adr/0001-core-architectural-decisions.md`](./docs/adr/0001-core-architectural-decisions.md)** — Why every key technology & design choice was made
- **[`docs/ai/ARCHITECTURE_RULES.md`](./docs/ai/ARCHITECTURE_RULES.md)** — Hard hexagonal, security, RBAC, tenancy, and masking invariants
- **[`docs/ai/SESSION_CONTINUITY.md`](./docs/ai/SESSION_CONTINUITY.md)** — Fresh-session & continued-session operating protocol
- **[`docs/ai/PROJECT_STATE.md`](./docs/ai/PROJECT_STATE.md)** — Living progress tracker (update after every chunk)
- **[`docs/ai/SESSION_LOG.md`](./docs/ai/SESSION_LOG.md)** — Append-only chronological engineering log
- **[`docs/ai/QUALITY_GATES.md`](./docs/ai/QUALITY_GATES.md)** — Strict TDD, coverage, fitness, and verification rules
- **[`docs/ai/AUDIT_CHECKLIST.md`](./docs/ai/AUDIT_CHECKLIST.md)** — Adversarial Principal Engineer & Security Auditor checklist
- **[`docs/ai/DEPENDENCY_AND_VERSION_POLICY.md`](./docs/ai/DEPENDENCY_AND_VERSION_POLICY.md)** — Mandatory latest-version lookup + exact pnpm catalog pinning
- **[`docs/ai/LIVE_RESEARCH_PROTOCOL.md`](./docs/ai/LIVE_RESEARCH_PROTOCOL.md)** — Zero-memory-guessing online documentation & research mandate
- **[`docs/ai/PROMPT_RECIPES.md`](./docs/ai/PROMPT_RECIPES.md)** — Ready-to-use prompts for Gemini sessions
- **[`docs/specs/C01-FOUNDATION-SPEC.md`](./docs/specs/C01-FOUNDATION-SPEC.md)** — Ready-to-build blueprint for Chunk C01 (with audit fixes + pnpm 12 catalog pinning)
- **[`docs/deployment/DEPLOYMENT_HANDBOOK_BLUEPRINT.md`](./docs/deployment/DEPLOYMENT_HANDBOOK_BLUEPRINT.md)** — Specification for the Render/Railway, VPS, AWS, and GCP operational handbooks

---

## License

MIT (or update to your chosen license before publishing).
