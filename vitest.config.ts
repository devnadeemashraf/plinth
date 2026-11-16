import { defineConfig } from "vitest/config";

const full = { lines: 100, branches: 100, functions: 100, statements: 100 };

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts", "test/**/*.test.ts"],
    globalSetup: ["test/support/postgres-global.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/__tests__/**", "src/**/*.test.ts", "src/main/**"],
      reporter: ["json", "text-summary"],
      reportsDirectory: "coverage",
      thresholds: {
        "src/modules/*/domain/**": full,
        "src/modules/*/application/**": full,
      },
    },
  },
});
