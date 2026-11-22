import { ExpressHttpAdapter } from "@plinth/adapter-http-express";
import {
  AppError,
  defineRoute,
  ForbiddenError,
  getTenantContext,
  InMemoryIdempotencyManager,
  InMemoryRateLimiter,
} from "@plinth/core";
import { describe, expect, it } from "vitest";

describe("ExpressHttpAdapter Unit Tests", () => {
  it("should expose underlying express instance via getUnderlyingApp", () => {
    const adapter = new ExpressHttpAdapter();
    const app = adapter.getUnderlyingApp();
    expect(app).toBeDefined();
    expect(typeof app.use).toBe("function");
    expect(typeof app.listen).toBe("function");
  });

  it("should support disabling security headers via options", async () => {
    const adapter = new ExpressHttpAdapter({ securityHeaders: false });
    const route = defineRoute({
      method: "GET",
      path: "/test-no-headers",
      summary: "No sec headers",
    });
    adapter.registerRoute(route, async () => ({ statusCode: 200, body: { ok: true } }));

    const { port } = await adapter.listen(0, "127.0.0.1");
    try {
      const res = await fetch(`http://127.0.0.1:${port}/test-no-headers`);
      expect(res.status).toBe(200);
      expect(res.headers.has("content-security-policy")).toBe(false);
    } finally {
      await adapter.close();
    }
  });

  it("should support object-based securityHeaders option and single-tenant mode", async () => {
    const adapter = new ExpressHttpAdapter({
      securityHeaders: { isProduction: false },
      tenantResolver: { mode: "single" },
    });

    const route = defineRoute({
      method: "GET",
      path: "/test-single-tenant",
      summary: "Single tenant mode check",
    });

    adapter.registerRoute(route, async () => {
      const ctx = getTenantContext();
      return {
        statusCode: 200,
        body: { tenantId: ctx?.tenantId, isDefault: ctx?.isDefault },
      };
    });

    const { port } = await adapter.listen(0, "127.0.0.1");
    try {
      const res = await fetch(`http://127.0.0.1:${port}/test-single-tenant`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { tenantId: string; isDefault: boolean };
      expect(data.tenantId).toBe("default_tenant");
      expect(data.isDefault).toBe(true);
    } finally {
      await adapter.close();
    }
  });

  it("should resolve multi-tenant context from header and support custom response headers", async () => {
    const adapter = new ExpressHttpAdapter({
      tenantResolver: { strategy: "header", headerName: "x-org-id" },
    });

    const route = defineRoute({
      method: "GET",
      path: "/test-multi-tenant",
      summary: "Multi tenant check",
    });

    adapter.registerRoute(route, async () => {
      const ctx = getTenantContext();
      return {
        statusCode: 200,
        headers: { "x-custom-res": "plinth-custom" },
        body: { tenantId: ctx?.tenantId ?? null },
      };
    });

    const { port } = await adapter.listen(0, "127.0.0.1");
    try {
      // With tenant header
      const res1 = await fetch(`http://127.0.0.1:${port}/test-multi-tenant`, {
        headers: { "x-org-id": "org_tenant_1" },
      });
      expect(res1.status).toBe(200);
      expect(res1.headers.get("x-custom-res")).toBe("plinth-custom");
      const data1 = (await res1.json()) as { tenantId: string };
      expect(data1.tenantId).toBe("org_tenant_1");

      // Without tenant header
      const res2 = await fetch(`http://127.0.0.1:${port}/test-multi-tenant`);
      expect(res2.status).toBe(200);
      const data2 = (await res2.json()) as { tenantId: string | null };
      expect(data2.tenantId).toBeNull();
    } finally {
      await adapter.close();
    }
  });

  it("should handle AppError and non-AppError exceptions in error middleware", async () => {
    const adapter = new ExpressHttpAdapter();

    const appErrorRoute = defineRoute({
      method: "GET",
      path: "/test-app-error",
      summary: "App error check",
    });
    adapter.registerRoute(appErrorRoute, async () => {
      throw new ForbiddenError("Forbidden route access");
    });

    const nonAppErrorRoute = defineRoute({
      method: "GET",
      path: "/test-client-error-object",
      summary: "Client error object check",
    });
    adapter.registerRoute(nonAppErrorRoute, async () => {
      const customErr = {
        statusCode: 403,
        message: "Custom client forbidden",
        code: "CUSTOM_FORBIDDEN",
      };
      throw customErr;
    });

    const standardErrorRoute = defineRoute({
      method: "GET",
      path: "/test-standard-error",
      summary: "Standard 500 error",
    });
    adapter.registerRoute(standardErrorRoute, async () => {
      throw new Error("Unhandled unexpected crash");
    });

    const { port } = await adapter.listen(0, "127.0.0.1");
    try {
      const res1 = await fetch(`http://127.0.0.1:${port}/test-app-error`);
      expect(res1.status).toBe(403);
      const data1 = (await res1.json()) as { title: string; detail: string };
      expect(data1.detail).toBe("Forbidden route access");

      const res2 = await fetch(`http://127.0.0.1:${port}/test-client-error-object`);
      expect(res2.status).toBe(403);
      const data2 = (await res2.json()) as { title: string; detail: string; code: string };
      expect(data2.detail).toBe("Custom client forbidden");
      expect(data2.code).toBe("CUSTOM_FORBIDDEN");

      const res3 = await fetch(`http://127.0.0.1:${port}/test-standard-error`);
      expect(res3.status).toBe(500);
    } finally {
      await adapter.close();
    }
  });

  it("should handle idempotency manager conflict, replayed, and cancel states", async () => {
    const manager = new InMemoryIdempotencyManager();

    const adapter = new ExpressHttpAdapter({
      idempotencyManager: manager,
    });

    let executionCount = 0;
    const mutateRoute = defineRoute({
      method: "POST",
      path: "/test-idem-mutate",
      summary: "Mutating route with idempotency",
    });

    adapter.registerRoute(mutateRoute, async (req) => {
      executionCount++;
      const body = req.body as { shouldFail?: boolean; value?: string };
      if (body?.shouldFail) {
        throw new AppError(400, "Mutate failed intentionally");
      }
      return {
        statusCode: 201,
        headers: { "x-idem-done": "true" },
        body: { result: body?.value ?? "ok", count: executionCount },
      };
    });

    const { port } = await adapter.listen(0, "127.0.0.1");
    try {
      const key1 = "idem_key_test_1";

      // 1. Initial success
      const res1 = await fetch(`http://127.0.0.1:${port}/test-idem-mutate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": key1,
        },
        body: JSON.stringify({ value: "first_run" }),
      });
      expect(res1.status).toBe(201);
      expect(res1.headers.get("x-idem-done")).toBe("true");
      const data1 = (await res1.json()) as { count: number; result: string };
      expect(data1.count).toBe(1);

      // 2. Replay with same key & payload
      const res2 = await fetch(`http://127.0.0.1:${port}/test-idem-mutate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": key1,
        },
        body: JSON.stringify({ value: "first_run" }),
      });
      expect(res2.status).toBe(201);
      expect(res2.headers.get("idempotency-replayed")).toBe("true");
      expect(res2.headers.get("x-idem-done")).toBe("true");
      const data2 = (await res2.json()) as { count: number };
      expect(data2.count).toBe(1); // Not executed again!

      // 3. Conflict: same key with different payload
      const res3 = await fetch(`http://127.0.0.1:${port}/test-idem-mutate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": key1,
        },
        body: JSON.stringify({ value: "different_payload" }),
      });
      expect(res3.status).toBe(409);
      const data3 = (await res3.json()) as { code: string };
      expect(data3.code).toBe("IDEMPOTENCY_CONFLICT");

      // 4. Cancel on error
      const key2 = "idem_key_fail_test";
      const resFail = await fetch(`http://127.0.0.1:${port}/test-idem-mutate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": key2,
        },
        body: JSON.stringify({ shouldFail: true }),
      });
      expect(resFail.status).toBe(400);

      // Verify the key was canceled and can be retried successfully
      const resRetry = await fetch(`http://127.0.0.1:${port}/test-idem-mutate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": key2,
        },
        body: JSON.stringify({ shouldFail: false, value: "retried_success" }),
      });
      expect(resRetry.status).toBe(201);
    } finally {
      await adapter.close();
    }
  });

  it("should enforce rate limiting middleware when configured", async () => {
    const adapter = new ExpressHttpAdapter({
      rateLimiter: new InMemoryRateLimiter({
        maxRequests: 2,
        windowMs: 5000,
      }),
    });

    const route = defineRoute({
      method: "GET",
      path: "/test-rate-limit",
      summary: "Rate limit test",
    });
    adapter.registerRoute(route, async () => ({ statusCode: 200, body: { ok: true } }));

    const { port } = await adapter.listen(0, "127.0.0.1");
    try {
      const res1 = await fetch(`http://127.0.0.1:${port}/test-rate-limit`);
      expect(res1.status).toBe(200);

      const res2 = await fetch(`http://127.0.0.1:${port}/test-rate-limit`);
      expect(res2.status).toBe(200);

      const res3 = await fetch(`http://127.0.0.1:${port}/test-rate-limit`);
      expect(res3.status).toBe(429);
      const data3 = (await res3.json()) as { title: string; detail: string };
      expect(data3.title).toBe("Too Many Requests");
    } finally {
      await adapter.close();
    }
  });

  it("should allow safe double-close without error", async () => {
    const adapter = new ExpressHttpAdapter();
    const { port } = await adapter.listen(0, "127.0.0.1");
    expect(port).toBeGreaterThan(0);
    await adapter.close();
    await expect(adapter.close()).resolves.toBeUndefined();
  });
});
