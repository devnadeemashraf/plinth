# Grill Session Question Bank

Use during Phase 1 across 3 to 5 focused Grill Rounds (6 to 10 sharp questions per round).

## Round 1: Mission, Scope & Template Boundaries
- Reusable golden template vs. specific backend? What must be pluggable vs. opinionated?
- Exact 2 to 3 core Day-1 workflows and explicit non-goals?
- Synchronous HTTP, SSE/streaming, background jobs, or hybrid?
- Primary consumers (browsers, mobile apps, third-party APIs, internal services)?

## Round 2: Scale, Latency Budgets & Reliability SLOs
- Day-1 vs. 12-month peak RPS, burst multipliers, concurrent connections?
- Hard latency budgets (p50, p95, p99) and availability SLO (99.9%+)?
- Max request/response/upload payload sizes?
- RPO/RTO targets and degradation policy when DB/cache/downstreams stall or fail?

## Round 3: Tech Stack, Contracts & Data Architecture
- Language, runtime LTS version, compiler/linter/test toolchain?
- Contract-first validation (Zod -> OpenAPI / Protobuf) and versioning strategy?
- Primary datastore(s), migrations (expand-and-contract), caching invalidation, idempotency keys, transactional outbox, and data lifecycle (UUIDv7, soft deletes, audit logs, erasure)?

## Round 4: Security, Identity & Threat Model
- Exact auth methods, token/session model, revocation & reuse detection?
- Authorization model (RBAC/bitmask/ReBAC) and anti-escalation invariants?
- Multi-tenancy isolation boundary (compile-time guards, DB RLS) and anti-IDOR strategy?
- Secrets encryption at rest, SSRF egress filtering, rate-limit dimensions, and compliance packs (GDPR/DPDP)?

## Round 5: Observability, Testing & Operational Lifecycle
- Structured logging + PII masking + OTLP traces + RED/USE metrics + health probes?
- Deployment targets, graceful SIGTERM drain, local stubs, CI quality gates, and AI-editor enforcement?

## Staff Engineer Pushback Playbook
- Reject vague answers ("standard auth", "infinitely scalable", "add tests later").
- Flag contradictions immediately and log accepted defaults + trade-offs as explicit ADRs.
