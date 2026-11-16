import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { firstDifference, renderOpenApi } from "../openapi.ts";

const script = resolve("scripts/openapi.ts");

describe("openapi script", () => {
  it("[P0-03 #5] Committed `openapi.json` edited by hand → `openapi:check` exits 1 naming the differing path", () => {
    const dir = mkdtempSync(join(tmpdir(), "plinth-openapi-"));
    try {
      const edited = JSON.parse(renderOpenApi()) as { info: { title: string } };
      edited.info.title = "Edited by hand";
      writeFileSync(join(dir, "openapi.json"), `${JSON.stringify(edited, null, 2)}\n`);
      const run = spawnSync(process.execPath, [script, "--check"], { cwd: dir, encoding: "utf8" });
      expect(run.status).toBe(1);
      expect(run.stderr).toContain("$.info.title");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("committed `openapi.json` equals the generator's output", () => {
    expect(readFileSync("openapi.json", "utf8")).toBe(renderOpenApi());
  });

  it("names the first differing JSON path", () => {
    expect(firstDifference({ a: 1 }, { a: 1 })).toBeUndefined();
    expect(firstDifference({ a: { b: [1, 2] } }, { a: { b: [1, 3] } })).toBe("$.a.b[1]");
    expect(firstDifference({ a: 1 }, { a: 1, b: 2 })).toBe("$.b");
    expect(firstDifference([1], [1, 2])).toBe("$[1]");
    expect(firstDifference({ a: [] }, { a: {} })).toBe("$.a");
    expect(firstDifference({ "x-y": 1 }, { "x-y": 2 })).toBe('$["x-y"]');
  });
});
