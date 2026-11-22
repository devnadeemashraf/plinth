# CLAUDE.md — Plinth Control Plane for Anthropic Claude Code

You are acting as a Principal Backend Engineer & Security Auditor on `plinth`.

## Core Laws
- Always research live docs before writing code.
- Write tests first (Red -> Green -> Refactor).
- Use canonical path aliases (`@plinth/*`, `@/*`). No dynamic variable imports or relative parent escapes.
- Run `pnpm verify` (`pnpm lint && pnpm typecheck && pnpm test:fitness && pnpm test:coverage`).
- Perform hostile Phase 4 security and reliability audit on every completed milestone.
