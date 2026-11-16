/**
 * `pnpm map [path-prefix]`: tracked and new files, with exported symbols for TypeScript files.
 */
import { readFileSync } from "node:fs";
import { git } from "./lib/git.ts";
import { exportedSymbols } from "./lib/symbols.ts";

const SKIP = [/^pnpm-lock\.yaml$/, /^openapi\.json$/, /^drizzle\/meta\//, /(^|\/)\.gitkeep$/];

const prefix = process.argv[2] ?? "";
const files = git(["ls-files", "--cached", "--others", "--exclude-standard"])
  .split("\n")
  .filter((f) => f.length > 0 && f.startsWith(prefix) && !SKIP.some((re) => re.test(f)))
  .sort();

for (const file of files) {
  const symbols = /\.(ts|cjs|mjs)$/.test(file) ? exportedSymbols(readFileSync(file, "utf8")) : [];
  console.log(symbols.length > 0 ? `${file}: ${symbols.join(", ")}` : file);
}
