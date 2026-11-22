import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));
const coreSrc = resolve(rootDir, "packages/core/src");
const brandSrc = resolve(rootDir, "packages/modules/brand/src");
const tenantsSrc = resolve(rootDir, "packages/modules/tenants/src");
const rbacSrc = resolve(rootDir, "packages/modules/rbac/src");
const configStoreSrc = resolve(rootDir, "packages/modules/config-store/src");
const auditSrc = resolve(rootDir, "packages/modules/audit/src");
const authSrc = resolve(rootDir, "packages/modules/auth/src");
const contractTestsSrc = resolve(rootDir, "packages/contract-tests/src");
const fastifySrc = resolve(rootDir, "packages/adapters/http/fastify/src");
const expressSrc = resolve(rootDir, "packages/adapters/http/express/src");
const sqliteSrc = resolve(rootDir, "packages/adapters/db/sqlite/src");
const postgresSrc = resolve(rootDir, "packages/adapters/db/postgres/src");
const mysqlSrc = resolve(rootDir, "packages/adapters/db/mysql/src");
const cacheMemorySrc = resolve(rootDir, "packages/adapters/cache/memory/src");
const cacheRedisSrc = resolve(rootDir, "packages/adapters/cache/redis/src");
const queueDbSrc = resolve(rootDir, "packages/adapters/queue/db/src");
const queueBullmqSrc = resolve(rootDir, "packages/adapters/queue/bullmq/src");
const emailStubSrc = resolve(rootDir, "packages/adapters/email/stub/src");
const emailSmtpSrc = resolve(rootDir, "packages/adapters/email/smtp/src");
const storageLocalSrc = resolve(rootDir, "packages/adapters/storage/local/src");
const storageS3Src = resolve(rootDir, "packages/adapters/storage/s3/src");
const analyticsStubSrc = resolve(rootDir, "packages/adapters/analytics/stub/src");
const billingStubSrc = resolve(rootDir, "packages/adapters/billing/stub/src");
const billingRazorpaySrc = resolve(rootDir, "packages/adapters/billing/razorpay/src");
const billingStripeSrc = resolve(rootDir, "packages/adapters/billing/stripe/src");
const usersSrc = resolve(rootDir, "packages/modules/users/src");
const complianceSrc = resolve(rootDir, "packages/modules/compliance/src");
const billingSrc = resolve(rootDir, "packages/modules/billing/src");
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
      { find: /^@plinth\/modules-config-store\/(.*)$/, replacement: `${configStoreSrc}/$1` },
      { find: /^@plinth\/modules-config-store$/, replacement: resolve(configStoreSrc, "index.ts") },
      { find: /^@plinth\/modules-audit\/(.*)$/, replacement: `${auditSrc}/$1` },
      { find: /^@plinth\/modules-audit$/, replacement: resolve(auditSrc, "index.ts") },
      { find: /^@plinth\/modules-auth\/(.*)$/, replacement: `${authSrc}/$1` },
      { find: /^@plinth\/modules-auth$/, replacement: resolve(authSrc, "index.ts") },
      { find: /^@plinth\/contract-tests\/(.*)$/, replacement: `${contractTestsSrc}/$1` },
      { find: /^@plinth\/contract-tests$/, replacement: resolve(contractTestsSrc, "index.ts") },
      { find: /^@plinth\/adapter-http-fastify\/(.*)$/, replacement: `${fastifySrc}/$1` },
      { find: /^@plinth\/adapter-http-fastify$/, replacement: resolve(fastifySrc, "index.ts") },
      { find: /^@plinth\/adapter-http-express\/(.*)$/, replacement: `${expressSrc}/$1` },
      { find: /^@plinth\/adapter-http-express$/, replacement: resolve(expressSrc, "index.ts") },
      { find: /^@plinth\/adapter-db-sqlite\/(.*)$/, replacement: `${sqliteSrc}/$1` },
      { find: /^@plinth\/adapter-db-sqlite$/, replacement: resolve(sqliteSrc, "index.ts") },
      { find: /^@plinth\/adapter-db-postgres\/(.*)$/, replacement: `${postgresSrc}/$1` },
      { find: /^@plinth\/adapter-db-postgres$/, replacement: resolve(postgresSrc, "index.ts") },
      { find: /^@plinth\/adapter-db-mysql\/(.*)$/, replacement: `${mysqlSrc}/$1` },
      { find: /^@plinth\/adapter-db-mysql$/, replacement: resolve(mysqlSrc, "index.ts") },
      { find: /^@plinth\/adapter-cache-memory\/(.*)$/, replacement: `${cacheMemorySrc}/$1` },
      { find: /^@plinth\/adapter-cache-memory$/, replacement: resolve(cacheMemorySrc, "index.ts") },
      { find: /^@plinth\/adapter-cache-redis\/(.*)$/, replacement: `${cacheRedisSrc}/$1` },
      { find: /^@plinth\/adapter-cache-redis$/, replacement: resolve(cacheRedisSrc, "index.ts") },
      { find: /^@plinth\/adapter-queue-db\/(.*)$/, replacement: `${queueDbSrc}/$1` },
      { find: /^@plinth\/adapter-queue-db$/, replacement: resolve(queueDbSrc, "index.ts") },
      { find: /^@plinth\/adapter-queue-bullmq\/(.*)$/, replacement: `${queueBullmqSrc}/$1` },
      { find: /^@plinth\/adapter-queue-bullmq$/, replacement: resolve(queueBullmqSrc, "index.ts") },
      { find: /^@plinth\/adapter-email-stub\/(.*)$/, replacement: `${emailStubSrc}/$1` },
      { find: /^@plinth\/adapter-email-stub$/, replacement: resolve(emailStubSrc, "index.ts") },
      { find: /^@plinth\/adapter-email-smtp\/(.*)$/, replacement: `${emailSmtpSrc}/$1` },
      { find: /^@plinth\/adapter-email-smtp$/, replacement: resolve(emailSmtpSrc, "index.ts") },
      { find: /^@plinth\/adapter-storage-local\/(.*)$/, replacement: `${storageLocalSrc}/$1` },
      { find: /^@plinth\/adapter-storage-local$/, replacement: resolve(storageLocalSrc, "index.ts") },
      { find: /^@plinth\/adapter-storage-s3\/(.*)$/, replacement: `${storageS3Src}/$1` },
      { find: /^@plinth\/adapter-storage-s3$/, replacement: resolve(storageS3Src, "index.ts") },
      { find: /^@plinth\/adapter-analytics-stub\/(.*)$/, replacement: `${analyticsStubSrc}/$1` },
      { find: /^@plinth\/adapter-analytics-stub$/, replacement: resolve(analyticsStubSrc, "index.ts") },
      { find: /^@plinth\/adapter-billing-stub\/(.*)$/, replacement: `${billingStubSrc}/$1` },
      { find: /^@plinth\/adapter-billing-stub$/, replacement: resolve(billingStubSrc, "index.ts") },
      { find: /^@plinth\/adapter-billing-razorpay\/(.*)$/, replacement: `${billingRazorpaySrc}/$1` },
      { find: /^@plinth\/adapter-billing-razorpay$/, replacement: resolve(billingRazorpaySrc, "index.ts") },
      { find: /^@plinth\/adapter-billing-stripe\/(.*)$/, replacement: `${billingStripeSrc}/$1` },
      { find: /^@plinth\/adapter-billing-stripe$/, replacement: resolve(billingStripeSrc, "index.ts") },
      { find: /^@plinth\/modules-users\/(.*)$/, replacement: `${usersSrc}/$1` },
      { find: /^@plinth\/modules-users$/, replacement: resolve(usersSrc, "index.ts") },
      { find: /^@plinth\/modules-compliance\/(.*)$/, replacement: `${complianceSrc}/$1` },
      { find: /^@plinth\/modules-compliance$/, replacement: resolve(complianceSrc, "index.ts") },
      { find: /^@plinth\/modules-billing\/(.*)$/, replacement: `${billingSrc}/$1` },
      { find: /^@plinth\/modules-billing$/, replacement: resolve(billingSrc, "index.ts") },
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
        "packages/adapters/**/src/**/*.ts",
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
