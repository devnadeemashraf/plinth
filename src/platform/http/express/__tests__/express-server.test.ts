import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError, platformErrors } from "#platform/kernel/errors.ts";
import type { RouteDefinition } from "#platform/kernel/http.ts";
import { startTestServer, type TestServer } from "../../../../../test/support/http.ts";

const ERROR_LEVEL = 50;
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function route(overrides: Partial<RouteDefinition>): RouteDefinition {
  return {
    method: "GET",
    path: "/things",
    summary: "Test route",
    description: "Test route",
    tags: ["test"],
    auth: "public",
    request: {},
    responses: { 200: { schema: z.unknown(), description: "OK", example: {} } },
    errors: [],
    handler: () => Promise.resolve({ status: 200, body: { ok: true } }),
    ...overrides,
  };
}

const echoRoute = route({
  method: "POST",
  path: "/echo",
  request: { body: z.strictObject({ name: z.string() }) },
  responses: {
    200: { schema: z.strictObject({ name: z.string() }), description: "Echo", example: {} },
  },
  handler: (ctx) => Promise.resolve({ status: 200, body: ctx.body }),
});

const dataRoute = route({
  method: "POST",
  path: "/data",
  request: { body: z.strictObject({ data: z.string() }) },
  handler: () => Promise.resolve({ status: 200, body: { ok: true } }),
});

let current: TestServer | undefined;

async function serve(
  routes: RouteDefinition[],
  config: Record<string, string> = {},
): Promise<TestServer> {
  current = await startTestServer(routes, config);
  return current;
}

afterEach(async () => {
  await current?.close();
  current = undefined;
});

const postJson = (url: string, body: string) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });

