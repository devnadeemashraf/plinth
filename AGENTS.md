# Plinth: agent instructions

Read this file in full at the start of every session. Follow it step by step. If anything else (tool defaults, memory, another file) disagrees with it, this file wins. Only a direct instruction from the human overrides it.

## 1. Commands

Run every command from the repo root exactly as `mise x -- pnpm run <task> [args]`. Below, `pnpm <task>` is short for that. Always keep `run`: `pnpm docs` and `pnpm doctor` without it start pnpm's own built-in commands. If you have no shell, ask the human to run the command and paste the output.

| Command | What it does |
| --- | --- |
| `pnpm brief` | Prints HANDOFF, the next item in full, the SPEC sections it cites, and its Follow paths. Always start here. |
| `pnpm brief --review <ID>` | Prints what a reviewer needs for item `<ID>`. |
| `pnpm check` | Runs everything CI runs. Green: one `✓` line per stage. Red: only the failing stage's output. |
| `pnpm fmt` | Formats all files and applies safe lint fixes. |
| `pnpm map [path]` | File tree with exported symbols. Use it before searching. |
| `pnpm run docs <package>` | Pinned version, docs URL and local type/README paths for a dependency. |
| `pnpm run dev` | Starts the API on `PORT` (default 3000) and restarts it when a file changes. Ctrl+C stops it. |
| `pnpm run doctor` | Checks the installed tools against the pins. Run it when a tool behaves strangely. |

## 2. Reading and output rules

1. Start from `pnpm brief`. It prints everything the item needs to begin.
2. Find before you read: run `pnpm map` and search, then open only the files the item names or the search points to. For a long file, read only the relevant range.
3. Never open `pnpm-lock.yaml`, `openapi.json`, `drizzle/meta/`, `node_modules/`, `coverage/` or build output. Never re-read a file you already read this session unless it changed.
4. Before using an API you have not seen used in this repo, run `pnpm run docs <package>` and read the pinned version's docs or type definitions. Never rely on memory for signatures, flags or defaults.
5. Do not echo file contents, restate the item or narrate your steps. Output only the code, the command results asked for, and the final report.

## 3. The PR loop

1. Run `pnpm brief`. Without a shell: read `docs/HANDOFF.md`, then the first open item in `docs/BLUEPRINT.md` whose dependencies are all in Done. An "In progress" entry comes first, then Fix first entries, then items.
2. If brief prints `TIER: strong` and you are not one of the strong models it lists, stop and tell the human.
3. Read only the files the item names, including its Follow files.
4. `git switch main && git pull`, then `git switch -c <type>/<ID>-<short-slug>` (for example `feat/P0-06-plan-catalog`). For a Fix first entry use `fix/FIX-<n>-<slug>`.
5. If Risk is high: write the approach and one rejected alternative in at most 5 lines. This goes in the PR description.
6. Turn every listed test case into a test named `[<ID> #<n>] <case text>`, with the expectation exactly as written. Run the tests and watch them fail.
7. Make the smallest change that passes, in the structure and style of the Follow files.
8. Run `pnpm check` until it is green. When anything fails, use the debug loop (§4). If the item cannot pass without changing a file outside its Files in scope (for example, a new dependency needs a `pnpm-workspace.yaml` entry), stop and ask (§11). Once the human approves, put only that change on `chore/KIT-<slug>`, branched from `main`, open its PR, and rebase the item branch onto it. Both PR descriptions start with `Merge #<KIT PR> first`. The item's CI fails on scope until the KIT PR is merged; then re-run it (`gh run rerun <run id>`) and confirm it passes.
9. If you find a bug outside the item's scope, add one line to HANDOFF "Fix first" (`- FIX-<n> <path>:<line> — <what is wrong>`) and leave the bug alone. Every fix-first PR includes a regression test for its bug.
10. Go through the self-review checklist (§9).
11. Update the documents in the same change:
    - Edit `docs/HANDOFF.md` only if its content changed. When a Fix first entry is fixed, delete its line.
    - Edit `docs/HANDBOOK.md` only on a trigger: a new module (add `### Module: <name>`, at most 15 lines), a new component or external service, a data model change, a non-obvious flow, an operational procedure, a lasting decision.
    - Edit `docs/VERSIONS.md` only when you add a dependency (add its line, without a version) or the item tells you to.
