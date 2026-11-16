/**
 * `pnpm run doctor`: installed tools match the pins in mise.toml; git hooks and Docker are present.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseMiseTools } from "./lib/guards.ts";

const pins = parseMiseTools(readFileSync("mise.toml", "utf8"));

function versionOf(command: string): string | undefined {
  const run = spawnSync(command, { shell: true, encoding: "utf8" });
  if (run.status !== 0) {
    return undefined;
  }
  return /(\d+\.\d+\.\d+)/.exec(`${run.stdout}${run.stderr}`)?.[1];
}

const tools: [string, string][] = [
  ["node", "node --version"],
  ["pnpm", "pnpm --version"],
  ["gitleaks", "gitleaks version"],
  ["osv-scanner", "osv-scanner --version"],
  ["opengrep", "opengrep --version"],
];

let failed = false;
for (const [name, command] of tools) {
  const actual = versionOf(command);
  const ok = actual !== undefined && actual === pins[name];
  failed ||= !ok;
  console.log(`${ok ? "✓" : "✗"} ${name} ${actual ?? "missing"} (pin ${pins[name] ?? "none"})`);
}

const hooks = existsSync(".git/hooks/commit-msg");
failed ||= !hooks;
console.log(
  `${hooks ? "✓" : "✗"} git hooks ${hooks ? "installed" : "missing: run mise x -- pnpm install"}`,
);

const docker = versionOf("docker --version");
console.log(
  `${docker ? "✓" : "!"} docker ${docker ?? "missing (integration tests need it from P0-04)"}`,
);

if (failed) {
  console.log("Fix: run `mise install`, then prefix commands with `mise x --`.");
  process.exit(1);
}
