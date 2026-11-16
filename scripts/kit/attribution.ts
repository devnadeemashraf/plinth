/**
 * Attribution guard for single texts.
 *   --message-file <path>   commit-msg hook
 *   --env <VAR>...          CI: PR title and body
 * The branch-wide check (commits and added lines) is `node scripts/kit/gate.ts attribution`.
 */
import { readFileSync } from "node:fs";
import { type AttributionTerms, attributionMatches, commitMessageBody } from "./lib/guards.ts";

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
