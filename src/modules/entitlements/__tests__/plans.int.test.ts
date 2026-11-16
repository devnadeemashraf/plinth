import { getTableColumns } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "#platform/config/load.ts";
import { historyDeclarationOf } from "#platform/db/history.ts";
import { createRootContainer, registerModules } from "#platform/di/container.ts";
import type { Logger } from "#platform/kernel/ports/logger.ts";
import { platformModule } from "#platform/platform.module.ts";
import { startTestServer, type TestServer } from "../../../../test/support/http.ts";
import { createTestDatabase, type TestDatabase } from "../../../../test/support/postgres.ts";
import { withClient } from "../../../../test/support/postgres-global.ts";
import { entitlementsModule } from "../entitlements.module.ts";
import { plans } from "../infra/schema.ts";

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
let container: ReturnType<typeof createRootContainer>;
let server: TestServer;

beforeAll(async () => {
  testDatabase = await createTestDatabase();
  const config = loadConfig({ DATABASE_URL: testDatabase.url });
  container = createRootContainer(config, silent);
  server = await startTestServer(
    registerModules(container, config, [platformModule, entitlementsModule]),
  );
});

afterAll(async () => {
  await server.close();
  await container.dispose();
  await testDatabase.drop();
});

describe("plans in postgres", () => {
  it('[P0-06 #1] Seeded database → GET `/v1/plans` → 200 `{ data: [{ key: "free", … }], nextCursor: null }`', async () => {
    const response = await fetch(`${server.url}/v1/plans`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [{ key: "free", name: "Free", audience: "user", isDefault: true, sort: 0 }],
      nextCursor: null,
    });
  });

  it("[P0-06 #7] Insert a second `is_default` plan for audience `user` → unique violation", async () => {
    const error = await withClient(testDatabase.url, (client) =>
      client.query(
        `INSERT INTO plans (id, key, name, audience, is_default)
         VALUES ('01930000-0000-7000-8000-0000000000ff', 'starter', 'Starter', 'user', true)`,
      ),
    ).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "23505", constraint: "plans_default_per_audience" });
  });

  it("[P0-06 #9] `plans` → declared tracked with every column classified", () => {
    const declaration = historyDeclarationOf(plans);
    expect(declaration?.mode).toBe("tracked");
    const classified = declaration?.mode === "tracked" ? Object.keys(declaration.columns) : [];
    expect(classified.sort()).toEqual(Object.keys(getTableColumns(plans)).sort());
  });

  it("filters by audience and finds by key through the repository", async () => {
    await withClient(testDatabase.url, (client) =>
      client.query(
        `INSERT INTO plans (id, key, name, audience, is_default, sort) VALUES
           ('01930000-0000-7000-8000-000000000010', 'team', 'Team', 'tenant', true, 1),
           ('01930000-0000-7000-8000-000000000011', 'business', 'Business', 'tenant', false, 1)`,
      ),
    );
    const { planRepository } = container.cradle;

    const tenantPlans = await planRepository.list({ audience: "tenant" });
    expect(tenantPlans.map(({ key }) => key)).toEqual(["business", "team"]);
    expect(await planRepository.findByKey("team")).toEqual({
      id: "01930000-0000-7000-8000-000000000010",
      key: "team",
      name: "Team",
      audience: "tenant",
      isDefault: true,
      sort: 1,
    });
    expect(await planRepository.findByKey("missing")).toBeUndefined();
  });

  it("rejects an audience outside `user` and `tenant`", async () => {
    const error = await withClient(testDatabase.url, (client) =>
      client.query(
        `INSERT INTO plans (id, key, name, audience)
         VALUES ('01930000-0000-7000-8000-000000000020', 'odd', 'Odd', 'admin')`,
      ),
    ).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "23514", constraint: "plans_audience_check" });
  });
});
