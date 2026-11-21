# CLAUDE.md — `plinth` Agent Entrypoint

This repository uses **`GEMINI.md`** and **`docs/ai/ARCHITECTURE_RULES.md`** as its canonical AI engineering control plane.

## Mandatory Startup Sequence
1. Read `GEMINI.md` in full and obey all Five Ironclad Operating Laws.
2. Read `docs/ai/PROJECT_STATE.md` to sync with the current chunk and progress.
3. Read `docs/ai/ARCHITECTURE_RULES.md`, `docs/ai/LIVE_RESEARCH_PROTOCOL.md`, and `docs/ai/DEPENDENCY_AND_VERSION_POLICY.md`.
4. Read `SKILLS_GUIDE.md` for workflow skills located under `.gemini/skills/` (compatible with Claude Code skills format).
5. Always use canonical path aliases (`@plinth/core`, `@/*`, `#/*`) instead of variable relative traversals (`../../...`) in dev and test.
6. Always run `pnpm verify` and update `docs/ai/PROJECT_STATE.md` + `docs/ai/SESSION_LOG.md` before completing a task.
