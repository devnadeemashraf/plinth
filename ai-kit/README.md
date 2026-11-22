# `plinth` Multi-Editor AI Kit

This kit configures AI coding agents (Google Antigravity & Gemini CLI, Anthropic Claude Code, OpenAI Codex, and Cursor / VS Code) to build and maintain `plinth` backends with strict architectural invariants and zero drift.

---

## Editor Support Matrix

| Agent / Editor | Control Plane File | Skills Directory | Notes |
|---|---|---|---|
| **Google Antigravity & Gemini CLI** | `GEMINI.md` | `.gemini/skills/` | Native support, automatic skill discovery, multi-turn handoffs. |
| **Anthropic Claude Code** | `CLAUDE.md` | `.claude/skills/` | Slash command triggers (`/plinth-chunk-builder`, etc.). |
| **OpenAI Codex** | `AGENTS.md` | `.codex/skills/` | Single entrypoint instruction and task delegation rules. |
| **Cursor / VS Code** | `.cursorrules` | `.cursor/rules/` | In-editor inline generation and terminal verification rules. |

---

## Synchronizing Skills Across Editors

To mirror the canonical skills in `.gemini/skills/` to all other editors, run:

```bash
node ai-kit/scripts/sync-skills.js
```

This populates `.claude/skills/`, `.codex/skills/`, and `.agent/skills/` with exact copies of the 7 production engineering skills.
