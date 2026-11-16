import { describe, expect, it } from "vitest";
import { parseBlueprint } from "../lib/blueprint.ts";
import { parseNameStatus, parseUnifiedDiff } from "../lib/git.ts";
import {
  branchTarget,
  fixLinePath,
  outOfScope,
  scopeForDependabot,
  scopeForFix,
  scopeForItem,
} from "../lib/scope.ts";
import { citedSections, specSection } from "../lib/spec.ts";
import { exportedSymbols } from "../lib/symbols.ts";

describe("branchTarget", () => {
  it.each([
    ["main", { kind: "main" }],
    ["feat/P0-06-plan-catalog", { kind: "item", id: "P0-06" }],
    ["fix/FIX-3-null-plan", { kind: "fix", id: "FIX-3" }],
    ["docs/GATE-1-mvp", { kind: "gate" }],
    ["chore/KIT-2-hooks", { kind: "kit" }],
    ["dependabot/npm_and_yarn/vitest-5.2.0", { kind: "dependabot" }],
    ["feat/P0-066-x", { kind: "invalid", branch: "feat/P0-066-x" }],
    ["my-branch", { kind: "invalid", branch: "my-branch" }],
  ])("%s", (branch, expected) => {
    expect(branchTarget(branch)).toEqual(expected);
  });
});

describe("scope", () => {
  const item = parseBlueprint(
    "## Phase 0 — x\n### P0-06 T\n- Files in scope: `src/modules/entitlements/**`, `openapi.json`\n- Must not touch: `src/modules/entitlements/secret.ts`\n",
  ).items[0];

  it("allows scoped files and kit documents, and flags the rest and forbidden files", () => {
    if (!item) {
      throw new Error("item not parsed");
    }
    const { allowed, forbidden } = scopeForItem(item);
    const files = [
      "src/modules/entitlements/domain/plan.ts",
      "openapi.json",
      "docs/BLUEPRINT.md",
      "docs/SPEC.md",
      "src/platform/http/pipeline.ts",
      "src/modules/entitlements/secret.ts",
    ];
    expect(outOfScope(files, allowed, forbidden)).toEqual([
      "docs/SPEC.md",
      "src/platform/http/pipeline.ts",
      "src/modules/entitlements/secret.ts",
    ]);
  });

  it("scopes a fix to the cited file's folder plus tests", () => {
    const path = fixLinePath(
      "## Fix first\n\n- FIX-3 src/modules/a/b.ts:42 — null plan\n",
      "FIX-3",
    );
    expect(path).toBe("src/modules/a/b.ts");
    expect(
      outOfScope(
        ["src/modules/a/c.ts", "src/x.test.ts", "src/other/d.ts"],
        scopeForFix(path ?? ""),
      ),
    ).toEqual(["src/other/d.ts"]);
  });

  it("limits dependency update branches to manifests", () => {
    expect(
      outOfScope(["package.json", "pnpm-lock.yaml", "src/a.ts"], scopeForDependabot()),
    ).toEqual(["src/a.ts"]);
  });
});

describe("git output parsing", () => {
  it("parses name-status including renames", () => {
    expect(parseNameStatus("M\ta.ts\nR087\told.test.ts\tnew.test.ts\nD\tb.ts\nA\tc.ts")).toEqual([
      { status: "M", path: "a.ts" },
      { status: "R", oldPath: "old.test.ts", path: "new.test.ts" },
      { status: "D", path: "b.ts" },
      { status: "A", path: "c.ts" },
    ]);
  });

  it("numbers added lines from hunk headers and collects removed lines", () => {
    const diff = "--- a/x\n+++ b/x\n@@ -3,0 +4,2 @@\n+one\n+two\n@@ -10 +12 @@\n-old\n+new";
    expect(parseUnifiedDiff(diff)).toEqual({
      added: [
        { line: 4, text: "one" },
        { line: 5, text: "two" },
        { line: 12, text: "new" },
      ],
      removed: ["old"],
    });
  });
});

describe("spec sections and symbols", () => {
  const spec =
    "## 6. Features\n\n### 6.1 Auth\nauth text\n### 6.10 Activity\nactivity\n### 6.11 Notifications · 6.12 Realtime\nrt\n## 7. Admin\nadmin";

  it("extracts subsections without confusing 6.1 and 6.10", () => {
    expect(specSection(spec, "6.1")).toBe("### 6.1 Auth\nauth text");
    expect(specSection(spec, "6.12")).toBe("### 6.11 Notifications · 6.12 Realtime\nrt");
    expect(specSection(spec, "7")).toBe("## 7. Admin\nadmin");
    expect(specSection(spec, "9")).toBeUndefined();
  });

  it("lists cited sections except §16", () => {
    expect(citedSections("§4, §6.13, §16 F01, §4")).toEqual(["4", "6.13"]);
  });

  it("finds exported symbols", () => {
    const source =
      "export const a = 1;\nexport async function b() {}\nexport interface C {}\nexport { d, e as f, type G };\nconst h = 2;";
    expect(exportedSymbols(source)).toEqual(["a", "b", "C", "d", "f", "G"]);
  });
});
