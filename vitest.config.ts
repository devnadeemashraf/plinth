import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));
const coreSrc = resolve(rootDir, "packages/core/src");

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@plinth\/core\/(.*)$/, replacement: `${coreSrc}/$1` },
      { find: /^@plinth\/core$/, replacement: resolve(coreSrc, "index.ts") },
      { find: /^@\/(.*)$/, replacement: `${coreSrc}/$1` },
      { find: /^#\/(.*)$/, replacement: `${coreSrc}/$1` },
    ],
  },
  test: {
    globals: false,
    environment: "node",
    include: ["packages/*/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["packages/core/src/**/*.ts"],
      exclude: [
        "packages/core/src/index.ts",
        "**/*.d.ts",
        "**/test/**",
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
    },
  },
});
