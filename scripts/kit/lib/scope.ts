import { posix } from "node:path";
import { backticked, type Item } from "./blueprint.ts";

export type BranchTarget =
  | { kind: "main" }
  | { kind: "item"; id: string }
  | { kind: "fix"; id: string }
  | { kind: "gate" }
  | { kind: "kit" }
  | { kind: "dependabot" }
  | { kind: "invalid"; branch: string };

export const KIT_DOCS = [
  "docs/BLUEPRINT.md",
  "docs/HANDOFF.md",
  "docs/HANDBOOK.md",
  "docs/VERSIONS.md",
];

const GATE_SCOPE = [
  "docs/**",
  "AGENTS.md",
  "biome.json",
  ".dependency-cruiser.cjs",
  ".opengrep/**",
  "scripts/kit/**",
  "**/*.test.ts",
];

const DEPENDABOT_SCOPE = [
  "package.json",
  "pnpm-lock.yaml",
  ".github/workflows/**",
  "Dockerfile",
  "compose.yml",
];

export function branchTarget(branch: string | undefined): BranchTarget {
  if (branch === undefined || branch === "main") {
    return { kind: "main" };
  }
  if (branch.startsWith("dependabot/")) {
    return { kind: "dependabot" };
  }
  const item = /^[a-z]+\/(P\d+-\d{2})(?:-|$)/.exec(branch);
  if (item) {
    return { kind: "item", id: item[1] as string };
  }
  const fix = /^[a-z]+\/(FIX-\d+)(?:-|$)/.exec(branch);
  if (fix) {
    return { kind: "fix", id: fix[1] as string };
  }
  if (/^[a-z]+\/GATE-\d+/.test(branch)) {
    return { kind: "gate" };
  }
  if (/^[a-z]+\/KIT-/.test(branch)) {
    return { kind: "kit" };
  }
  return { kind: "invalid", branch };
}

/** The path cited by a HANDOFF Fix first line: "- FIX-3 src/a/b.ts:42 — reason". */
export function fixLinePath(handoff: string, id: string): string | undefined {
  const line = new RegExp(`^- ${id} (\\S+?)(?::\\d+)? `, "m").exec(handoff);
  return line?.[1];
}

export function scopeForItem(item: Item): { allowed: string[]; forbidden: string[] } {
  return {
    allowed: [...backticked(item.fields["Files in scope"] ?? ""), ...KIT_DOCS],
    forbidden: backticked(item.fields["Must not touch"] ?? ""),
  };
}

export function scopeForFix(path: string): string[] {
  return [`${posix.dirname(path)}/**`, "**/*.test.ts", "test/**", ...KIT_DOCS];
}

export const scopeForGate = (): string[] => GATE_SCOPE;
export const scopeForDependabot = (): string[] => DEPENDABOT_SCOPE;

export function matches(path: string, pattern: string): boolean {
  return path === pattern || posix.matchesGlob(path, pattern);
}

export function outOfScope(files: string[], allowed: string[], forbidden: string[] = []): string[] {
  return files.filter(
    (file) => forbidden.some((p) => matches(file, p)) || !allowed.some((p) => matches(file, p)),
  );
}
