Mode: BUILD

## Fix first

None.

## In progress

None.

## Questions for the human

- Q1 (blocks P1-08): SPEC §6.10 lists actor types `user`, `platform_admin`, `system`, `job`, `webhook`. Sign-up, sign-in failures and password resets happen before any user is known. P1-08 assumes a sixth type, `anonymous`, with a null actor id. Approve, or name the type to use instead.
- Q2 (blocks P1-08): SPEC §6.10 says the application's database role has no UPDATE or DELETE grant on `activity_events`. That needs two roles: `migrate` as the owner and `api`/`worker` as a restricted role, which means two connection URLs and a role-creation step on every host. P1-08 assumes only the trigger that rejects UPDATE and DELETE (also SPEC), and leaves the grants out. Approve, or ask for a separate item adding `DATABASE_APP_URL` and the restricted role.

## Gotchas

- Run every command as `mise x -- pnpm run <task>` (`pnpm docs` and `pnpm doctor` without `run` start pnpm built-ins). The machine's global `node` and `pnpm` are older than the pins.
- pnpm refuses versions published less than 7 days ago and versions whose provenance dropped (lefthook 2.2.2 was refused). Use the newest version it accepts.
- dependency-cruiser cannot parse TypeScript 7 itself; it uses `@swc/core`. Keep `parser: "swc"` in `.dependency-cruiser.cjs`.
- The dev machine runs Windows: write scripts in TypeScript for Node, never shell. `.gitattributes` forces LF line endings.
- `drizzle-kit generate --out` needs a path relative to the repo root; an absolute Windows path breaks it.
- Windows has no catchable SIGTERM: `src/main/api.ts` also shuts down on the IPC message `"shutdown"`, which `test/support/process.ts` sends on win32. Ctrl+C (SIGINT) works everywhere.
