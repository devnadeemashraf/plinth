export const REQUIRED_FIELDS = [
  "Type",
  "Spec",
  "Depends on",
  "Size",
  "Risk",
  "Tier",
  "Follow",
  "Decisions",
  "Files in scope",
  "Must not touch",
  "Test cases",
  "Acceptance",
  "Manual check",
] as const;

const COMMIT_TYPES = new Set([
  "feat",
  "fix",
  "chore",
  "ci",
  "docs",
  "refactor",
  "perf",
  "test",
  "build",
  "style",
  "revert",
]);
const MAX_TEST_CASES = 12;

export interface Item {
  id: string;
  title: string;
  phase: number;
  fields: Record<string, string>;
  testCases: string[];
  text: string;
}

export interface Epic {
  id: string;
  title: string;
  phase: number;
  spec: string;
}

export interface DoneLine {
  id: string;
  title: string;
  pr: string;
  features: string[];
}

export interface Blueprint {
  items: Item[];
  epics: Epic[];
  done: DoneLine[];
}

export function featureIds(text: string): string[] {
  return [...new Set(text.match(/\bF\d{2}\b/g) ?? [])];
}

/** Backticked tokens, used for globs in "Files in scope" and paths in "Follow". */
export function backticked(text: string): string[] {
  return [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1] as string);
}

function buildItem(id: string, title: string, phase: number, lines: string[]): Item {
  const fields: Record<string, string> = {};
  let field: string | undefined;
  for (const line of lines) {
    const start = /^- ([A-Z][A-Za-z ]+): ?(.*)$/.exec(line);
    if (start) {
      field = start[1] as string;
      fields[field] = start[2] as string;
    } else if (field !== undefined && line.trim().length > 0) {
      fields[field] = `${fields[field]}\n${line}`;
    }
  }
  const testCases = (fields["Test cases"] ?? "")
    .split("\n")
    .map((line) => /^\s+\d+\.\s+(.+)$/.exec(line)?.[1])
    .filter((c): c is string => c !== undefined);
  const text = [`### ${id} ${title}`, ...lines].join("\n").trim();
  return { id, title, phase, fields, testCases, text };
}

/** A Done line or an epic line, outside any item. */
function parseListLine(line: string, section: string, phase: number, result: Blueprint): void {
  if (section === "done") {
    const done = /^- ((?:P\d+-\d{2})|(?:FIX-\d+)) (.+?) — #(\d+)(?: — (.+))?$/.exec(line);
    if (done) {
      const [, id = "", title = "", pr = "", features = ""] = done;
      result.done.push({ id, title, pr, features: featureIds(features) });
    }
    return;
  }
  const epic = section === "phase" ? /^- (E\d{2}) (.+?) — Spec: (.+)$/.exec(line) : null;
  if (epic) {
    const [, id = "", title = "", spec = ""] = epic;
    result.epics.push({ id, title, phase, spec });
  }
}

/** The section a "## " heading opens: Done, a numbered phase, or anything else. */
function sectionOf(heading: string, previousPhase: number): { section: string; phase: number } {
  const phaseMatch = /^## Phase (\d+)\b/.exec(heading);
  if (phaseMatch) {
    return { section: "phase", phase: Number(phaseMatch[1]) };
  }
  return { section: heading.startsWith("## Done") ? "done" : "none", phase: previousPhase };
}

export function parseBlueprint(markdown: string): Blueprint {
  const result: Blueprint = { items: [], epics: [], done: [] };
  let section = "none";
  let phase = -1;
  let current: { id: string; title: string; lines: string[] } | undefined;
  const flush = (): void => {
    if (current) {
      result.items.push(buildItem(current.id, current.title, phase, current.lines));
    }
    current = undefined;
  };
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^### (P\d+-\d{2}) (.+)$/.exec(line);
    if (line.startsWith("## ")) {
      flush();
      ({ section, phase } = sectionOf(line, phase));
    } else if (heading && section === "phase") {
      flush();
      current = { id: heading[1] as string, title: heading[2] as string, lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      parseListLine(line, section, phase, result);
    }
  }
  flush();
  return result;
}

export function dependencies(item: Item): string[] {
  const raw = (item.fields["Depends on"] ?? "").trim();
  return raw === "none" ? [] : raw.split(/[,\s]+/).filter((d) => d.length > 0);
}

export function isValidGlob(glob: string): boolean {
  return (
    glob.length > 0 &&
    !glob.startsWith("/") &&
    !glob.includes("\\") &&
    !glob.split("/").includes("..") &&
    !/\s/.test(glob)
  );
}

