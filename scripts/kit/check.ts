/**
 * `pnpm check`: everything CI runs, in order. Stops at the first failing stage and prints only
 * that stage's output (about 60 lines). On success prints one line per stage.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

interface Stage {
  name: string;
  command: string;
  /** Keep the end of the output instead of the start (test runners summarise at the end). */
  tail?: boolean;
}

const MAX_LINES = 60;
const targets = ["src", "scripts", "test"].filter((dir) => existsSync(dir)).join(" ");
const gate = (name: string): Stage => ({ name, command: `node scripts/kit/gate.ts ${name}` });

const stages: Stage[] = [
  { name: "format", command: "biome format ." },
  { name: "lint", command: "biome lint ." },
  { name: "types", command: "tsc -p tsconfig.json" },
  {
    name: "arch",
    command: `depcruise ${targets} --config .dependency-cruiser.cjs --output-type err`,
  },
  { name: "tests", command: "vitest run --coverage", tail: true },
  { name: "openapi", command: "node scripts/openapi.ts --check" },
  gate("coverage"),
  { name: "secrets", command: "gitleaks dir . --config .gitleaks.toml --redact --no-banner" },
  { name: "deps", command: "osv-scanner scan source --lockfile pnpm-lock.yaml" },
  { name: "sast", command: `opengrep scan --config .opengrep --error --quiet ${targets}` },
  gate("commits"),
  gate("versions"),
  gate("plan"),
  gate("scope"),
  gate("test-guard"),
  gate("handbook"),
  gate("attribution"),
];

const env = {
  ...process.env,
  PATH: `${join(process.cwd(), "node_modules", ".bin")}${delimiter}${process.env["PATH"] ?? ""}`,
  FORCE_COLOR: "0",
  NO_COLOR: "1",
};

const ESC = String.fromCharCode(27);
/** Removes terminal colour codes that some tools print even with NO_COLOR set. */
const stripAnsi = (text: string): string =>
  text
    .split(ESC)
    .map((part, i) => (i === 0 ? part : part.replace(/^\[[0-9;]*[A-Za-z]/, "")))
    .join("");

for (const stage of stages) {
  const started = performance.now();
  const run = spawnSync(stage.command, {
    shell: true,
    encoding: "utf8",
    env,
    maxBuffer: 64 * 1024 * 1024,
  });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const output = stripAnsi(`${run.stdout ?? ""}${run.stderr ?? ""}`);
  if (run.status !== 0) {
    const lines = output.split("\n").filter((line) => line.trim().length > 0);
    const shown = stage.tail ? lines.slice(-MAX_LINES) : lines.slice(0, MAX_LINES);
    console.log(`✗ ${stage.name} (${seconds}s): ${stage.command}`);
    console.log(shown.join("\n"));
    if (lines.length > MAX_LINES) {
      console.log(
        `… ${lines.length - MAX_LINES} more lines; run the command above for all of them`,
      );
    }
    process.exit(1);
  }
  const skip = /^SKIP (.+)$/m.exec(output);
  console.log(`✓ ${stage.name} (${seconds}s)${skip ? ` skipped: ${skip[1]}` : ""}`);
}
console.log("check passed");
