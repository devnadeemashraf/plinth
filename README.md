# Plinth

A production-grade TypeScript backend template: a modular monolith with auth, sessions, tenancy, RBAC, entitlements and full change history. Status: Phase 0 (walking skeleton). Scope and roadmap: `docs/SPEC.md` §16 and `docs/BLUEPRINT.md`.

## Setup (Windows 11; macOS and Linux work the same way)

1. Install Git, Docker Desktop (WSL2 backend), the GitHub CLI and mise:
   ```powershell
   winget install Git.Git Docker.DockerDesktop GitHub.cli jdx.mise
   ```
2. Clone and install the pinned toolchain (Node, pnpm, scanners):
   ```sh
   git clone https://github.com/devnadeemashraf/plinth.git
   cd plinth
   mise trust
   mise install
   ```
3. Install dependencies and git hooks:
   ```sh
   mise x -- pnpm install
   ```
4. Verify:
   ```sh
   mise x -- pnpm run doctor
   mise x -- pnpm check
   ```

Optional: activate mise in your shell profile (`mise activate pwsh` or `mise activate bash`) to drop the `mise x --` prefix.

## Commands

| Command | Does |
| --- | --- |
| `pnpm check` | Everything CI runs: format, lint, types, architecture, tests, coverage, secret, dependency and code scans, plan and scope gates |
| `pnpm fmt` | Format and apply safe lint fixes |
| `pnpm brief` | The next piece of work, with the context it needs |
| `pnpm map [path]` | File tree with exported symbols |
| `pnpm run docs <package>` | Pinned version and documentation links for a dependency |
| `pnpm run doctor` | Check installed tools against the pins |

## How work flows

1. A session runs `pnpm brief`, implements the item it prints on a branch, and opens a PR.
2. CI runs `pnpm check`. `main` accepts only PRs with a green `check`.
3. You review, run the item's manual check, and merge.

Rules for implementers are in `AGENTS.md`. How the code works is in `docs/HANDBOOK.md`.

## Licence

MIT. See `LICENSE`.
