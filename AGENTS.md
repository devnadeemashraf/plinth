# AGENTS.md — `plinth` Codex / Multi-Agent Entrypoint

Canonical architecture and operating rules for **`plinth`** live in:
- `GEMINI.md` (Primary Operating Laws & Bootstrap Sequence)
- `docs/ai/PROJECT_STATE.md` (Current Build State & Next Action)
- `docs/ai/ARCHITECTURE_RULES.md` (Hard Hexagonal, Tenancy, RBAC & Masking Laws)
- `docs/ai/LIVE_RESEARCH_PROTOCOL.md` (Mandatory Online Docs Research — Zero Memory Guessing)
- `docs/ai/DEPENDENCY_AND_VERSION_POLICY.md` (Verified Latest Versions + Exact `pnpm-workspace.yaml` Catalog Pins)
- `docs/ai/QUALITY_GATES.md` & `docs/ai/AUDIT_CHECKLIST.md` (Strict TDD & Adversarial Review)
- `SKILLS_GUIDE.md` & `.gemini/skills/*` (Reusable Engineering Workflow Skills)

Always use canonical path aliases (`@plinth/core`, `@/*`, `#/*`) across both development and testing; never use variable-depth relative path traversals (`../../src/...`) or dynamic variable imports (`import(var)`). Never bypass `pnpm verify` (`pnpm lint && pnpm typecheck && pnpm test:fitness && pnpm test:coverage`). Always update `docs/ai/PROJECT_STATE.md` and `docs/ai/SESSION_LOG.md` at the end of every session.
