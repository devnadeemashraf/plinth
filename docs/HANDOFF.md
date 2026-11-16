Mode: BUILD

## Fix first

None.

## In progress

None.

## Questions for the human

None.

## Gotchas

- Run every command as `mise x -- pnpm run <task>` (`pnpm docs` and `pnpm doctor` without `run` start pnpm built-ins). The machine's global `node` and `pnpm` are older than the pins.
- pnpm refuses versions published less than 7 days ago and versions whose provenance dropped (lefthook 2.2.2 was refused). Use the newest version it accepts.
- dependency-cruiser cannot parse TypeScript 7 itself; it uses `@swc/core`. Keep `parser: "swc"` in `.dependency-cruiser.cjs`.
- The dev machine runs Windows: write scripts in TypeScript for Node, never shell. `.gitattributes` forces LF line endings.
- Windows has no catchable SIGTERM: `src/main/api.ts` also shuts down on the IPC message `"shutdown"`, which `test/support/process.ts` sends on win32. Ctrl+C (SIGINT) works everywhere.
