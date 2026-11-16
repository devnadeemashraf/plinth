import { globSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { undeclaredTables } from "../history.ts";

it("every pgTable exported by a module schema has a history declaration", async () => {
  const schemas = await Promise.all(
    globSync("src/modules/*/infra/schema.ts").map(
      (path) => import(pathToFileURL(path).href) as Promise<Record<string, unknown>>,
    ),
  );
  expect(undeclaredTables(schemas)).toEqual([]);
});
