/**
 * Attribution guard for single texts; with --env it also checks the PR body's Manual check.
 *   --message-file <path>   commit-msg hook
 *   --env <VAR>...          CI: PR title and body
 * The branch-wide check (commits and added lines) is `node scripts/kit/gate.ts attribution`.
 */
import { readFileSync } from "node:fs";
import {
  type AttributionTerms,
  attributionMatches,
  commitMessageBody,
  manualCheckViolations,
} from "./lib/guards.ts";

const terms = JSON.parse(
  readFileSync("scripts/kit/attribution-terms.json", "utf8"),
) as AttributionTerms;
const args = process.argv.slice(2);
let text = "";

if (args[0] === "--message-file" && args[1]) {
  text = commitMessageBody(readFileSync(args[1], "utf8"));
} else if (args[0] === "--env") {
  text = args
    .slice(1)
    .map((name) => process.env[name] ?? "")
    .join("\n");
} else {
  console.error("usage: attribution.ts --message-file <path> | --env <VAR>...");
  process.exit(2);
}

const hits = attributionMatches(text, terms);
if (hits.length > 0) {
  console.error("Remove AI attribution or AI tool names (AGENTS.md §10):");
  console.error(hits.map((h) => `  ${h}`).join("\n"));
  process.exit(1);
}

// In CI the same step receives the PR body, whose manual check must start from `main`.
const manualCheck = args[0] === "--env" ? manualCheckViolations(text) : [];
if (manualCheck.length > 0) {
  console.error("Fix the PR body's Manual check (AGENTS.md §3.12):");
  console.error(manualCheck.map((v) => `  ${v}`).join("\n"));
  process.exit(1);
}
