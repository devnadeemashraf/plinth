import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lintBlueprint, nextItem, parseBlueprint } from "../lib/blueprint.ts";
import { mustFeatureIds } from "../lib/spec.ts";

function item(id: string, overrides: Record<string, string> = {}): string {
  const fields: Record<string, string> = {
    Type: "feat",
    Spec: "§6.5, §16 F08",
    "Depends on": "none",
    Size: "S",
    Risk: "low",
    Tier: "any",
    Follow: "`src/a.ts`",
    Decisions: "Use X.",
    "Files in scope": "`src/modules/a/**`",
    "Must not touch": "`src/platform/**`",
    "Test cases": "\n  1. given a → b — risk",
    Acceptance: "`pnpm check`",
    "Manual check": "none",
    ...overrides,
  };
  const body = Object.entries(fields)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  return `### ${id} Title of ${id}\n\n${body}\n`;
}

const doc = (phase0: string, done = "", epics = ""): string =>
  `# Blueprint\n\n## Done\n${done}\n## Phase 0 — x\n\n${phase0}\n## Phase 1 — y\n${epics}\n`;

describe("parseBlueprint and lintBlueprint", () => {
  it("accepts a well-formed item that cites every MUST", () => {
    const bp = parseBlueprint(doc(item("P0-01")));
    expect(bp.items[0]?.testCases).toEqual(["given a → b — risk"]);
    expect(lintBlueprint(bp, ["F08"])).toEqual([]);
  });

  it("reports each missing field", () => {
    const text = item("P0-01").replace(/^- Acceptance:.*\n/m, "");
    expect(lintBlueprint(parseBlueprint(doc(text)), [])).toContain(
      'P0-01: missing field "Acceptance"',
    );
  });

  it("rejects high risk on Tier any, sizes above M and unknown commit types", () => {
    const errors = lintBlueprint(
      parseBlueprint(doc(item("P0-01", { Risk: "high", Size: "L", Type: "feature" }))),
      [],
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        'P0-01: high risk needs Tier strong or "any + review"',
        'P0-01: Size "L" must be S or M; split larger items',
        'P0-01: Type "feature" is not a Conventional Commit type',
      ]),
    );
  });

  it("rejects unknown dependencies, cycles and duplicate ids", () => {
    const text =
      item("P0-01", { "Depends on": "P0-02" }) +
      item("P0-02", { "Depends on": "P0-01" }) +
      item("P0-03", { "Depends on": "P0-09" });
    const errors = lintBlueprint(parseBlueprint(doc(text, "- P0-03 Old — #4 — F01\n")), []);
    expect(errors).toEqual(
      expect.arrayContaining([
        'P0-03: dependency "P0-09" does not exist',
        "duplicate id P0-03",
        expect.stringMatching(/^dependency cycle: P0-01 → P0-02 → P0-01$/),
      ]),
    );
  });

  it("rejects invalid scope globs and more than 12 test cases", () => {
    const cases = Array.from({ length: 13 }, (_, i) => `\n  ${i + 1}. case ${i}`).join("");
    const errors = lintBlueprint(
      parseBlueprint(doc(item("P0-01", { "Files in scope": "`../etc/**`", "Test cases": cases }))),
      [],
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        'P0-01: invalid scope glob "../etc/**"',
        "P0-01: needs 1–12 numbered test cases",
      ]),
    );
  });

  it("counts MUST citations from items, epics and Done lines, and reports the rest", () => {
    const bp = parseBlueprint(
      doc(
        item("P0-02"),
        "- P0-01 Done thing — #3 — F01, F02\n",
        "- E01 Epic — Spec: §6, §16 F09\n",
      ),
    );
    expect(lintBlueprint(bp, ["F01", "F02", "F08", "F09", "F10"])).toEqual([
      "MUST feature F10 is not cited by any item, epic or Done line",
    ]);
  });

  it("picks the first item whose dependencies are done, else undefined", () => {
    const bp = parseBlueprint(
      doc(item("P0-02", { "Depends on": "P0-01" }) + item("P0-03", { "Depends on": "P0-04" })),
    );
    expect(nextItem(bp)).toBeUndefined();
    const withDone = parseBlueprint(
      doc(item("P0-02", { "Depends on": "P0-01" }), "- P0-01 X — #1 — F01\n"),
    );
    expect(nextItem(withDone)?.id).toBe("P0-02");
  });

  it("the repository's own BLUEPRINT passes plan lint", () => {
    const bp = parseBlueprint(readFileSync("docs/BLUEPRINT.md", "utf8"));
    const must = mustFeatureIds(readFileSync("docs/SPEC.md", "utf8"));
    expect(must.length).toBeGreaterThan(0);
    expect(lintBlueprint(bp, must)).toEqual([]);
  });
});