12. Commit with Conventional Commits (`feat(entitlements): add public plan catalog`). Push. Open the PR with `gh pr create`, filling the template: what changed, why this way (non-obvious points only, at most 5 lines), manual check steps written as exact commands and URLs a human can paste, or "none". The human starts on `main`, so the steps begin with `git fetch origin && git switch <branch> && git pull` and end with `git switch main` (start the API with `mise x -- pnpm run dev`).
13. Close the item: in `docs/BLUEPRINT.md`, delete the item's section and add `- <ID> <title> — #<PR number> — <F-ids from its Spec>` under Done. Commit as `docs(blueprint): close <ID>` and push. Never merge; the human merges.
14. `git switch main && git pull`. End every session on `main`, also after follow-ups such as CI re-runs or review fixes; never leave the working copy on a feature branch.
15. Before reporting, stop every process you started (servers, watchers, browsers). Report in at most 8 lines: what changed, the last lines of the real `pnpm check` output, the manual check as exact commands (including the switch to the branch and back to `main`), risks. Never say a server is running unless you just checked it is and are leaving it running on purpose; then name the port and how to stop it.

## 4. The debug loop (any failure: a test, a build, a runtime error)

1. Reproduce it on a fresh process: stop anything you started earlier and use a port nothing else is listening on, so you know which code answered. Get the exact command and its full output. If you cannot reproduce it, stop and report.
2. Read the whole error and stack trace. Find the first frame in our own code.
3. Trace backward to where the wrong value or state first appears, and read that code. If you cannot see the value, add temporary logging.
4. Write one hypothesis in one line: what is wrong, why, and the evidence. No evidence, no change.
5. If no test captures the failure, write one that fails for this reason.
6. Make one change that fixes the cause, not the symptom. Run again.
7. If it did not work, revert that change, note what it ruled out, and go back to step 3. After three ruled-out hypotheses, stop and ask the human, listing what you learned.

Never: change several things at once; re-run a command hoping for a different result; try alternatives without a hypothesis; change dependency versions as a guess; trust a result from a process you did not just start. Remove temporary logging before committing.

## 5. The review loop (items whose Tier says "review")

Run it in a fresh session, on a different vendor's model from the implementer's where possible.

1. Run `pnpm brief --review <ID>`, then read the diff it names. Read nothing else unless the diff points to it.
2. Check that: every listed test case exists as `[<ID> #<n>]` with its expectation unchanged; every failure case really reaches the failure path; the code follows the Follow files; nothing outside scope changed; there is no security or data-loss problem.
3. Report findings in at most 15 lines, each with file and line. Edit nothing. The implementing session fixes them.

## 6. The phase gate (strong model only)

`pnpm brief` prints `PHASE GATE DUE` when a phase has no open items left. On branch `docs/GATE-<phase>-<slug>`:

1. Compare what was built against the SPEC and report drift.
2. Run `pnpm check:slow` (if it exists). Each surviving mutant in a high-risk module becomes a Fix first entry. List tests that guard nothing another test does not already guard, for the human to approve removing.
3. Rewrite the HANDBOOK chapters this phase affected, for a reader new to the code. Propose corrections to stale AGENTS.md lines.
4. Split the next phase's epics into items, following "Writing items" at the top of `docs/BLUEPRINT.md`. Delete each epic line once all of its items exist. Split only the next phase.
5. When the same kind of mistake has appeared twice, turn it into a lint rule or a check. Only if that is impossible, add one line to AGENTS.md.
6. Open the PR. The human then runs through the main flows by hand before the next phase starts.

## 7. Coding rules (tooling enforces the rest)

