import { buildApp } from "@plinth/reference-api/app.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("apps/reference-api / End-to-End Vertical Slice (5-category TDD)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let baseUrl: string;

  beforeAll(async () => {
    app = await buildApp({
      isProduction: true,
      sqliteFilename: ":memory:",
      port: 0,
      host: "127.0.0.1",
    });

    const info = await app.start();
    baseUrl = `http://127.0.0.1:${info.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should pass zero-I/O liveness probe at GET /health/live", async () => {
      const res = await fetch(`${baseUrl}/health/live`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ status: "ok" });
    });

    it("should pass bounded DB readiness probe at GET /health/ready", async () => {
      const res = await fetch(`${baseUrl}/health/ready`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ status: "ready" });
    });

    it("should serve OpenAPI 3.1 JSON at GET /openapi.json", async () => {
      const res = await fetch(`${baseUrl}/openapi.json`);
      expect(res.status).toBe(200);

      const spec = (await res.json()) as Record<string, unknown>;
      expect(spec["openapi"]).toBe("3.1.0");
      expect((spec["paths"] as Record<string, unknown>)["/api/v1/brand"]).toBeDefined();
      expect((spec["paths"] as Record<string, unknown>)["/health/live"]).toBeDefined();
      expect((spec["paths"] as Record<string, unknown>)["/health/ready"]).toBeDefined();
    });

    it("should serve interactive Scalar API Reference UI at GET /docs", async () => {
      const res = await fetch(`${baseUrl}/docs`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");

      const html = await res.text();
      expect(html).toContain("Scalar API Reference");
      expect(html).toContain("/openapi.json");
    });

    it("should complete Brand CRUD: read default brand, update brand, and verify persistence", async () => {
      // 1. Read default brand
      const getRes1 = await fetch(`${baseUrl}/api/v1/brand`);
      expect(getRes1.status).toBe(200);
      const initial = (await getRes1.json()) as Record<string, unknown>;
      expect(initial["name"]).toBe("Plinth");

      // 2. Update brand
      const putRes = await fetch(`${baseUrl}/api/v1/brand`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Plinth Enterprise",
          primaryColorHex: "#3b82f6",
        }),
      });
      expect(putRes.status).toBe(200);
      const updated = (await putRes.json()) as Record<string, unknown>;
      expect(updated["name"]).toBe("Plinth Enterprise");
      expect(updated["primaryColorHex"]).toBe("#3b82f6");

      // 3. Verify persistence
      const getRes2 = await fetch(`${baseUrl}/api/v1/brand`);
      expect(getRes2.status).toBe(200);
      const persisted = (await getRes2.json()) as Record<string, unknown>;
      expect(persisted["name"]).toBe("Plinth Enterprise");
      expect(persisted["primaryColorHex"]).toBe("#3b82f6");
    });

    it("should query default tenant and create new tenant via Reference API", async () => {
      // 1. Get default tenant
      const getDef = await fetch(`${baseUrl}/api/v1/tenants/default`);
      expect(getDef.status).toBe(200);
      const defJson = (await getDef.json()) as Record<string, unknown>;
      expect(defJson["slug"]).toBe("default");
      expect(defJson["plan"]).toBe("enterprise");

      // 2. Create new tenant
      const createRes = await fetch(`${baseUrl}/api/v1/tenants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: "ref-tenant-1",
          name: "Reference Tenant 1",
          plan: "pro",
        }),
      });
      expect(createRes.status).toBe(201);
      const created = (await createRes.json()) as Record<string, unknown>;
      expect(created["slug"]).toBe("ref-tenant-1");
      expect(created["plan"]).toBe("pro");
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should return RFC 9457 400 on malformed JSON payload", async () => {
      const res = await fetch(`${baseUrl}/api/v1/brand`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{ bad json, ",
      });

      expect(res.status).toBe(400);
      expect(res.headers.get("content-type")).toContain("application/problem+json");

      const problem = (await res.json()) as Record<string, unknown>;
      expect(problem["status"]).toBe(400);
      expect(problem["code"]).toBe("BAD_REQUEST");
    });

    it("should return RFC 9457 422 on invalid hex color format", async () => {
      const res = await fetch(`${baseUrl}/api/v1/brand`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryColorHex: "invalid-color",
        }),
      });

      expect(res.status).toBe(422);
      expect(res.headers.get("content-type")).toContain("application/problem+json");

      const problem = (await res.json()) as Record<string, unknown>;
      expect(problem["status"]).toBe(422);
      expect(problem["code"]).toBe("VALIDATION_ERROR");
      expect(problem["errors"]).toBeDefined();
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should serve 10 concurrent requests to /api/v1/brand without error", async () => {
      const requests = Array.from({ length: 10 }, () =>
        fetch(`${baseUrl}/api/v1/brand`).then((r) => r.json()),
      );

      const results = (await Promise.all(requests)) as Array<Record<string, unknown>>;
      expect(results).toHaveLength(10);
      expect(results[0]?.["name"]).toBeDefined();
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should return RFC 9457 503 if database readiness check fails", async () => {
      // Boot an app whose DB is intentionally closed
      const failingApp = await buildApp({
        isProduction: true,
        sqliteFilename: ":memory:",
        port: 0,
        host: "127.0.0.1",
      });

      const { port } = await failingApp.start();
      await failingApp.db.close(); // Close DB to simulate downtime

      const res = await fetch(`http://127.0.0.1:${port}/health/ready`);
      expect(res.status).toBe(503);
      expect(res.headers.get("content-type")).toContain("application/problem+json");

      const problem = (await res.json()) as Record<string, unknown>;
      expect(problem["status"]).toBe(503);
      expect(problem["code"]).toBe("SERVICE_UNAVAILABLE");
      expect(problem["stack"]).toBeUndefined();

      await failingApp.close();
    });

    it("should return RFC 9457 503 from /health/ready if server is actively shutting down", async () => {
      const shutdownApp = await buildApp({
        isProduction: true,
        sqliteFilename: ":memory:",
        port: 0,
        host: "127.0.0.1",
      });

      const { port } = await shutdownApp.start();
      let resolveDrain!: () => void;
      const drainPromise = new Promise<void>((resolve) => {
        resolveDrain = resolve;
      });
      shutdownApp.lifecycle.onShutdown("drain-work", async () => {
        await drainPromise;
      });

      const shutdownPromise = shutdownApp.lifecycle.triggerShutdown();

      const res = await fetch(`http://127.0.0.1:${port}/health/ready`);
      expect(res.status).toBe(503);
      const problem = (await res.json()) as Record<string, unknown>;
      expect(problem["status"]).toBe(503);
      expect(problem["detail"]).toBe("Server is shutting down");

      resolveDrain();
      await shutdownPromise;
      await shutdownApp.close();
    });
  });

  // Category 5: Security & Abuse Cases
  describe("Category 5: Security & Abuse Cases", () => {
    it("should reject unknown extra fields in PUT /api/v1/brand to prevent mass-assignment", async () => {
      const res = await fetch(`${baseUrl}/api/v1/brand`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Valid",
          isAdminHacked: true,
        }),
      });

      expect(res.status).toBe(422);
    });

    it("should reject request body exceeding 1MB payload bound", async () => {
      const hugeName = "A".repeat(1.5 * 1024 * 1024);
      const res = await fetch(`${baseUrl}/api/v1/brand`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: hugeName }),
      });

      expect([400, 413]).toContain(res.status);
    });

    it("should replay responses on duplicate Idempotency-Key on Reference API", async () => {
      const idemKey = "ref_idem_test_key";
      const payload = {
        slug: "idem-tenant",
        name: "Idem Tenant",
      };

      const res1 = await fetch(`${baseUrl}/api/v1/tenants`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": idemKey,
        },
        body: JSON.stringify(payload),
      });

      expect(res1.status).toBe(201);
      expect(res1.headers.get("idempotency-replayed")).toBeNull();

      const res2 = await fetch(`${baseUrl}/api/v1/tenants`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": idemKey,
        },
        body: JSON.stringify(payload),
      });

      expect(res2.status).toBe(201);
      expect(res2.headers.get("idempotency-replayed")).toBe("true");
    });
  });
});
