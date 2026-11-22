import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("Reference API: Billing HTTP Endpoints & OpenAPI Documentation", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const tenantHeaders = {
    "x-tenant-id": "tenant_bill_e2e",
    "x-user-id": "user_bill_admin",
  };

  beforeAll(async () => {
    app = await buildApp({
      isProduction: false,
      tenantMode: "multi",
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /openapi.json documents Billing endpoints in OpenAPI 3.1 specification", async () => {
    const fastify = app.server.getUnderlyingApp() as {
      inject: (options: { method: string; url: string }) => Promise<{
        statusCode: number;
        body: string;
      }>;
    };

    const res = await fastify.inject({
      method: "GET",
      url: "/openapi.json",
    });

    expect(res.statusCode).toBe(200);
    const spec = JSON.parse(res.body);
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.paths["/api/v1/billing/checkout"]).toBeDefined();
    expect(spec.paths["/api/v1/billing/subscription"]).toBeDefined();
    expect(spec.paths["/api/v1/billing/invoices"]).toBeDefined();
    expect(spec.paths["/api/v1/billing/entitlements"]).toBeDefined();
    expect(spec.paths["/api/v1/billing/webhook/{provider}"]).toBeDefined();
  });

  it("creates checkout session, verifies webhook HMAC, and retrieves entitlements", async () => {
    const fastify = app.server.getUnderlyingApp() as {
      inject: (options: {
        method: string;
        url: string;
        headers?: Record<string, string>;
        payload?: unknown;
      }) => Promise<{
        statusCode: number;
        body: string;
      }>;
    };

    // 1. Create checkout session
    const checkoutRes = await fastify.inject({
      method: "POST",
      url: "/api/v1/billing/checkout",
      headers: {
        ...tenantHeaders,
        "content-type": "application/json",
      },
      payload: {
        planId: "plan_pro",
        customerEmail: "owner@bill-e2e.com",
        customerName: "E2E Owner",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      },
    });

    expect(checkoutRes.statusCode).toBe(200);
    const checkoutBody = JSON.parse(checkoutRes.body);
    expect(checkoutBody.checkoutUrl).toBeDefined();
    expect(checkoutBody.sessionId).toBeDefined();

    // 2. Simulate signed webhook delivery for subscription created
    const webhookEvent = {
      id: "evt_e2e_sub_activated",
      provider: "stub" as const,
      eventType: "subscription.created" as const,
      timestamp: new Date(),
      data: {
        subscription: {
          id: "sub_e2e_pro_1",
          planId: "plan_pro",
          status: "active" as const,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 86400 * 1000),
          cancelAtPeriodEnd: false,
        },
      },
      rawPayload: {
        event: "subscription.created",
        id: "evt_e2e_sub_activated",
        metadata: {
          tenantId: "tenant_bill_e2e",
          planId: "plan_pro",
        },
        data: {
          subscription: {
            id: "sub_e2e_pro_1",
            planId: "plan_pro",
            status: "active",
          },
        },
      },
    };

    const simulated = app.stubBillingAdapter.simulateWebhook(
      webhookEvent,
      "whsec_reference_api_webhook_secret_32",
    );

    const signature = simulated.headers["x-stub-signature"] ?? "";

    const webhookRes = await fastify.inject({
      method: "POST",
      url: "/api/v1/billing/webhook/stub",
      headers: {
        "content-type": "application/json",
        "x-stub-signature": signature,
      },
      payload: JSON.parse(simulated.rawBody.toString("utf8")),
    });

    expect(webhookRes.statusCode).toBe(200);
    const webhookResult = JSON.parse(webhookRes.body);
    expect(webhookResult.processed).toBe(true);
    expect(webhookResult.duplicate).toBeUndefined();

    // 3. Re-delivery of identical webhook is deduplicated
    const duplicateRes = await fastify.inject({
      method: "POST",
      url: "/api/v1/billing/webhook/stub",
      headers: {
        "content-type": "application/json",
        "x-stub-signature": signature,
      },
      payload: JSON.parse(simulated.rawBody.toString("utf8")),
    });

    expect(duplicateRes.statusCode).toBe(200);
    const duplicateResult = JSON.parse(duplicateRes.body);
    expect(duplicateResult.processed).toBe(false);
    expect(duplicateResult.duplicate).toBe(true);

    // 4. Check active subscription
    const subRes = await fastify.inject({
      method: "GET",
      url: "/api/v1/billing/subscription",
      headers: tenantHeaders,
    });

    expect(subRes.statusCode).toBe(200);
    const subBody = JSON.parse(subRes.body);
    expect(subBody.subscription).not.toBeNull();
    expect(subBody.subscription.status).toBe("active");
    expect(subBody.subscription.planId).toBe("plan_pro");

    // 5. Check unlocked entitlements
    const entRes = await fastify.inject({
      method: "GET",
      url: "/api/v1/billing/entitlements",
      headers: tenantHeaders,
    });

    expect(entRes.statusCode).toBe(200);
    const entBody = JSON.parse(entRes.body);
    expect(entBody.entitlements["maxUsers"]).toBe(100);
    expect(entBody.entitlements["advancedAudit"]).toBe(true);

    // 6. Cancel subscription
    const cancelRes = await fastify.inject({
      method: "POST",
      url: "/api/v1/billing/subscription/cancel",
      headers: {
        ...tenantHeaders,
        "content-type": "application/json",
      },
      payload: {
        cancelImmediately: true,
      },
    });

    expect(cancelRes.statusCode).toBe(200);
    const cancelBody = JSON.parse(cancelRes.body);
    expect(cancelBody.subscription.status).toBe("canceled");
  });
});
