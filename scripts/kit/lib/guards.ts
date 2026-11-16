import { relative } from "node:path";
import type { ChangedFile } from "./git.ts";
import { matches } from "./scope.ts";

// ---------- test guard ----------

const TEST_FILE = /\.test\.ts$/;
const ASSERTION =
  /\b(expect|assert)\b|\.(toBe|toEqual|toStrictEqual|toThrow\w*|toMatch\w*|toHaveBeenCalled\w*|toContain\w*|toHaveProperty|resolves|rejects)\b|\b(it|test|describe)(\.\w+)?\(/;

/** Deleted, moved or assertion-changed test files that the item does not list by exact path. */
export function testGuardViolations(
  changes: ChangedFile[],
  removedLines: (file: ChangedFile) => string[],
  listed: ReadonlySet<string>,
): string[] {
  const violations: string[] = [];
  for (const change of changes) {
    const original = change.oldPath ?? change.path;
    if (!TEST_FILE.test(original) || listed.has(original)) {
      continue;
    }
    if (change.status === "D" || change.status === "R") {
      violations.push(`${original}: existing test file deleted or moved`);
    } else if (change.status === "M") {
      const lost = removedLines(change).filter(
        (line) => !/^\s*import\s/.test(line) && ASSERTION.test(line),
      );
      for (const line of lost.slice(0, 5)) {
        violations.push(`${original}: assertion removed or changed: ${line.trim()}`);
      }
    }
  }
  return violations;
}

// ---------- handbook gate ----------

const PATH_TOKEN =
  /^(?:(?:src|docs|scripts|test|drizzle|admin|\.github)\/|[\w.-]+\.(?:ts|json|ya?ml|md|toml|cjs|mjs)$)/;

export function handbookViolations(
  handbook: string,
  moduleNames: string[],
  exists: (path: string) => boolean,
): string[] {
  const violations: string[] = [];
  for (const name of moduleNames) {
    if (!new RegExp(`^### Module: ${name}$`, "m").test(handbook)) {
      violations.push(
        `module "${name}" has no "### Module: ${name}" section in HANDBOOK chapter 5`,
      );
    }
  }
  for (const match of handbook.matchAll(/`([^`\n]+)`/g)) {
    const token = (match[1] as string).replace(/:\d+(?:-\d+)?$/, "");
    if (/[\s*<>{}]/.test(token) || !PATH_TOKEN.test(token)) {
      continue;
    }
    if (!exists(token)) {
      violations.push(`HANDBOOK references a path that does not exist: ${token}`);
    }
  }
  return [...new Set(violations)];
}

// ---------- versions gate ----------

export interface VersionsLine {
  name: string;
  version: string | undefined;
}

export function parseVersions(markdown: string): VersionsLine[] {
  return [...markdown.matchAll(/^- `([^`]+)`(?: (\S+))? — /gm)].map((m) => ({
    name: m[1] as string,
    version: m[2],
  }));
}

export function parseMiseTools(toml: string): Record<string, string> {
  const tools: Record<string, string> = {};
  let inTools = false;
  for (const line of toml.split(/\r?\n/)) {
    if (/^\[.+\]/.test(line)) {
      inTools = line.trim() === "[tools]";
      continue;
    }
    const entry = /^"?([^"=\s]+)"?\s*=\s*"([^"]+)"/.exec(line);
    if (inTools && entry) {
      const key = (entry[1] as string).split(":").at(-1)?.split("/").at(-1) as string;
      tools[key] = entry[2] as string;
    }
  }
  return tools;
}

const FAMILIES: [string, RegExp][] = [
  ["vitest", /^(vitest|@vitest\/.+)$/],
  ["commitlint", /^@commitlint\/.+$/],
  ["testcontainers", /^(testcontainers|@testcontainers\/.+)$/],
  ["stryker", /^@stryker-mutator\/.+$/],
];

export function versionsViolations(input: {
  lines: VersionsLine[];
  dependencies: Record<string, string>;
  tools: Record<string, string>;
}): string[] {
  const violations: string[] = [];
  const byName = new Map(input.lines.map((l) => [l.name, l]));
  const check = (name: string, kind: string): void => {
    const line = byName.get(name);
    if (!line) {
      violations.push(`${kind} "${name}" has no line in docs/VERSIONS.md`);
    } else if (line.version !== undefined) {
      violations.push(
        `VERSIONS line for installed "${name}" carries a version; remove it (the ${kind === "tool" ? "mise.toml" : "package.json"} pin is the source)`,
      );
    }
  };
  for (const [name, version] of Object.entries(input.dependencies)) {
    check(name, "dependency");
    if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version)) {
      violations.push(`dependency "${name}" is not pinned exactly: "${version}"`);
    }
  }
  for (const name of Object.keys(input.tools)) {
    check(name, "tool");
  }
  for (const [family, pattern] of FAMILIES) {
    const versions = new Set(
      Object.entries(input.dependencies)
        .filter(([name]) => pattern.test(name))
        .map(([, v]) => v),
    );
    if (versions.size > 1) {
      violations.push(
        `${family} packages must share one version, found ${[...versions].join(", ")}`,
      );
    }
  }
  const typesNode = input.dependencies["@types/node"];
  const node = input.tools["node"];
  if (typesNode && node && typesNode.split(".")[0] !== node.split(".")[0]) {
    violations.push(`@types/node major ${typesNode} does not match node ${node}`);
  }
  return violations;
}

