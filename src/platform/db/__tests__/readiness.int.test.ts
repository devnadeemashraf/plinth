import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { getContainerRuntimeClient } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POSTGRES_IMAGE } from "../../../../test/support/postgres-global.ts";
import { freePort, type SpawnedApi, spawnApi } from "../../../../test/support/process.ts";

// This test stops its own Postgres server, so it cannot share the run's server.
let postgres: StartedPostgreSqlContainer;
let api: SpawnedApi;

beforeAll(async () => {
  const hostPort = await freePort();
  // A fixed host port survives the restart, so the API keeps the same DATABASE_URL.
  postgres = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withExposedPorts({ container: 5432, host: hostPort })
    .start();
  const url = new URL(postgres.getConnectionUri());
  url.port = String(hostPort);
  api = await spawnApi({ DATABASE_URL: url.toString() });
}, 120_000);

afterAll(async () => {
  api.terminate();
  await api.exited;
  await postgres.stop();
});

async function readyz(): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${api.url}/readyz`);
  return { status: response.status, body: await response.json() };
}

async function eventuallyReady(deadlineMs: number): Promise<{ status: number; body: unknown }> {
  const deadline = performance.now() + deadlineMs;
  let last = await readyz();
  while (last.status !== 200 && performance.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    last = await readyz();
  }
  return last;
}

describe("postgres readiness", () => {
  it("[P0-04 #8] Postgres stopped → `/readyz` 503 listing `postgres`; restarted → 200", async () => {
    expect(await readyz()).toEqual({
      status: 200,
      body: { status: "ready", checks: { postgres: "ok" } },
    });

    const runtime = await getContainerRuntimeClient();
    const container = runtime.container.getById(postgres.getId());
    await runtime.container.stop(container, { timeout: 0 });

    expect(await readyz()).toEqual({
      status: 503,
      body: { status: "unready", failing: ["postgres"] },
    });

    await runtime.container.start(container);

    expect(await eventuallyReady(30_000)).toEqual({
      status: 200,
      body: { status: "ready", checks: { postgres: "ok" } },
    });
  }, 60_000);
});
