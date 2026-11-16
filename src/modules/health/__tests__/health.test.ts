import { afterEach, describe, expect, it } from "vitest";
import { createTestContainer } from "#platform/di/test-container.ts";
import { AppError, platformErrors } from "#platform/kernel/errors.ts";
import type { ReadinessCheck } from "#platform/kernel/readiness.ts";
import { startTestServer, type TestServer } from "../../../../test/support/http.ts";
import { healthModule } from "../health.module.ts";

let current: TestServer | undefined;

async function serveHealth(readinessChecks: ReadinessCheck[]): Promise<TestServer> {
  const container = createTestContainer({ overrides: { readinessChecks } });
  current = await startTestServer(healthModule.routes(container));
  return current;
}

afterEach(async () => {
  await current?.close();
  current = undefined;
});

const passing = (name: string): ReadinessCheck => ({ name, check: () => Promise.resolve() });

describe("health module", () => {
  it("[P0-02 #10] `/readyz` with one check rejecting and one hanging 5 s → 503 within 1500 ms, `retry-after: 5`, `failing` lists both names, no error text", async () => {
    let hang: ReturnType<typeof setTimeout> | undefined;
    const { url } = await serveHealth([
      passing("cache"),
      {
        name: "database",
        check: () =>
          Promise.reject(
            new AppError(platformErrors.UNAVAILABLE, { message: "pg refused 10.0.0.5" }),
          ),
      },
      {
        name: "queue",
        check: () =>
          new Promise((resolve) => {
            hang = setTimeout(resolve, 5000);
          }),
      },
    ]);
    const started = performance.now();
    const response = await fetch(`${url}/readyz`);
    const elapsed = performance.now() - started;
    const text = await response.text();
    clearTimeout(hang);

    expect(response.status).toBe(503);
    expect(elapsed).toBeLessThan(1500);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(JSON.parse(text)).toEqual({ status: "unready", failing: ["database", "queue"] });
    expect(text).not.toContain("refused");
    expect(text).not.toContain("took over");
  });

  it("`/readyz` with every check passing → 200 with each check ok", async () => {
    const { url } = await serveHealth([passing("cache"), passing("database")]);
    const response = await fetch(`${url}/readyz`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ready",
      checks: { cache: "ok", database: "ok" },
    });
  });

  it("`/livez` → 200 ok without running checks", async () => {
    let ran = false;
    const { url } = await serveHealth([
      {
        name: "database",
        check: () => {
          ran = true;
          return Promise.resolve();
        },
      },
    ]);
    const response = await fetch(`${url}/livez`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(ran).toBe(false);
  });
});
