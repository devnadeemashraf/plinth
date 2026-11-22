---
name: plinth-live-research-and-versions
description: Enforces zero-memory-guessing online documentation research and verified latest stable npm package pinning inside pnpm-workspace.yaml catalog:. Use before adding or upgrading any dependency, implementing unfamiliar library APIs, or debugging tricky framework/compiler issues.
---

# `plinth` Live Research & Latest-Version Enforcer

## Non-Negotiable Rules
1. **Never rely on training memory** for package versions, TypeScript 7.0 flags, Biome v2 rules/schemas, Zod v4 APIs, Drizzle ORM syntax, Fastify v5 / Express 5 middleware, pnpm 12 config keys, OpenTelemetry SDK APIs, Razorpay/Stripe webhook specs, or Terraform provider syntax.
2. **Never write `^` or `~`** in any `package.json` or `pnpm-workspace.yaml`.

## Execution Procedure

### A. When Adding or Upgrading Dependencies
1. Inspect local runtime first: `node -v` and `pnpm -v`.
2. Query live npm registry for each candidate package:
   ```bash
   pnpm view <pkg> dist-tags version engines peerDependencies --json
   ```
   If shell network access is unavailable, use live web search on `npmjs.com` and the library's official GitHub Releases page.
3. Verify compatibility with Node 24+/26 LTS, pure ESM, and TypeScript 7.0 (`erasableSyntaxOnly`).
4. Check release notes for breaking changes and config updates (e.g., matching `biome.json` `$schema` to the exact Biome version).
5. Write the exact version into root `pnpm-workspace.yaml` under `catalog:` (keeping `saveExact: true`, `catalogMode: strict`, and `minimumReleaseAge: 1440`), and use `"catalog:"` in workspace `package.json`.
6. Run `pnpm install && pnpm audit --audit-level=high && pnpm verify`.

### B. When Implementing or Debugging Any Non-Trivial API
1. Search live sources in strict trust order:
   1. Official documentation & IETF/OWASP specifications
   2. Official GitHub Releases, changelogs, and maintainer issue threads
   3. Recent (<= 2 years old) high-signal StackOverflow answers & engineering blogs
2. Cross-check API signatures against the installed `.d.ts` files in `node_modules/` when present.
3. Document the exact URLs/RFCs consulted in `docs/ai/SESSION_LOG.md` so future sessions can trace every decision.
