import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));
const coreSrc = resolve(rootDir, "packages/core/src");
const brandSrc = resolve(rootDir, "packages/modules/brand/src");
const tenantsSrc = resolve(rootDir, "packages/modules/tenants/src");
const rbacSrc = resolve(rootDir, "packages/modules/rbac/src");
const fastifySrc = resolve(rootDir, "packages/adapter-http-fastify/src");
const sqliteSrc = resolve(rootDir, "packages/adapter-db-sqlite/src");
const refApiSrc = resolve(rootDir, "apps/reference-api/src");

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@plinth\/core\/(.*)$/, replacement: `${coreSrc}/$1` },
      { find: /^@plinth\/core$/, replacement: resolve(coreSrc, "index.ts") },
      { find: /^@plinth\/modules-brand\/(.*)$/, replacement: `${brandSrc}/$1` },
      { find: /^@plinth\/modules-brand$/, replacement: resolve(brandSrc, "index.ts") },
      { find: /^@plinth\/modules-tenants\/(.*)$/, replacement: `${tenantsSrc}/$1` },
      { find: /^@plinth\/modules-tenants$/, replacement: resolve(tenantsSrc, "index.ts") },
      { find: /^@plinth\/modules-rbac\/(.*)$/, replacement: `${rbacSrc}/$1` },
      { find: /^@plinth\/modules-rbac$/, replacement: resolve(rbacSrc, "index.ts") },
      { find: /^@plinth\/adapter-http-fastify\/(.*)$/, replacement: `${fastifySrc}/$1` },
      { find: /^@plinth\/adapter-http-fastify$/, replacement: resolve(fastifySrc, "index.ts") },
      { find: /^@plinth\/adapter-db-sqlite\/(.*)$/, replacement: `${sqliteSrc}/$1` },
      { find: /^@plinth\/adapter-db-sqlite$/, replacement: resolve(sqliteSrc, "index.ts") },
      { find: /^@plinth\/reference-api\/(.*)$/, replacement: `${refApiSrc}/$1` },
      { find: /^@plinth\/reference-api$/, replacement: resolve(refApiSrc, "app.ts") },
      { find: /^@\/(.*)$/, replacement: `${coreSrc}/$1` },
      { find: /^#\/(.*)$/, replacement: `${coreSrc}/$1` },
    ],
  },
  test: {
    globals: false,
    environment: "node",
    include: ["packages/**/test/**/*.test.ts", "apps/**/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: [
        "packages/core/src/**/*.ts",
        "packages/modules/*/src/**/*.ts",
        "packages/adapter-*/src/**/*.ts",
        "apps/*/src/**/*.ts",
      ],
      exclude: [
        "**/index.ts",
        "apps/*/src/server.ts",
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
