/**
 * The project's own gates, run by `pnpm check`: `node scripts/kit/gate.ts <name>`.
 * Prints violations and exits 1, or prints "SKIP <reason>" / nothing and exits 0.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { backticked, lintBlueprint, parseBlueprint } from "./lib/blueprint.ts";
import { changedFiles, currentBranch, diffBase, fileDiffLines, git, showAt } from "./lib/git.ts";
import {
  type AttributionTerms,
  attributionMatches,
  CHANGED_LINE_THRESHOLD,
  changedLineCoverage,
  handbookViolations,
  isCoveredSource,
  isExempt,
  parseMiseTools,
  parseVersions,
  testGuardViolations,
  versionsViolations,
} from "./lib/guards.ts";
import {
  branchTarget,
  fixLinePath,
  outOfScope,
  scopeForDependabot,
  scopeForFix,
  scopeForGate,
  scopeForItem,
} from "./lib/scope.ts";
import { mustFeatureIds } from "./lib/spec.ts";

type GateResult = string[] | { skip: string };

const read = (path: string): string => readFileSync(path, "utf8");

/** The blueprint as it was on main, so a collapsed item is still found on its own branch. */
function baseBlueprint(base: string) {
  return parseBlueprint(showAt(base, "docs/BLUEPRINT.md") ?? read("docs/BLUEPRINT.md"));
}

function plan(): GateResult {
  return lintBlueprint(
    parseBlueprint(read("docs/BLUEPRINT.md")),
    mustFeatureIds(read("docs/SPEC.md")),
  );
}

function scope(): GateResult {
  const branch = currentBranch();
  const target = branchTarget(branch);
  const base = diffBase();
  if (target.kind === "main" || base === undefined) {
    return { skip: "on main or no base to compare" };
  }
  if (target.kind === "invalid") {
    return [`branch "${target.branch}" must be <type>/<ID>-<slug>, e.g. feat/P0-06-plan-catalog`];
  }
  if (target.kind === "kit") {
    return { skip: "KIT branch: scope is reviewed by the human" };
  }
  const files = changedFiles(base).flatMap((f) => (f.oldPath ? [f.path, f.oldPath] : [f.path]));
  let allowed: string[];
  let forbidden: string[] = [];
  if (target.kind === "item") {
    const item = baseBlueprint(base).items.find((i) => i.id === target.id);
    if (!item) {
      return [`item ${target.id} is not an open item on main`];
    }
    ({ allowed, forbidden } = scopeForItem(item));
  } else if (target.kind === "fix") {
    const path = fixLinePath(showAt(base, "docs/HANDOFF.md") ?? read("docs/HANDOFF.md"), target.id);
    if (!path) {
      return [`${target.id} is not listed under HANDOFF "Fix first" on main`];
    }
    allowed = scopeForFix(path);
  } else {
    allowed = target.kind === "gate" ? scopeForGate() : scopeForDependabot();
  }
  return outOfScope(files, allowed, forbidden).map((f) => `outside the item's scope: ${f}`);
}

function tests(): GateResult {
  const base = diffBase();
  const target = branchTarget(currentBranch());
  if (base === undefined || target.kind === "main") {
    return { skip: "on main or no base to compare" };
  }
  if (target.kind === "gate" || target.kind === "kit") {
    return { skip: `${target.kind} branch: test removals need the human's approval in review` };
  }
  const listed = new Set<string>();
  if (target.kind === "item") {
    const item = baseBlueprint(base).items.find((i) => i.id === target.id);
    for (const path of backticked(item?.fields["Files in scope"] ?? "")) {
      listed.add(path);
    }
  }
  return testGuardViolations(changedFiles(base), (f) => fileDiffLines(base, f).removed, listed);
}

