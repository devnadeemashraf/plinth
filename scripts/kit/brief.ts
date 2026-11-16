/**
 * `pnpm brief`: everything a session needs to begin. `pnpm brief --review <ID>`: reviewer input.
 */
import { readFileSync } from "node:fs";
import { backticked, featureIds, type Item, nextItem, parseBlueprint } from "./lib/blueprint.ts";
import { diffBase, git, showAt } from "./lib/git.ts";
import { citedSections, featureLine, specSection } from "./lib/spec.ts";

const read = (path: string): string => readFileSync(path, "utf8");
const spec = read("docs/SPEC.md");
const handoff = read("docs/HANDOFF.md");

function handoffSection(heading: string): string {
  const match = new RegExp(`^## ${heading}\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m").exec(
    handoff,
  );
  return (match?.[1] ?? "").trim();
}

function strongModels(): string {
  const line = /^- Strong: (.+) — /m.exec(read("docs/VERSIONS.md"));
  return line?.[1] ?? "see docs/VERSIONS.md Model tiers";
}

function printItem(item: Item): void {
  console.log(item.text);
  if (item.fields["Tier"]?.trim() === "strong") {
    console.log(`\nTIER: strong. Allowed models: ${strongModels()}`);
  }
  const specField = item.fields["Spec"] ?? "";
  console.log("\n== SPEC (cited sections) ==");
  for (const id of featureIds(specField)) {
    console.log(featureLine(spec, id) ?? `(feature ${id} not found in SPEC §16)`);
  }
  for (const ref of citedSections(specField)) {
    console.log(`\n${specSection(spec, ref) ?? `(§${ref} not found in SPEC)`}`);
  }
  const follow = backticked(item.fields["Follow"] ?? "");
  console.log(`\n== FOLLOW ==\n${follow.length > 0 ? follow.join("\n") : "(none)"}`);
}

function review(id: string): void {
  const base = diffBase();
  if (base === undefined) {
    console.log("No base to compare against; push the branch and fetch main first.");
    process.exit(1);
  }
  const blueprint = parseBlueprint(showAt(base, "docs/BLUEPRINT.md") ?? read("docs/BLUEPRINT.md"));
  const item = blueprint.items.find((i) => i.id === id);
  if (!item) {
    console.log(`Item ${id} is not an open item on main.`);
    process.exit(1);
  }
  console.log("== REVIEW (AGENTS.md §5): edit nothing, report at most 15 lines ==\n");
  printItem(item);
  console.log(`\n== DIFF ==\n${git(["diff", "--stat", base])}`);
  console.log(`\nRead it with: git diff ${base.slice(0, 12)} -- <file>`);
}

function brief(): void {
  console.log(`== HANDOFF ==\n${handoff.trim()}\n`);
  const inProgress = handoffSection("In progress");
  if (inProgress !== "None." && inProgress.length > 0) {
    console.log("== NEXT: resume the In progress entry above before anything else ==");
    return;
  }
  const fix = /^- (FIX-\d+) .+$/m.exec(handoffSection("Fix first"));
  if (fix) {
    console.log(`== NEXT: ${fix[1]} (Fix first) ==\n${fix[0]}`);
    console.log(`Branch: fix/${fix[1]}-<slug>. Scope: the cited file's folder and tests.`);
    console.log("Include a regression test that fails before the fix.");
    return;
  }
  const blueprint = parseBlueprint(read("docs/BLUEPRINT.md"));
  const item = nextItem(blueprint);
  if (item) {
    console.log("== NEXT ITEM ==");
    printItem(item);
    return;
  }
  if (blueprint.items.length > 0) {
    const waiting = blueprint.items.map((i) => i.id).join(", ");
    console.log(
      `== BLOCKED: open items (${waiting}) depend on unmerged work. Ask the human to merge. ==`,
    );
    return;
  }
  if (blueprint.epics.length > 0) {
    const phase = Math.min(...blueprint.epics.map((e) => e.phase));
    console.log(`== PHASE GATE DUE: no open items. Next phase: ${phase}. ==`);
    console.log(`Needs a strong model (${strongModels()}). Follow AGENTS.md §6.`);
    return;
  }
  console.log("== ALL PLANNED WORK IS DONE. Ask the human what comes next. ==");
}

const reviewIndex = process.argv.indexOf("--review");
if (reviewIndex !== -1) {
  review(process.argv[reviewIndex + 1] ?? "");
} else {
  brief();
}