// ---------- attribution guard ----------

export interface AttributionTerms {
  patterns: string[];
  exemptPaths: string[];
}

export function attributionMatches(text: string, terms: AttributionTerms): string[] {
  const regexes = terms.patterns.map((p) => new RegExp(p, "iu"));
  return text
    .split("\n")
    .filter((line) => regexes.some((r) => r.test(line)))
    .map((line) => line.trim().slice(0, 120));
}

export function isExempt(path: string, terms: AttributionTerms): boolean {
  return terms.exemptPaths.some((p) => matches(path, p));
}

/** Strips git's comment lines from a commit message file. */
export function commitMessageBody(raw: string): string {
  return raw
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join("\n");
}

// ---------- PR manual check ----------

/**
 * Problems with the PR body's "## Manual check" section (AGENTS.md §3.12): it is "none", or its
 * commands switch to the PR branch first and back to `main` last, because the human starts on
 * `main`. A body without the section is not checked (Dependabot and hand-written PRs).
 */
export function manualCheckViolations(body: string): string[] {
  const section = /^## Manual check[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(body)?.[1];
  if (section === undefined) {
    return [];
  }
  const text = section.replaceAll(/<!--[\s\S]*?-->/g, "").trim();
  if (/^none\b/i.test(text)) {
    return [];
  }
  const switches = [...text.matchAll(/git switch (?:-c )?([^\s&;`]+)/g)].map((m) => m[1]);
  const violations: string[] = [];
  if (text.length === 0) {
    violations.push('Manual check is empty; write the commands or "none"');
  } else if (switches.length === 0 || switches[0] === "main") {
    violations.push("Manual check must start with `git switch <branch>` before any other command");
  } else if (switches.at(-1) !== "main") {
    violations.push("Manual check must end with `git switch main`");
  }
  return violations;
}

// ---------- changed-line coverage ----------

interface IstanbulFile {
  statementMap: Record<string, { start: { line: number } }>;
  s: Record<string, number>;
}

export const CHANGED_LINE_THRESHOLD = 0.9;

export function isCoveredSource(path: string): boolean {
  return (
    path.startsWith("src/") &&
    path.endsWith(".ts") &&
    !path.includes("/__tests__/") &&
    !path.endsWith(".test.ts") &&
    !path.startsWith("src/main/")
  );
}

export function changedLineCoverage(
  coverage: Record<string, IstanbulFile>,
  changed: Map<string, Set<number>>,
  root: string,
): { covered: number; total: number; uncovered: string[] } {
  const byPath = new Map(
    Object.entries(coverage).map(([abs, data]) => [
      relative(root, abs).replaceAll("\\", "/"),
      data,
    ]),
  );
  let covered = 0;
  let total = 0;
  const uncovered: string[] = [];
  for (const [path, lines] of changed) {
    const data = byPath.get(path);
    if (!data) {
      continue;
    }
    for (const [id, location] of Object.entries(data.statementMap)) {
      if (!lines.has(location.start.line)) {
        continue;
      }
      total += 1;
      if ((data.s[id] ?? 0) > 0) {
        covered += 1;
      } else {
        uncovered.push(`${path}:${location.start.line}`);
      }
    }
  }
  return { covered, total, uncovered: [...new Set(uncovered)] };
}