const ALLOWED_VALUES: Record<string, { values: string[]; message: string }> = {
  Type: { values: [...COMMIT_TYPES], message: "is not a Conventional Commit type" },
  Size: { values: ["S", "M"], message: "must be S or M; split larger items" },
  Risk: { values: ["low", "high"], message: "must be low or high" },
  Tier: {
    values: ["any", "strong", "any + review"],
    message: 'must be any, strong or "any + review"',
  },
};

function valueErrors(item: Item): string[] {
  const errors: string[] = [];
  for (const name of REQUIRED_FIELDS) {
    if ((item.fields[name] ?? "").trim().length === 0) {
      errors.push(`${item.id}: missing field "${name}"`);
    }
  }
  for (const [name, rule] of Object.entries(ALLOWED_VALUES)) {
    const value = item.fields[name]?.trim();
    if (value && !rule.values.includes(value)) {
      errors.push(`${item.id}: ${name} "${value}" ${rule.message}`);
    }
  }
  if (item.fields["Risk"]?.trim() === "high" && item.fields["Tier"]?.trim() === "any") {
    errors.push(`${item.id}: high risk needs Tier strong or "any + review"`);
  }
  if (item.fields["Spec"] && !/§\d/.test(item.fields["Spec"])) {
    errors.push(`${item.id}: Spec cites no § section`);
  }
  if (item.testCases.length === 0 || item.testCases.length > MAX_TEST_CASES) {
    errors.push(`${item.id}: needs 1–${MAX_TEST_CASES} numbered test cases`);
  }
  return errors;
}

function referenceErrors(item: Item, known: Set<string>): string[] {
  const errors = dependencies(item)
    .filter((dep) => dep === item.id || !known.has(dep))
    .map((dep) => `${item.id}: dependency "${dep}" does not exist`);
  const scope = item.fields["Files in scope"] ?? "";
  const globs = backticked(scope);
  if (scope.length > 0 && globs.length === 0) {
    errors.push(`${item.id}: Files in scope lists no backticked paths`);
  }
  for (const glob of globs.filter((g) => !isValidGlob(g))) {
    errors.push(`${item.id}: invalid scope glob "${glob}"`);
  }
  return errors;
}

function cycleErrors(items: Item[]): string[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const state = new Map<string, "visiting" | "done">();
  const errors: string[] = [];
  const visit = (id: string, path: string[]): void => {
    if (state.get(id) === "done") {
      return;
    }
    if (state.get(id) === "visiting") {
      errors.push(`dependency cycle: ${[...path, id].join(" → ")}`);
      return;
    }
    state.set(id, "visiting");
    const item = byId.get(id);
    for (const dep of item ? dependencies(item) : []) {
      if (byId.has(dep)) {
        visit(dep, [...path, id]);
      }
    }
    state.set(id, "done");
  };
  for (const item of items) {
    visit(item.id, []);
  }
  return errors;
}

export function lintBlueprint(bp: Blueprint, mustIds: string[]): string[] {
  const errors: string[] = [];
  const all = [
    ...bp.items.map((i) => i.id),
    ...bp.done.map((d) => d.id),
    ...bp.epics.map((e) => e.id),
  ];
  const seen = new Set<string>();
  for (const id of all) {
    if (seen.has(id)) {
      errors.push(`duplicate id ${id}`);
    }
    seen.add(id);
  }
  const known = new Set([...bp.items.map((i) => i.id), ...bp.done.map((d) => d.id)]);
  for (const item of bp.items) {
    errors.push(...valueErrors(item), ...referenceErrors(item, known));
  }
  errors.push(...cycleErrors(bp.items));
  const cited = new Set([
    ...bp.items.flatMap((i) => featureIds(i.fields["Spec"] ?? "")),
    ...bp.epics.flatMap((e) => featureIds(e.spec)),
    ...bp.done.flatMap((d) => d.features),
  ]);
  for (const id of mustIds) {
    if (!cited.has(id)) {
      errors.push(`MUST feature ${id} is not cited by any item, epic or Done line`);
    }
  }
  return errors;
}

/** The next item to work on: the first open item whose dependencies are all done. */
export function nextItem(bp: Blueprint): Item | undefined {
  const done = new Set(bp.done.map((d) => d.id));
  const ordered = [...bp.items].sort((a, b) => a.phase - b.phase);
  return ordered.find((item) => dependencies(item).every((dep) => done.has(dep)));
}