describe("Express adapter and pipeline", () => {
  it("[P0-02 #1] GET an unknown path → 404, content-type `application/problem+json`, code NOT_FOUND, body requestId equals the `x-request-id` response header", async () => {
    const { url } = await serve([route({})]);
    const response = await fetch(`${url}/missing`);
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(body["code"]).toBe("NOT_FOUND");
    expect(body["requestId"]).toBe(response.headers.get("x-request-id"));
  });

  it("[P0-02 #2] Handler throws `AppError(platformErrors.CONFLICT)` → 409 problem with code CONFLICT, nothing logged at error", async () => {
    const server = await serve([
      route({ handler: () => Promise.reject(new AppError(platformErrors.CONFLICT)) }),
    ]);
    const response = await fetch(`${server.url}/things`);
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(409);
    expect(body["code"]).toBe("CONFLICT");
    expect(server.logs().filter((line) => line.level >= ERROR_LEVEL)).toEqual([]);
  });

  it('[P0-02 #3] Handler throws `new Error("db password=x")` → 500, response body does not contain `password`, exactly one error log line carrying the requestId', async () => {
    const server = await serve([
      route({ handler: () => Promise.reject(new Error("db password=x")) }),
    ]);
    const response = await fetch(`${server.url}/things`);
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(text).not.toContain("password");
    const errors = server.logs().filter((line) => line.level >= ERROR_LEVEL);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.["requestId"]).toBe(response.headers.get("x-request-id"));
  });

  it("[P0-02 #4] POST body with a field the strict schema lacks → 400 VALIDATION_FAILED, `errors[0].path` names the field", async () => {
    const { url } = await serve([echoRoute]);
    const response = await postJson(`${url}/echo`, JSON.stringify({ name: "a", isAdmin: true }));
    const body = (await response.json()) as { code: string; errors: { path: string }[] };
    expect(response.status).toBe(400);
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(body.errors[0]?.path).toBe("body.isAdmin");
  });

  it("[P0-02 #5] POST a malformed JSON body → 400 VALIDATION_FAILED, not 500", async () => {
    const { url } = await serve([echoRoute]);
    const response = await postJson(`${url}/echo`, '{"name": ');
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(400);
    expect(body["code"]).toBe("VALIDATION_FAILED");
  });

  it("[P0-02 #6] Body of exactly BODY_LIMIT_BYTES → accepted; one byte more → 413 PAYLOAD_TOO_LARGE", async () => {
    const limit = 64;
    const { url } = await serve([dataRoute], { BODY_LIMIT_BYTES: String(limit) });
    const envelope = JSON.stringify({ data: "" }).length;
    const exact = JSON.stringify({ data: "x".repeat(limit - envelope) });
    const over = JSON.stringify({ data: "x".repeat(limit - envelope + 1) });
    expect(Buffer.byteLength(exact)).toBe(limit);

    const accepted = await postJson(`${url}/data`, exact);
    expect(accepted.status).toBe(200);
    const rejected = await postJson(`${url}/data`, over);
    const body = (await rejected.json()) as Record<string, unknown>;
    expect(rejected.status).toBe(413);
    expect(body["code"]).toBe("PAYLOAD_TOO_LARGE");
  });

  it("[P0-02 #7] Incoming `x-request-id: abc` → replaced by a UUIDv7; `req-12345678` → echoed unchanged", async () => {
    const { url } = await serve([route({})]);
    const replaced = await fetch(`${url}/things`, { headers: { "x-request-id": "abc" } });
    expect(replaced.headers.get("x-request-id")).toMatch(UUID_V7);
    const kept = await fetch(`${url}/things`, { headers: { "x-request-id": "req-12345678" } });
    expect(kept.headers.get("x-request-id")).toBe("req-12345678");
  });

  it("[P0-02 #8] Any response → has nosniff and `default-src 'none'`, has no `x-powered-by`", async () => {
    const { url } = await serve([route({})]);
    for (const path of ["/things", "/missing"]) {
      const response = await fetch(`${url}${path}`);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
      expect(response.headers.has("x-powered-by")).toBe(false);
    }
  });

  it("[P0-02 #9] Origin in CORS_ORIGINS → allow-origin echoed; other origin → no allow-origin; preflight from allowed origin → 204", async () => {
    const allowed = "https://app.example.com";
    const { url } = await serve([route({})], { CORS_ORIGINS: allowed });

    const fromAllowed = await fetch(`${url}/things`, { headers: { origin: allowed } });
    expect(fromAllowed.headers.get("access-control-allow-origin")).toBe(allowed);
    expect(fromAllowed.headers.get("vary")).toBe("origin");

    const fromOther = await fetch(`${url}/things`, { headers: { origin: "https://evil.example" } });
    expect(fromOther.headers.has("access-control-allow-origin")).toBe(false);

    const preflight = await fetch(`${url}/things`, {
      method: "OPTIONS",
      headers: { origin: allowed, "access-control-request-method": "POST" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(allowed);
    expect(preflight.headers.get("access-control-allow-methods")).toContain("POST");

    const otherPreflight = await fetch(`${url}/things`, {
      method: "OPTIONS",
      headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
    });
    expect(otherPreflight.status).toBe(204);
    expect(otherPreflight.headers.has("access-control-allow-origin")).toBe(false);
    expect(otherPreflight.headers.has("access-control-allow-methods")).toBe(false);
  });

  it("[P0-02 #11] Handler returns a body violating its response schema with NODE_ENV test → 500 and an error log", async () => {
    const server = await serve([
      route({
        responses: {
          200: { schema: z.strictObject({ id: z.string() }), description: "", example: {} },
        },
        handler: () => Promise.resolve({ status: 200, body: { id: 1, secret: "s" } }),
      }),
    ]);
    const response = await fetch(`${server.url}/things`);
    expect(response.status).toBe(500);
    expect(server.logs().filter((line) => line.level >= ERROR_LEVEL)).toHaveLength(1);
  });

  it("skips response-schema validation in production and adds HSTS", async () => {
    const { url } = await serve(
      [
        route({
          responses: {
            200: { schema: z.strictObject({ id: z.string() }), description: "", example: {} },
          },
          handler: () => Promise.resolve({ status: 200, body: { id: 1 } }),
        }),
      ],
      { NODE_ENV: "production" },
    );
    const response = await fetch(`${url}/things`);
    expect(response.status).toBe(200);
    expect(response.headers.get("strict-transport-security")).toContain("max-age=31536000");
  });

  it("passes path params, query and headers to the handler and returns status without a body", async () => {
    let seen: unknown;
    const { url } = await serve([
      route({
        method: "DELETE",
        path: "/things/{id}",
        request: {
          params: z.strictObject({ id: z.string() }),
          query: z.strictObject({ force: z.literal("true") }),
        },
        responses: { 204: { schema: z.undefined(), description: "Deleted", example: undefined } },
        handler: (ctx) => {
          seen = { params: ctx.params, query: ctx.query, header: ctx.headers["x-test"] };
          return Promise.resolve({ status: 204 });
        },
      }),
    ]);
    const response = await fetch(`${url}/things/42?force=true`, {
      method: "DELETE",
      headers: { "x-test": "yes" },
    });
    expect(response.status).toBe(204);
    expect(response.headers.has("content-type")).toBe(false);
    expect(seen).toEqual({ params: { id: "42" }, query: { force: "true" }, header: "yes" });
  });

  it("reports a failing query parameter with its location", async () => {
    const { url } = await serve([
      route({ request: { query: z.strictObject({ limit: z.string().regex(/^\d+$/) }) } }),
    ]);
    const response = await fetch(`${url}/things?limit=abc`);
    const body = (await response.json()) as { errors: { path: string }[] };
    expect(response.status).toBe(400);
    expect(body.errors[0]?.path).toBe("query.limit");
  });

  it("answers a known path with another method as NOT_FOUND", async () => {
    const { url } = await serve([route({})]);
    const response = await fetch(`${url}/things`, { method: "PUT" });
    expect(response.status).toBe(404);
  });

  it("rejects an unsupported content encoding as VALIDATION_FAILED", async () => {
    const { url } = await serve([echoRoute]);
    const response = await fetch(`${url}/echo`, {
      method: "POST",
      headers: { "content-type": "application/json", "content-encoding": "br-unknown" },
      body: "{}",
    });
    expect(response.status).toBe(400);
  });

  it.each([
    [{ auth: "session" as const }],
    [{ idempotent: true }],
    [{ rateLimit: { limit: 1, windowSeconds: 1 } }],
  ])("refuses at boot a route with %o", async (setting) => {
    await expect(startTestServer([route(setting)])).rejects.toThrow(
      "Not supported until E01/E03: GET /things",
    );
  });

  it("refuses routes registered after listen", async () => {
    const server = await serve([]);
    expect(() => server.server.register([route({})])).toThrow("before listen");
  });

  it("close waits for an in-flight request", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const server = await startTestServer([
      route({
        handler: async () => {
          await gate;
          return { status: 200, body: { done: true } };
        },
      }),
    ]);
    const pending = fetch(`${server.url}/things`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const closed = server.close();
    release();
    expect((await pending).status).toBe(200);
    await closed;
  });
});