function handbook(): GateResult {
  const modules = existsSync("src/modules")
    ? readdirSync("src/modules", { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    : [];
  return handbookViolations(read("docs/HANDBOOK.md"), modules, existsSync);
}

function versions(): GateResult {
  const pkg = JSON.parse(read("package.json")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return versionsViolations({
    lines: parseVersions(read("docs/VERSIONS.md")),
    dependencies: { ...pkg.dependencies, ...pkg.devDependencies },
    tools: parseMiseTools(read("mise.toml")),
  });
}

function coverage(): GateResult {
  const base = diffBase();
  if (base === undefined) {
    return { skip: "no base to compare" };
  }
  const changed = new Map<string, Set<number>>();
  for (const file of changedFiles(base)) {
    if (file.status !== "D" && isCoveredSource(file.path)) {
      changed.set(file.path, new Set(fileDiffLines(base, file).added.map((a) => a.line)));
    }
  }
  if (changed.size === 0) {
    return { skip: "no changed source lines" };
  }
  if (!existsSync("coverage/coverage-final.json")) {
    return ["coverage/coverage-final.json missing; the tests stage must run first"];
  }
  const result = changedLineCoverage(
    JSON.parse(read("coverage/coverage-final.json")),
    changed,
    process.cwd(),
  );
  if (result.total === 0 || result.covered / result.total >= CHANGED_LINE_THRESHOLD) {
    return [];
  }
  const pct = Math.floor((100 * result.covered) / result.total);
  return [
    `changed-line coverage ${pct}% is below ${CHANGED_LINE_THRESHOLD * 100}%; uncovered:`,
    ...result.uncovered.slice(0, 15),
  ];
}

function commits(): GateResult {
  const base = diffBase();
  if (base === undefined || base === git(["rev-parse", "HEAD"])) {
    return { skip: "no commits to lint" };
  }
  const bin = join(process.cwd(), "node_modules", ".bin");
  const run = spawnSync(`commitlint --from ${base} --to HEAD`, {
    shell: true,
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env["PATH"] ?? ""}` },
  });
  return run.status === 0 ? [] : [`${run.stdout}${run.stderr}`.trim()];
}

function attribution(): GateResult {
  const base = diffBase();
  if (base === undefined) {
    return { skip: "no base to compare" };
  }
  const terms = JSON.parse(read("scripts/kit/attribution-terms.json")) as AttributionTerms;
  return [...commitAttribution(base, terms), ...addedLineAttribution(base, terms)];
}

/** Commit messages on the branch; dependency-bot commits quote upstream release notes and are skipped. */
function commitAttribution(base: string, terms: AttributionTerms): string[] {
  const log = git(["log", `${base}..HEAD`, "--format=%h%x1f%ae%x1f%B%x1e"]);
  return log.split("\x1e").flatMap((entry) => {
    const [sha, author, body] = entry.trim().split("\x1f");
    if (!sha || !body || author?.includes("dependabot[bot]")) {
      return [];
    }
    return attributionMatches(body, terms).map((hit) => `commit ${sha}: ${hit}`);
  });
}

function addedLineAttribution(base: string, terms: AttributionTerms): string[] {
  return changedFiles(base)
    .filter((file) => file.status !== "D" && !isExempt(file.path, terms))
    .flatMap((file) =>
      fileDiffLines(base, file).added.flatMap((added) =>
        attributionMatches(added.text, terms).map((hit) => `${file.path}:${added.line}: ${hit}`),
      ),
    );
}

const gates: Record<string, () => GateResult> = {
  plan,
  scope,
  "test-guard": tests,
  handbook,
  versions,
  coverage,
  commits,
  attribution,
};

const name = process.argv[2] ?? "";
const gate = gates[name];
if (!gate) {
  console.error(`unknown gate "${name}"; one of: ${Object.keys(gates).join(", ")}`);
  process.exit(2);
}
const result = gate();
if ("skip" in result) {
  console.log(`SKIP ${result.skip}`);
} else if (result.length > 0) {
  console.log(result.join("\n"));
  process.exit(1);
}
