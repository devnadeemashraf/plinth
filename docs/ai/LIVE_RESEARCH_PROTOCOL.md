# Live Online Research Protocol (Zero-Memory-Guessing Law)

**Core Rule:** AI training memory is stale, lossy, and prone to subtle API hallucinations—especially for rapidly evolving 2025–2026 tools like **TypeScript 7.0**, **Biome v2**, **Zod v4**, **Drizzle ORM**, **Fastify v5**, **Express 5**, **pnpm 12**, **OpenTelemetry**, **Razorpay**, and **Stripe**.

**You MUST search and read live online sources before writing non-trivial implementation code or debugging unfamiliar failures.**

---

## Mandatory Online Research Triggers

You MUST perform live web search / official doc fetches whenever ANY of the following occurs:

1. **Adopting or configuring any library/tool for the first time in a chunk:**
   - Exact Zod v4 APIs (`z.url()`, `superRefine`, OpenAPI generation, error customization).
   - Exact TypeScript 7.0 `tsconfig` flags and `tsc --build` behavior.
   - Exact Biome v2 config schema (`files.includes`, `assist`, rule names).
   - Exact Drizzle ORM dialect specifics (Postgres RLS transactions, MySQL JSON/binary, SQLite WAL & `better-sqlite3` / `node:sqlite`).
   - Exact Fastify v5 & Express 5 async error handling, raw-body capture, and cookie/multipart plugins.
   - Exact OpenTelemetry Node SDK v2 / OTLP exporter setup and Pino trace context injection.
   - Exact Razorpay & Stripe webhook signature headers, raw-body HMAC schemes, and subscription event lifecycles.
   - Exact Node.js 24/26 stdlib crypto APIs (`Ed25519`, `AES-256-GCM`, `timingSafeEqual`, `argon2` or `crypto.scrypt` / `@node-rs/argon2`).
2. **Whenever stuck or encountering a compiler, runtime, linter, or test error** that isn't an obvious typo in your own code.
3. **Whenever implementing security-sensitive or RFC-backed standards** (RFC 9457 Problem Details, RFC 9562 UUIDv7, RFC 6238 TOTP, RFC 7636 PKCE, OWASP ASVS, India DPDP Act 2023, GDPR Art. 17/20).
4. **Whenever writing deployment IaC** (Render `render.yaml`, Railway `railway.toml`, Caddyfile v2, AWS ECS/RDS/ElastiCache Terraform provider v5+/v6, GCP Cloud Run/Cloud SQL Terraform provider).

---

## Source Trust Hierarchy (Consult in This Order)

1. **Primary Official Documentation & Specs** — Official library docs, Node.js docs, RFCs (IETF), OWASP cheat sheets, AWS/GCP/Render/Railway/Razorpay/Stripe official API references.
2. **Official GitHub Releases, Changelogs & Migration Guides** — Exact breaking changes, deprecated options, and version-specific bugs.
3. **High-Signal Engineering Discussions** — GitHub Issues (maintainer responses), StackOverflow (accepted & upvoted modern answers—verify dates!), and reputable engineering blogs (e.g., Discord engineering blog for bitmask RBAC, Cloudflare/AWS/Google SRE blogs).

> **Date Hygiene Check:** Ignore StackOverflow answers or blog posts older than 2 years if a newer major version of the library exists (e.g., do NOT apply Zod v3, Biome v1, Express 4, or pnpm v8 advice to `plinth`).

---

## Anti-Hallucination Checklist (Before Writing Code)
- [ ] Did I verify the exact import paths and exported function signatures from current official docs or installed `.d.ts` files?
- [ ] Did I verify the exact config schema keys for the exact pinned version?
- [ ] When debugging an error, did I search the exact error code/message online instead of blindly guessing 3 patches in a row?
- [ ] Did I cite the key official docs/RFCs I consulted in `docs/ai/SESSION_LOG.md` so future sessions know the exact reference?
