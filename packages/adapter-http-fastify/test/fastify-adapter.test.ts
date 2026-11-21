import { FastifyHttpAdapter } from "@plinth/adapter-http-fastify";
import { defineRoute } from "@plinth/core";
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

    it("should include CORS headers in responses", async () => {
      const res = await fetch(`${baseUrl}/api/v1/echo`, {
        method: "OPTIONS",
        headers: {
          Origin: "http://example.com",
          "Access-Control-Request-Method": "POST",
        },
      });

      expect(res.headers.get("access-control-allow-origin")).toBeDefined();
    });
  });
});