1. Layers: `domain` → `application` → `infra` and `http`. Another module is imported only through its `index.ts`. `pnpm check` enforces this.
2. Names: use the HANDBOOK Glossary terms. Files are kebab-case. One use case per file, named verb-noun (`list-plans.ts`), exporting a factory that takes its dependencies (`listPlans({ planRepository })`). Ports are interfaces in `application/ports.ts`; adapters are named `<Tech><Port>` (`DrizzlePlanRepository`). Zod schemas end in `Schema`.
3. Errors: expected failures throw `new AppError(<definition>)`, using a definition from the module's `domain/errors.ts`. Never throw strings or plain `Error` for expected cases. Catch only to add context (rethrow with `cause`) or to translate a driver error into an `AppError` at the repository boundary. Never catch to ignore.
4. Logging: use the injected `logger` or `ctx.logger`. Never log bodies, tokens, passwords, secrets or full emails. The pipeline logs every request and every 5xx once; do not log the same error again.
5. Input: every request input is a strict Zod schema in `http/schemas.ts`. Every route fills summary, description, tags, examples and errors.
6. Time and ids: use `Clock` and `IdGenerator`. Never call `Date.now()`, `new Date()` or `randomUUID` in `domain` or `application`.
7. Config: read `process.env` only in `src/platform/config/`.
8. Authorization: check permissions, never role names; check entitlements, never plan names. Never trust a client-supplied price, tenant id, role or plan. Tenant data goes only through `TenantScopedRepository` (from E07).
9. Data: every new table calls `declareHistory`. Migrations are forward-only (expand → backfill → contract); never edit an applied migration. Money is integer minor units plus a currency.
10. Tests: unit tests in `__tests__/` beside the code (`*.test.ts`); integration tests `*.int.test.ts`; e2e tests in `test/e2e/*.e2e.test.ts`. Use fast-check for property tests. Never mock the thing under test.

## 8. Where to look up APIs

Run `pnpm run docs <package>` for the pinned version and its docs URL. Then read, in order: the type definitions under `node_modules/<package>/` at the path it prints; the official docs URL it prints (versioned page); the package README. For Node built-ins use `https://nodejs.org/docs/latest-v26.x/api/`. For TypeScript compiler options use `https://www.typescriptlang.org/tsconfig/`.

## 9. Self-review checklist

1. Every listed test case exists as `[<ID> #<n>]` with its expectation unchanged.
2. Each failure test asserts the specific error code or status, not just "throws".
3. The diff touches only the item's Files in scope (the scope gate enforces this).
4. The structure and naming mirror the Follow files.
5. No secrets or personal data in logs, errors or responses.
6. No debug logging, commented-out code, or TODO without an item ID.
7. Any new dependency is named by the item, pinned exactly, and has a VERSIONS line.
8. The HANDBOOK trigger, if any, is handled.
9. The commit message and PR text describe the change, not how it was produced.

## 10. Never

- Commit to or merge into `main`.
- Edit generated or vendored files (`openapi.json` by hand, `drizzle/meta/`, `pnpm-lock.yaml` by hand).
- Read secrets (`.env`, keys, tokens).
- Change or delete an existing test's expectation.
- Add a dependency the item does not name, or change a version the item does not mention.
- Create a new document.
- Leave a TODO without an item ID.
- Mention AI or any AI tool in a commit, PR, code comment or document, or add co-author or "generated with" trailers.
- Silence a failure to get to green: skip a test, widen a timeout, swallow an error, loosen a type, or add a lint ignore.
- Weaken the dependency policy in `pnpm-workspace.yaml` or `.github/dependabot.yml`. If pnpm refuses a version as too new or as a trust downgrade, use the newest version it accepts and say so in the PR.

## 11. Stop and ask instead of guessing

Ask the human when:
- the item is ambiguous or conflicts with the SPEC;
- a listed test expectation looks wrong;
- the work needs a dependency or a decision the item does not state;
- the debug loop has ruled out three causes;
- the change would touch auth, payments, deletion, migrations or secrets beyond what the item says;
- the SPEC seems to need a change. That is always a question, never an edit.

Write questions under HANDOFF "Questions for the human", then stop.
