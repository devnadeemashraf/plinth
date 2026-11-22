import { createHmac } from "node:crypto";
import {
  ConflictError,
  defineRoute,
  getTenantContext,
  type HttpRequest,
  type HttpResponse,
  type HttpServerPort,
  InMemoryIdempotencyManager,
  InMemoryRateLimiter,
  type TenantResolverOptions,
} from "@plinth/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";

export interface HttpAdapterOptions {
  readonly isProduction?: boolean | undefined;
  readonly openApiInfo?: { title: string; version: string } | undefined;
  readonly corsOrigins?: string[] | boolean | undefined;
  readonly securityHeaders?: boolean | undefined;
  readonly rateLimiter?: InMemoryRateLimiter | undefined;
  readonly idempotencyManager?: InMemoryIdempotencyManager | undefined;
  readonly tenantResolver?: TenantResolverOptions | undefined;
}

export interface HttpContractSuiteOptions {
  readonly adapterName: string;
  readonly createServer: (options?: HttpAdapterOptions) => Promise<HttpServerPort> | HttpServerPort;
}

interface ProblemJson {
  status: number;
  title?: string;
  code?: string;
  detail?: string;
  errors?: unknown[];
  stack?: unknown;
}

async function jsonOf<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export function runHttpContractTests(suiteOptions: HttpContractSuiteOptions): void {
  const { adapterName, createServer } = suiteOptions;

  describe(`${adapterName} - HTTP Adapter Contract Tests`, () => {
    // 1. Basic CRUD and Dispatch
    describe("1. Route Dispatch & Parameters", () => {
      it("should register and handle GET, POST, PUT, DELETE routes", async () => {
        const server = await createServer({ isProduction: true });

        const pingRoute = defineRoute({
          method: "GET",
          path: "/api/v1/ping",
          summary: "Ping endpoint",
          responseSchemas: {
            200: z.object({ message: z.string() }),
          },
        });

        const echoRoute = defineRoute({
          method: "POST",
          path: "/api/v1/echo",
          summary: "Echo endpoint",
          bodySchema: z.strictObject({
            message: z.string(),
          }),
          responseSchemas: {
            201: z.object({ received: z.string() }),
          },
        });

        const paramRoute = defineRoute({
          method: "PUT",
          path: "/api/v1/items/:id",
          summary: "Update item",
          paramsSchema: z.object({
            id: z.string(),
          }),
          bodySchema: z.strictObject({
            name: z.string(),
          }),
        });

        const deleteRoute = defineRoute({
          method: "DELETE",
          path: "/api/v1/items/:id",
          summary: "Delete item",
        });

        server.registerRoute(pingRoute, async () => ({
          statusCode: 200,
          headers: { "x-custom-res": "ping-pong" },
          body: { message: "pong" },
        }));

        server.registerRoute(echoRoute, async (req) => {
          const body = req.body as { message: string };
          return {
            statusCode: 201,
            body: { received: body.message },
          };
        });

        server.registerRoute(paramRoute, async (req) => {
          const body = req.body as { name: string };
          return {
            statusCode: 200,
            body: { id: req.params["id"], name: body.name },
          };
        });

        server.registerRoute(deleteRoute, async (req) => ({
          statusCode: 200,
          body: { deleted: req.params["id"] },
        }));

        const { port } = await server.listen(0, "127.0.0.1");
        const baseUrl = `http://127.0.0.1:${port}`;

        try {
          // GET
          const getRes = await fetch(`${baseUrl}/api/v1/ping`);
          expect(getRes.status).toBe(200);
          expect(getRes.headers.get("x-custom-res")).toBe("ping-pong");
          const getJson = await jsonOf(getRes);
          expect(getJson).toEqual({ message: "pong" });

          // POST
          const postRes = await fetch(`${baseUrl}/api/v1/echo`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "hello" }),
          });
          expect(postRes.status).toBe(201);
          const postJson = await jsonOf(postRes);
          expect(postJson).toEqual({ received: "hello" });

          // PUT with params
          const putRes = await fetch(`${baseUrl}/api/v1/items/42`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Widget" }),
          });
          expect(putRes.status).toBe(200);
          const putJson = await jsonOf(putRes);
          expect(putJson).toEqual({ id: "42", name: "Widget" });

          // DELETE
          const delRes = await fetch(`${baseUrl}/api/v1/items/99`, {
            method: "DELETE",
          });
          expect(delRes.status).toBe(200);
          const delJson = await jsonOf(delRes);
          expect(delJson).toEqual({ deleted: "99" });
        } finally {
          await server.close();
        }
      });

      it("should correctly parse and pass query parameters", async () => {
        const server = await createServer({ isProduction: true });

        const searchRoute = defineRoute({
          method: "GET",
          path: "/api/v1/search",
          summary: "Search items",
          querySchema: z.object({
            q: z.string(),
            limit: z.string().optional(),
          }),
        });

        server.registerRoute(searchRoute, async (req) => ({
          statusCode: 200,
          body: { query: req.query["q"], limit: req.query["limit"] ?? "10" },
        }));

        const { port } = await server.listen(0, "127.0.0.1");
        const baseUrl = `http://127.0.0.1:${port}`;

        try {
          const res = await fetch(`${baseUrl}/api/v1/search?q=plinth&limit=25`);
          expect(res.status).toBe(200);
          const json = await res.json();
          expect(json).toEqual({ query: "plinth", limit: "25" });
        } finally {
          await server.close();
        }
      });
    });

    // 2. Schema Validation & Input Boundary
    describe("2. Boundary Validation (Zod & RFC 9457)", () => {
      it("should reject invalid body with 422 Problem Details", async () => {
        const server = await createServer({ isProduction: true });

        const strictRoute = defineRoute({
          method: "POST",
          path: "/api/v1/users",
          summary: "Create user",
          bodySchema: z.strictObject({
            email: z.string().email(),
            age: z.number().int().min(18),
          }),
        });

        server.registerRoute(strictRoute, async (req) => ({
          statusCode: 201,
          body: req.body,
        }));

        const { port } = await server.listen(0, "127.0.0.1");
        const baseUrl = `http://127.0.0.1:${port}`;

        try {
          const res = await fetch(`${baseUrl}/api/v1/users`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: "not-an-email", age: 16 }),
          });

          expect(res.status).toBe(422);
          expect(res.headers.get("content-type")).toContain("application/problem+json");
          const problem = await jsonOf<ProblemJson>(res);
          expect(problem.status).toBe(422);
          expect(problem.code).toBe("VALIDATION_ERROR");
          expect(Array.isArray(problem.errors)).toBe(true);
          expect(problem.errors?.length).toBeGreaterThanOrEqual(2);
        } finally {
          await server.close();
        }
      });

      it("should reject unknown extra properties when schema is strict", async () => {
        const server = await createServer({ isProduction: true });

        const strictRoute = defineRoute({
          method: "POST",
          path: "/api/v1/strict",
          summary: "Strict input",
          bodySchema: z.strictObject({
            allowed: z.string(),
          }),
        });

        server.registerRoute(strictRoute, async (req) => ({
          statusCode: 200,
          body: req.body,
        }));

        const { port } = await server.listen(0, "127.0.0.1");
        const baseUrl = `http://127.0.0.1:${port}`;

        try {
          const res = await fetch(`${baseUrl}/api/v1/strict`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ allowed: "yes", maliciousField: "attack" }),
          });

          expect(res.status).toBe(422);
          const problem = await jsonOf<ProblemJson>(res);
          expect(problem.code).toBe("VALIDATION_ERROR");
        } finally {
          await server.close();
        }
      });
    });

    // 3. Raw Body Preservation for Webhooks
    describe("3. Raw Body Preservation for Webhooks", () => {
      it("should preserve exact rawBody Buffer for cryptographic HMAC verification", async () => {
        const server = await createServer({ isProduction: true });
        const webhookSecret = "whsec_test_secret_1234567890abcdef";

        const webhookRoute = defineRoute({
          method: "POST",
          path: "/api/v1/webhook",
          summary: "Webhook endpoint",
        });

        server.registerRoute(webhookRoute, async (req: HttpRequest): Promise<HttpResponse> => {
          const raw = req.rawBody;
          if (!raw || !Buffer.isBuffer(raw)) {
            return {
              statusCode: 400,
              body: { error: "Missing or invalid rawBody buffer" },
            };
          }

          const signature = (req.headers["x-signature"] ?? "") as string;
          const expectedSig = createHmac("sha256", webhookSecret).update(raw).digest("hex");

          if (signature !== expectedSig) {
            return {
              statusCode: 401,
              body: { error: "Invalid signature" },
            };
          }

          return {
            statusCode: 200,
            body: {
              verified: true,
              byteLength: raw.length,
              payload: req.body,
            },
          };
        });

        const { port } = await server.listen(0, "127.0.0.1");
        const baseUrl = `http://127.0.0.1:${port}`;

        try {
          const payload = JSON.stringify({
            event: "payment.succeeded",
            amount: 9900,
            currency: "usd",
            timestamp: 1700000000,
          });

          const validSig = createHmac("sha256", webhookSecret)
            .update(Buffer.from(payload, "utf-8"))
            .digest("hex");

          // 1. Valid Signature
          const validRes = await fetch(`${baseUrl}/api/v1/webhook`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-signature": validSig,
            },
            body: payload,
          });

          expect(validRes.status).toBe(200);
          const validJson = await jsonOf<{ verified: boolean; byteLength: number }>(validRes);
          expect(validJson.verified).toBe(true);
          expect(validJson.byteLength).toBe(Buffer.byteLength(payload, "utf-8"));

          // 2. Invalid Signature
          const invalidRes = await fetch(`${baseUrl}/api/v1/webhook`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-signature": "bad_sig_12345",
            },
            body: payload,
          });

          expect(invalidRes.status).toBe(401);
        } finally {
          await server.close();
        }
      });
    });

    // 4. Uniform RFC 9457 Problem Details
    describe("4. Uniform RFC 9457 Problem Details", () => {
      it("should return 404 Problem Details for unknown routes", async () => {
        const server = await createServer({ isProduction: true });
        const { port } = await server.listen(0, "127.0.0.1");
        const baseUrl = `http://127.0.0.1:${port}`;

        try {
          const res = await fetch(`${baseUrl}/api/v1/does-not-exist`);
          expect(res.status).toBe(404);
          expect(res.headers.get("content-type")).toContain("application/problem+json");
          const problem = await jsonOf<ProblemJson>(res);
          expect(problem.status).toBe(404);
          expect(problem.title).toBe("Not Found");
        } finally {
          await server.close();
        }
      });

      it("should return 400 Problem Details for malformed JSON", async () => {
        const server = await createServer({ isProduction: true });

        const dummyRoute = defineRoute({
          method: "POST",
          path: "/api/v1/dummy",
          summary: "Dummy",
        });
        server.registerRoute(dummyRoute, async () => ({ statusCode: 200, body: {} }));

        const { port } = await server.listen(0, "127.0.0.1");
        const baseUrl = `http://127.0.0.1:${port}`;

        try {
          const res = await fetch(`${baseUrl}/api/v1/dummy`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{ broken json: 123",
          });

          expect(res.status).toBe(400);
          expect(res.headers.get("content-type")).toContain("application/problem+json");
          const problem = await jsonOf<ProblemJson>(res);
          expect(problem.status).toBe(400);
        } finally {
          await server.close();
        }
      });

      it("should return 413 Problem Details for payloads exceeding 1MB bodyLimit", async () => {
        const server = await createServer({ isProduction: true });

        const uploadRoute = defineRoute({
          method: "POST",
          path: "/api/v1/upload",
          summary: "Upload",
        });
        server.registerRoute(uploadRoute, async () => ({ statusCode: 200, body: {} }));

        const { port } = await server.listen(0, "127.0.0.1");
        const baseUrl = `http://127.0.0.1:${port}`;

        try {
          const hugePayload = JSON.stringify({ data: "a".repeat(1024 * 1024 + 100) });
          const byteLength = Buffer.byteLength(hugePayload, "utf-8").toString();
          try {
            const res = await fetch(`${baseUrl}/api/v1/upload`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "content-length": byteLength,
              },
              body: hugePayload,
            });

            expect(res.status).toBe(413);
            expect(res.headers.get("content-type")).toContain("application/problem+json");
          } catch (fetchErr: unknown) {
            // Under high concurrency, server closes socket immediately upon 413, triggering ECONNRESET on client
            const errMsg = String(fetchErr);
            const isConnReset = errMsg.includes("ECONNRESET") || errMsg.includes("fetch failed");
            expect(isConnReset).toBe(true);
          }
        } finally {
          await server.close();
        }
      });

      it("should serialize thrown AppError subclasses to matching Problem Details", async () => {
        const server = await createServer({ isProduction: true });

        const conflictRoute = defineRoute({
          method: "POST",
          path: "/api/v1/conflict",
          summary: "Trigger Conflict",
        });

        server.registerRoute(conflictRoute, async () => {
          throw new ConflictError("Resource already claimed", { code: "EMAIL_TAKEN" });
        });

        const { port } = await server.listen(0, "127.0.0.1");
        const baseUrl = `http://127.0.0.1:${port}`;

        try {
          const res = await fetch(`${baseUrl}/api/v1/conflict`, { method: "POST" });
          expect(res.status).toBe(409);
          const problem = await jsonOf<ProblemJson>(res);
          expect(problem.status).toBe(409);
          expect(problem.title).toBe("Conflict");
          expect(problem.code).toBe("EMAIL_TAKEN");
          expect(problem.detail).toBe("Resource already claimed");
        } finally {
          await server.close();
        }
      });

      it("should serialize unhandled Error to 500 without leaking stack traces in production", async () => {
        const server = await createServer({ isProduction: true });

        const crashRoute = defineRoute({
          method: "GET",
          path: "/api/v1/crash",
          summary: "Crash route",
        });

        server.registerRoute(crashRoute, async () => {
          throw new Error(
            "Secret database password leak: postgres://admin:secret123@internal:5432/db",
          );
        });

        const { port } = await server.listen(0, "127.0.0.1");
        const baseUrl = `http://127.0.0.1:${port}`;

        try {
          const res = await fetch(`${baseUrl}/api/v1/crash`);
          expect(res.status).toBe(500);
          const problem = await jsonOf<ProblemJson>(res);
          expect(problem.status).toBe(500);
          expect(problem.stack).toBeUndefined();
          expect(JSON.stringify(problem)).not.toContain("secret123");
        } finally {
          await server.close();
        }
      });
    });

    // 5. Security Headers
    describe("5. Security Headers", () => {
      it("should apply production security headers (CSP, nosniff, x-frame-options)", async () => {
        const server = await createServer({ isProduction: true });

        const testRoute = defineRoute({
          method: "GET",
          path: "/api/v1/secure",
          summary: "Secure route",
        });
        server.registerRoute(testRoute, async () => ({ statusCode: 200, body: { ok: true } }));

        const { port } = await server.listen(0, "127.0.0.1");
        const baseUrl = `http://127.0.0.1:${port}`;

        try {
          const res = await fetch(`${baseUrl}/api/v1/secure`);
          expect(res.status).toBe(200);
          expect(res.headers.get("x-content-type-options")).toBe("nosniff");
          expect(res.headers.get("x-frame-options")).toBe("DENY");
          expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
        } finally {
          await server.close();
        }
      });
    });

    // 6. Sliding-Window Rate Limiting
    describe("6. Rate Limiting Integration", () => {
      it("should apply rate limit headers and block excessive requests with 429", async () => {
        const limiter = new InMemoryRateLimiter({
          windowMs: 60000,
          maxRequests: 3,
        });

        const server = await createServer({
          isProduction: true,
          rateLimiter: limiter,
        });

        const rateRoute = defineRoute({
          method: "GET",
          path: "/api/v1/limited",
          summary: "Limited route",
        });
        server.registerRoute(rateRoute, async () => ({ statusCode: 200, body: { ok: true } }));

        const { port } = await server.listen(0, "127.0.0.1");
        const baseUrl = `http://127.0.0.1:${port}`;

        try {
          // Requests 1-3 should succeed
          for (let i = 0; i < 3; i++) {
            const res = await fetch(`${baseUrl}/api/v1/limited`);
            expect(res.status).toBe(200);
            expect(res.headers.get("ratelimit-limit")).toBe("3");
            expect(res.headers.has("ratelimit-remaining")).toBe(true);
          }

          // Request 4 should be 429
          const blockedRes = await fetch(`${baseUrl}/api/v1/limited`);
          expect(blockedRes.status).toBe(429);
          expect(blockedRes.headers.has("retry-after")).toBe(true);
          const problem = await jsonOf<ProblemJson>(blockedRes);
          expect(problem.status).toBe(429);
        } finally {
          await server.close();
        }
      });
    });

    // 7. Multi-Tenancy Isolation
    describe("7. Multi-Tenancy Resolution", () => {
      it("should resolve tenant context from X-Tenant-ID header and populate ambient context", async () => {
        const server = await createServer({
          isProduction: true,
          tenantResolver: {
            mode: "multi",
            strategy: "header",
            headerName: "x-tenant-id",
          },
        });

        const tenantRoute = defineRoute({
          method: "GET",
          path: "/api/v1/tenant-check",
          summary: "Tenant check",
        });

        server.registerRoute(tenantRoute, async () => {
          const tenant = getTenantContext();
          return {
            statusCode: 200,
            body: {
              tenantId: tenant?.tenantId,
              isDefault: tenant?.isDefault,
            },
          };
        });

        const { port } = await server.listen(0, "127.0.0.1");
        const baseUrl = `http://127.0.0.1:${port}`;

        try {
          const res = await fetch(`${baseUrl}/api/v1/tenant-check`, {
            headers: { "x-tenant-id": "tenant-corp-99" },
          });

          expect(res.status).toBe(200);
          const json = await jsonOf<{ tenantId?: string; isDefault?: boolean }>(res);
          expect(json.tenantId).toBe("tenant-corp-99");
          expect(json.isDefault).toBe(false);
        } finally {
          await server.close();
        }
      });
    });

    // 8. Idempotency Management
    describe("8. Idempotency Management", () => {
      it("should replay response on duplicate Idempotency-Key and reject conflict", async () => {
        const idempotency = new InMemoryIdempotencyManager({ ttlMs: 60000 });
        const server = await createServer({
          isProduction: true,
          idempotencyManager: idempotency,
        });

        let executions = 0;
        const mutateRoute = defineRoute({
          method: "POST",
          path: "/api/v1/orders",
          summary: "Create order",
          bodySchema: z.object({
            item: z.string(),
          }),
        });

        server.registerRoute(mutateRoute, async (req) => {
          executions++;
          const body = req.body as { item: string };
          return {
            statusCode: 201,
            body: { orderId: "ord-1", item: body.item, executionCount: executions },
          };
        });

        const { port } = await server.listen(0, "127.0.0.1");
        const baseUrl = `http://127.0.0.1:${port}`;

        try {
          const idemKey = "idem-test-key-001";

          // Request 1: Executed
          const res1 = await fetch(`${baseUrl}/api/v1/orders`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "idempotency-key": idemKey,
            },
            body: JSON.stringify({ item: "Book" }),
          });
          expect(res1.status).toBe(201);
          const json1 = await jsonOf<{ executionCount: number }>(res1);
          expect(json1.executionCount).toBe(1);

          // Request 2: Replayed (handler NOT executed again)
          const res2 = await fetch(`${baseUrl}/api/v1/orders`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "idempotency-key": idemKey,
            },
            body: JSON.stringify({ item: "Book" }),
          });
          expect(res2.status).toBe(201);
          expect(res2.headers.get("idempotency-replayed")).toBe("true");
          const json2 = await jsonOf<{ executionCount: number }>(res2);
          expect(json2.executionCount).toBe(1);

          // Request 3: Conflict (same key, different payload)
          const res3 = await fetch(`${baseUrl}/api/v1/orders`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "idempotency-key": idemKey,
            },
            body: JSON.stringify({ item: "Laptop" }),
          });
          expect(res3.status).toBe(409);
        } finally {
          await server.close();
        }
      });
    });

    // 9. OpenAPI & Scalar Documentation
    describe("9. OpenAPI & Scalar Documentation", () => {
      it("should serve OpenAPI 3.1 JSON and Scalar HTML UI", async () => {
        const server = await createServer({
          isProduction: true,
          openApiInfo: {
            title: "Contract Test API",
            version: "2.0.0",
          },
        });

        const infoRoute = defineRoute({
          method: "GET",
          path: "/api/v1/info",
          summary: "API Information",
        });
        server.registerRoute(infoRoute, async () => ({ statusCode: 200, body: {} }));

        const { port } = await server.listen(0, "127.0.0.1");
        const baseUrl = `http://127.0.0.1:${port}`;

        try {
          // 1. OpenAPI JSON
          const openApiRes = await fetch(`${baseUrl}/openapi.json`);
          expect(openApiRes.status).toBe(200);
          expect(openApiRes.headers.get("content-type")).toContain("application/json");
          const spec = await jsonOf<{
            openapi: string;
            info: { title: string };
            paths: Record<string, unknown>;
          }>(openApiRes);
          expect(spec.openapi).toBe("3.1.0");
          expect(spec.info.title).toBe("Contract Test API");
          expect(spec.paths["/api/v1/info"]).toBeDefined();

          // 2. Scalar Docs HTML
          const docsRes = await fetch(`${baseUrl}/docs`);
          expect(docsRes.status).toBe(200);
          expect(docsRes.headers.get("content-type")).toContain("text/html");
          const html = await docsRes.text();
          expect(html).toContain("Scalar API Reference");
          expect(html).toContain("api-reference");
        } finally {
          await server.close();
        }
      });
    });
  });
}
