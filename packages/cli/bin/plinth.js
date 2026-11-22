#!/usr/bin/env node
import { runCli } from "../dist/bin.js";

runCli(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
