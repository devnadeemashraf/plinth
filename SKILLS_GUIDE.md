# `plinth` AI Skills Guide (Gemini CLI, Antigravity, Claude Code & Codex)

This kit ships **7 production engineering skills** under **`.gemini/skills/`**—including the core **`backend-scaffold-architect`** workflow we used to design `plinth` AND the **`plinth-chunk-builder`** + **`plinth-live-research-and-versions`** workflows crafted specifically for building `plinth` cleanly across sessions.

---

## Included Skills Inventory

| Skill Name                              | Folder                                              | Purpose                                                                                                                                                                                                                                           | When to Use                                                                                                         |
| --------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **`backend-scaffold-architect`**        | `.gemini/skills/backend-scaffold-architect/`        | The core 4-phase Prodictiongrade engineering loop (**Grill -> Chunked Plan -> Strict TDD -> Adversarial Audit**) with full `grill-bank.md` & `audit-checklist.md`.                                                                                | Designing any new service, major subsystem, or running the full 4-phase engineering workflow from scratch.          |
| **`plinth-chunk-builder`**              | `.gemini/skills/plinth-chunk-builder/`              | The end-to-end `plinth` build loop: reads `PROJECT_STATE.md` -> researches live docs & latest versions -> writes 5-category TDD tests -> implements -> runs `pnpm verify` -> runs Phase 4 audit -> updates `PROJECT_STATE.md` & `SESSION_LOG.md`. | Building Chunks **C01 through C12** in either a fresh or continued session.                                         |
| **`plinth-live-research-and-versions`** | `.gemini/skills/plinth-live-research-and-versions/` | Enforces **zero memory guessing** (live official docs/RFCs/StackOverflow/blogs) and **verified latest stable npm versions** pinned exactly in `pnpm-workspace.yaml` `catalog:`.                                                                   | Before installing/upgrading any package, adopting an unfamiliar API, or debugging a library issue.                  |
| **`plinth-add-feature-module`**         | `.gemini/skills/plinth-add-feature-module/`         | Turns any business requirement into a compliant `plinth` vertical slice (Zod contract -> OpenAPI -> TDD -> Domain -> `TenantContext` Repo -> BigInt RBAC -> Outbox -> Audit).                                                                     | Whenever you slap real business requirements onto `plinth` and want to ship fast without violating hexagonal rules. |
| **`plinth-add-adapter`**                | `.gemini/skills/plinth-add-adapter/`                | Implements or swaps any Port adapter (HTTP, DB, Cache, Queue, Storage, Email, Billing, Analytics), proves parity via shared Contract Tests, and writes a 1-page Swap Handbook.                                                                    | Adding a new vendor/driver (e.g., Hono, Resend, Cloudflare R2, custom gateway).                                     |
| **`plinth-security-audit`**             | `.gemini/skills/plinth-security-audit/`             | Hostile Principal Engineer & Security Auditor review across all 5 audit domains (Correctness, Zero-Trust Security, Performance/Bounds, Reliability, Test Rigor) with P0–P3 findings & regression tests.                                           | Auditing any chunk, PR, auth/billing change, or pre-production release.                                             |
| **`plinth-debug-and-profile`**          | `.gemini/skills/plinth-debug-and-profile/`          | Evidence-driven debugging & performance profiling with mandatory online docs/GitHub issues lookup, failing regression test first, and bounded latency/memory verification.                                                                        | Fixing production bugs, flaky tests, memory leaks, or p95/p99 latency regressions.                                  |

---

## How to Use These Skills in Each Editor

### 1. Gemini CLI & Antigravity (Native — Zero Setup)

Gemini CLI and Antigravity automatically discover `GEMINI.md` at the repo root and every `SKILL.md` inside `.gemini/skills/<skill-name>/` (or `.agent/skills/` if your Antigravity workspace reads `.agent/skills/`).

- If your Antigravity setup looks in `.agent/skills/`, mirror the folder once:
  ```bash
  mkdir -p .agent && cp -R .gemini/skills .agent/skills
  ```
- **How to invoke in a prompt:** Simply name the skill naturally, e.g.:
  - _"Use `plinth-chunk-builder` to build Chunk C02."_
  - _"Activate `plinth-live-research-and-versions` and check the latest stable versions before installing Fastify and Drizzle."_
  - _"Run `plinth-security-audit` on `packages/modules/auth`."_

### 2. Claude Code

Claude Code automatically reads `CLAUDE.md` and `.claude/skills/<skill-name>/SKILL.md`. Mirror once:

```bash
mkdir -p .claude && cp -R .gemini/skills .claude/skills
```

Then invoke via `/plinth-chunk-builder`, `/plinth-add-feature-module`, or by referencing the skill name in chat.

### 3. OpenAI Codex

Codex reads `AGENTS.md` and `.codex/skills/<skill-name>/SKILL.md`. Mirror once:

```bash
mkdir -p .codex && cp -R .gemini/skills .codex/skills
```

### 4. Gemini Web App / Custom Gems

If building via the Gemini web interface:

- Upload `GEMINI.md`, `docs/EDD.md`, `docs/ROADMAP.md`, `docs/ai/PROJECT_STATE.md`, and the target `.gemini/skills/<name>/SKILL.md` to your Gem Knowledge or chat context, and use the copy-paste prompts in `docs/ai/PROMPT_RECIPES.md`.

---

## Recommended Workflow Order for Building `plinth`

1. **Start any session** with `plinth-chunk-builder` (it automatically invokes `plinth-live-research-and-versions` + `plinth-security-audit` at the right gates).
2. **Whenever adding new product requirements** on top of `plinth`, switch to `plinth-add-feature-module`.
3. **Whenever designing a brand-new standalone service or major v2 subsystem** (like WebSockets or usage-based billing), invoke `backend-scaffold-architect` to run the full 4-phase Grill -> EDD -> Plan -> TDD -> Audit loop.
