import { FastifyHttpAdapter } from "@plinth/adapter-http-fastify";
import {
  defineRoute,
  getTenantContext,
  InMemoryIdempotencyManager,
  InMemoryRateLimiter,
} from "@plinth/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

describe("adapter-http-fastify / FastifyHttpAdapter (5-category TDD)", () => {
  let server: FastifyHttpAdapter;
  let baseUrl: string;

  const testRoute = defineRoute({
    method: "POST",
    path: "/api/v1/echo",
    summary: "Echo endpoint",
    bodySchema: z.strictObject({
      message: z.string().min(1),
    }),
    responseSchemas: {
      200: z.strictObject({
        echo: z.string(),
      }),
    },
  });

  const failingRoute = defineRoute({
    method: "GET",
    path: "/api/v1/fail",
    summary: "Failing endpoint",
  });

  beforeAll(async () => {
    server = new FastifyHttpAdapter({
      isProduction: true,
      openApiInfo: {
        title: "Test Fastify Suite",
        version: "1.0.0",
      },
    });

    server.registerRoute(testRoute, async (req) => {
      const body = req.body as { message: string };
      return {
        statusCode: 200,
        body: { echo: body.message },
      };
    });

    server.registerRoute(failingRoute, async () => {
      throw new Error("Unhandled DB connection failure at postgresql://user:pass@internal:5432/db");
    });

    const info = await server.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${info.port}`;
  });

  afterAll(async () => {
    await server.close();
  });

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should handle valid route request and return JSON response", async () => {
      const res = await fetch(`${baseUrl}/api/v1/echo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Hello Fastify!" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ echo: "Hello Fastify!" });
    });

    it("should serve OpenAPI 3.1 JSON at GET /openapi.json", async () => {
      const res = await fetch(`${baseUrl}/openapi.json`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");

      const spec = (await res.json()) as Record<string, unknown>;
      expect(spec["openapi"]).toBe("3.1.0");
      expect((spec["info"] as Record<string, unknown>)["title"]).toBe("Test Fastify Suite");
      expect((spec["paths"] as Record<string, unknown>)["/api/v1/echo"]).toBeDefined();
    });

    it("should serve interactive Scalar API Reference UI at GET /docs", async () => {
      const res = await fetch(`${baseUrl}/docs`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");

      const html = await res.text();
      expect(html).toContain("scalar");
      expect(html).toContain("/openapi.json");
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should return RFC 9457 Problem Details (422) on invalid input payload", async () => {
      const res = await fetch(`${baseUrl}/api/v1/echo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "" }), // violates min(1)
      });

      expect(res.status).toBe(422);
      expect(res.headers.get("content-type")).toContain("application/problem+json");

      const problem = (await res.json()) as Record<string, unknown>;
      expect(problem["status"]).toBe(422);
      expect(problem["code"]).toBe("VALIDATION_ERROR");
      expect(problem["errors"]).toBeDefined();
    });

    it("should return RFC 9457 Problem Details (400) on malformed JSON", async () => {
      const res = await fetch(`${baseUrl}/api/v1/echo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ malformed: json, ",
      });

      expect(res.status).toBe(400);
      expect(res.headers.get("content-type")).toContain("application/problem+json");
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should handle 20 concurrent requests without contention", async () => {
      const requests = Array.from({ length: 20 }, (_, i) =>
        fetch(`${baseUrl}/api/v1/echo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: `msg_${i}` }),
        }).then((r) => r.json()),
      );

      const results = await Promise.all(requests);
      expect(results).toHaveLength(20);
      expect(results[0]).toEqual({ echo: "msg_0" });
      expect(results[19]).toEqual({ echo: "msg_19" });
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should catch unhandled exceptions and format as RFC 9457 500 without leaking stack in production", async () => {
      const res = await fetch(`${baseUrl}/api/v1/fail`);

      expect(res.status).toBe(500);
      expect(res.headers.get("content-type")).toContain("application/problem+json");

      const problem = (await res.json()) as Record<string, unknown>;
      expect(problem["status"]).toBe(500);
      expect(problem["detail"]).toBe("An unexpected internal server error occurred.");
      expect(problem["stack"]).toBeUndefined();
      expect(JSON.stringify(problem)).not.toContain("postgresql://");
    });
  });

  // Category 5: Security & Abuse Cases
  describe("Category 5: Security & Abuse Cases", () => {
    it("should reject extraneous unknown fields on strict body schema", async () => {
      const res = await fetch(`${baseUrl}/api/v1/echo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Valid", maliciousRole: "admin" }),
      });

      expect(res.status).toBe(422);
    });

    it("should include hardened security headers in responses", async () => {
      const res = await fetch(`${baseUrl}/api/v1/echo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Security Headers" }),
      });

      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("x-frame-options")).toBe("DENY");
      expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
      expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
      expect(res.headers.get("strict-transport-security")).toContain("max-age=31536000");
    });
  });

  describe("FastifyHttpAdapter Security & Tenancy Integration", () => {
    let advancedServer: FastifyHttpAdapter;
    let advUrl: string;

    const mutateRoute = defineRoute({
      method: "POST",
      path: "/api/v1/transfer",
      summary: "Transfer endpoint",
      bodySchema: z.strictObject({
        amount: z.number().positive(),
      }),
      responseSchemas: {
        200: z.strictObject({
          transferred: z.number(),
          tenant: z.string(),
        }),
      },
    });

    beforeAll(async () => {
      advancedServer = new FastifyHttpAdapter({
        isProduction: false,
        rateLimiter: new InMemoryRateLimiter({ windowMs: 10_000, maxRequests: 20 }),
        idempotencyManager: new InMemoryIdempotencyManager({ ttlMs: 60_000 }),
        tenantResolver: {
          mode: "multi",
          strategy: "header",
          headerName: "x-tenant-id",
        },
      });

      advancedServer.registerRoute(mutateRoute, async (req) => {
        const body = req.body as { amount: number };
        if (body.amount === 666) {
          throw new Error("Simulated payment processor crash");
        }
        const ctx = getTenantContext();
        return {
          statusCode: 200,
          body: {
            transferred: body.amount,
            tenant: ctx?.slug ?? "no_tenant",
          },
        };
      });

      const info = await advancedServer.listen(0, "127.0.0.1");
      advUrl = `http://127.0.0.1:${info.port}`;
    });

    afterAll(async () => {
      await advancedServer.close();
    });

    it("should resolve tenant context from x-tenant-id header", async () => {
      const res = await fetch(`${advUrl}/api/v1/transfer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": "client-alpha",
        },
        body: JSON.stringify({ amount: 100 }),
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as { transferred: number; tenant: string };
      expect(json.tenant).toBe("client-alpha");
    });

    it("should leave ambient tenant context undefined when tenant header is omitted in multi-tenant mode", async () => {
      const res = await fetch(`${advUrl}/api/v1/transfer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: 100 }),
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as { transferred: number; tenant: string };
      expect(json.tenant).toBe("no_tenant");
    });

    it("should release idempotency lock when handler throws, permitting subsequent client retry", async () => {
      const errorKey = "idem_error_retry_key";

      // 1. Initial attempt fails with 500
      const failedRes = await fetch(`${advUrl}/api/v1/transfer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": "client-alpha",
          "idempotency-key": errorKey,
        },
        body: JSON.stringify({ amount: 666 }),
      });
      expect(failedRes.status).toBe(500);

      // 2. Client retries with the same idempotency key and corrected payload
      const retryRes = await fetch(`${advUrl}/api/v1/transfer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": "client-alpha",
          "idempotency-key": errorKey,
        },
        body: JSON.stringify({ amount: 200 }),
      });

      // Must succeed (200), proving lock was released and NOT left as 409 Conflict
      expect(retryRes.status).toBe(200);
      const retryJson = (await retryRes.json()) as { transferred: number };
      expect(retryJson.transferred).toBe(200);
    });

    it("should replay identical response on duplicate Idempotency-Key", async () => {
      const idemKey = "transfer_idem_123";

      // 1. Initial request
      const res1 = await fetch(`${advUrl}/api/v1/transfer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": "client-alpha",
          "idempotency-key": idemKey,
        },
        body: JSON.stringify({ amount: 250 }),
      });

      expect(res1.status).toBe(200);
      expect(res1.headers.get("idempotency-replayed")).toBeNull();

      // 2. Exact retry request with identical key and payload
      const res2 = await fetch(`${advUrl}/api/v1/transfer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": "client-alpha",
          "idempotency-key": idemKey,
        },
        body: JSON.stringify({ amount: 250 }),
      });

      expect(res2.status).toBe(200);
      expect(res2.headers.get("idempotency-replayed")).toBe("true");
      const json2 = await res2.json();
      expect(json2).toEqual({ transferred: 250, tenant: "client-alpha" });
    });

    it("should return 409 Conflict if Idempotency-Key is reused with different payload", async () => {
      const res = await fetch(`${advUrl}/api/v1/transfer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": "client-alpha",
          "idempotency-key": "transfer_idem_123", // reusing same key
        },
        body: JSON.stringify({ amount: 999999 }), // different amount!
      });

      expect(res.status).toBe(409);
      const problem = (await res.json()) as Record<string, unknown>;
      expect(problem["code"]).toBe("IDEMPOTENCY_CONFLICT");
    });

    it("should enforce RateLimit-* headers and return 429 when budget is exhausted", async () => {
      const rateLimitedServer = new FastifyHttpAdapter({
        isProduction: false,
        rateLimiter: new InMemoryRateLimiter({ windowMs: 10_000, maxRequests: 2 }),
      });
      rateLimitedServer.registerRoute(mutateRoute, async (req) => {
        const body = req.body as { amount: number };
        return { statusCode: 200, body: { transferred: body.amount, tenant: "default" } };
      });
      const bound = await rateLimitedServer.listen(0, "127.0.0.1");
      const url = `http://127.0.0.1:${bound.port}`;

      try {
        const r1 = await fetch(`${url}/api/v1/transfer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: 10 }),
        });
        expect(r1.headers.get("ratelimit-limit")).toBe("2");
        expect(r1.status).toBe(200);

        const r2 = await fetch(`${url}/api/v1/transfer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: 10 }),
        });
        expect(r2.status).toBe(200);

        // 3rd request must be blocked (maxRequests: 2)
        const blocked = await fetch(`${url}/api/v1/transfer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: 10 }),
        });

        expect(blocked.status).toBe(429);
        expect(blocked.headers.get("retry-after")).toBeDefined();
        const problem = (await blocked.json()) as Record<string, unknown>;
        expect(problem["code"]).toBe("RATE_LIMIT_EXCEEDED");
      } finally {
        await rateLimitedServer.close();
      }
    });
  });
});
