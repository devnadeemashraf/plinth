import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "#platform/config/load.ts";
import { createRootContainer, registerModules } from "#platform/di/container.ts";
import type { Logger } from "#platform/kernel/ports/logger.ts";
import { createTestDatabase, type TestDatabase } from "../../../../test/support/postgres.ts";
import { platformModule } from "../../platform.module.ts";

const silent: Logger = {
  fatal: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  trace: () => {},
  child: () => silent,
};

let testDatabase: TestDatabase;

beforeAll(async () => {
  testDatabase = await createTestDatabase();
});

afterAll(async () => {
  await testDatabase.drop();
});

function containerFor(databaseUrl: string) {
  const config = loadConfig({ DATABASE_URL: databaseUrl });
  const container = createRootContainer(config, silent);
  const routes = registerModules(container, config, [platformModule]);
  return { container, routes };
}

describe("platform module", () => {
  it("registers the database as a singleton with a passing `postgres` readiness check", async () => {
    const { container, routes } = containerFor(testDatabase.url);
    expect(routes).toEqual([]);
    const { database } = container.cradle;
    expect(container.cradle.database).toBe(database);
    const [check] = container.cradle.readinessChecks;
    expect(check?.name).toBe("postgres");
    await expect(check?.check()).resolves.toBeUndefined();
    await container.dispose();
    await expect(database.pool.query("select 1")).rejects.toThrow();
  });

  it("the `postgres` check rejects when nothing listens at DATABASE_URL", async () => {
    const { container } = containerFor("postgres://plinth@127.0.0.1:1/plinth");
    const [check] = container.cradle.readinessChecks;
    await expect(check?.check()).rejects.toThrow();
    await container.dispose();
  });
});
