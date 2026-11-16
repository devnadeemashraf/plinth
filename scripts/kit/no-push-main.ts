/**
 * pre-push hook: refuses pushes to main. Git passes "<local ref> <sha> <remote ref> <sha>" lines.
 * The one-time bootstrap push sets PLINTH_ALLOW_MAIN_PUSH=1.
 */
import { readFileSync } from "node:fs";

const input = readFileSync(0, "utf8");
const toMain = input.split("\n").some((line) => line.trim().split(/\s+/)[2] === "refs/heads/main");

if (toMain && process.env["PLINTH_ALLOW_MAIN_PUSH"] !== "1") {
  console.error("Refusing to push to main. Push a branch and open a PR (AGENTS.md §3).");
  process.exit(1);
}
