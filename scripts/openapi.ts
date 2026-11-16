/**
 * `pnpm openapi` writes `openapi.json` from the enabled modules' routes.
 * `pnpm openapi:check` compares instead and exits 1 naming the first differing JSON path.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { enabledModules } from "#modules/index.ts";
import { loadConfig } from "#platform/config/load.ts";
import { createRootContainer, registerModules } from "#platform/di/container.ts";
import { createLogger } from "#platform/logger/create-logger.ts";
import { apiDocument } from "#platform/openapi/api-document.ts";
import { serializeDocument } from "#platform/openapi/build-document.ts";

const FILE = "openapi.json";

export function renderOpenApi(): string {
  // Nothing connects to the database while rendering; the URL only satisfies the schema.
  const config = loadConfig({
    LOG_LEVEL: "fatal",
    DATABASE_URL: "postgres://plinth@127.0.0.1:5432/plinth",
  });
  const container = createRootContainer(config, createLogger(config));
  return serializeDocument(apiDocument(registerModules(container, config, enabledModules)));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const child = (path: string, key: string): string =>
  /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;

/** The JSONPath of the first place `actual` differs from `expected`, or undefined when equal. */
export function firstDifference(
  expected: unknown,
  actual: unknown,
  path = "$",
): string | undefined {
  if (Array.isArray(expected) && Array.isArray(actual)) {
    for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
      const found = firstDifference(expected[i], actual[i], `${path}[${i}]`);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
  if (isRecord(expected) && isRecord(actual)) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    for (const key of keys) {
      const found = firstDifference(expected[key], actual[key], child(path, key));
      if (found) {
        return found;
      }
    }
    return undefined;
  }
  return Object.is(expected, actual) ? undefined : path;
}

function check(): number {
  const generated = renderOpenApi();
  if (!existsSync(FILE)) {
    console.error(`${FILE} is missing; run pnpm openapi`);
    return 1;
  }
  const committed = readFileSync(FILE, "utf8");
  if (committed === generated) {
    console.log(`${FILE} is up to date`);
    return 0;
  }
  const path = firstDifference(JSON.parse(generated), JSON.parse(committed)) ?? "$ (formatting)";
  console.error(`${FILE} differs from the routes at ${path}; run pnpm openapi`);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    process.exitCode = check();
  } else {
    writeFileSync(FILE, renderOpenApi());
    console.log(`wrote ${FILE}`);
  }
}
