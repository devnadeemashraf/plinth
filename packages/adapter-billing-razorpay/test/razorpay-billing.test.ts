import { RazorpayBillingAdapter } from "@plinth/adapter-billing-razorpay";
import { BadGatewayError, BadRequestError, createTenantId, Redacted } from "@plinth/core";
import { describe, expect, it } from "vitest";

describe("RazorpayBillingAdapter - Specific Features", () => {
  it("rejects missing keyId", () => {
    expect(
      () =>
        new RazorpayBillingAdapter({
          keyId: "",
          keySecret: "secret",
        }),
    ).toThrow(BadRequestError);
  });

  it("preserves GSTIN and HSN code in Razorpay order notes", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const mockFetch: typeof fetch = async (_input, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({ id: "order_test_123", amount: 50000, currency: "INR" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const adapter = new RazorpayBillingAdapter({
      keyId: "rzp_test_123",
      keySecret: new Redacted("rzp_sec_456"),
      fetchClient: mockFetch,
    });

    await adapter.createCheckoutSession({
      tenantId: createTenantId("tenant_gst_1"),
      mode: "payment",
      taxId: { type: "in_gst", value: "29ABCDE1234F1Z5" },
      lineItems: [
        {
          name: "SaaS Enterprise",
          amount: 50000,
          currency: "INR",
          quantity: 1,
          hsnCode: "998313",
          gstRatePercent: 18,
        },
      ],
      successUrl: "https://example.com/ok",
      cancelUrl: "https://example.com/fail",
    });

    expect(capturedBody).toBeDefined();
    const notes = capturedBody?.["notes"] as Record<string, string>;
    expect(notes["taxIdType"]).toBe("in_gst");
    expect(notes["taxIdValue"]).toBe("29ABCDE1234F1Z5");
    expect(notes["hsnCode"]).toBe("998313");
    expect(notes["gstRatePercent"]).toBe("18");
  });

  it("maps upstream API errors to BadGatewayError without leaking secrets", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({ error: { code: "BAD_REQUEST_ERROR", description: "Invalid amount" } }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    };

    const adapter = new RazorpayBillingAdapter({
      keyId: "rzp_test_123",
      keySecret: "rzp_sec_secret_key",
      fetchClient: mockFetch,
    });

    await expect(
      adapter.createCustomer({
        email: "fail@example.com",
      }),
    ).rejects.toThrow(BadGatewayError);
  });

  it("rejects unknown/unsupported webhook events with BadRequestError", async () => {
    const adapter = new RazorpayBillingAdapter({
      keyId: "rzp_test_123",
      keySecret: "rzp_sec_secret_key",
    });

    const fakePayload = {
      event: "payout.processed",
      id: "rzp_evt_unknown_1",
      payload: {},
    };

    const simulated = adapter.simulateWebhook(
      {
        id: "rzp_evt_unknown_1",
        provider: "razorpay",
        eventType: "payment.succeeded",
        timestamp: new Date(),
        data: {},
        rawPayload: fakePayload,
      },
      "rzp_sec_secret_key",
    );

    await expect(
      adapter.verifyWebhookSignature({
        rawBody: simulated.rawBody,
        headers: simulated.headers,
        webhookSecret: "rzp_sec_secret_key",
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it("wraps fetch network timeout/errors into BadGatewayError", async () => {
    const failingFetch: typeof fetch = async () => {
      throw new Error("ETIMEDOUT: Connection to Razorpay timed out");
    };

    const adapter = new RazorpayBillingAdapter({
      keyId: "rzp_test_123",
      keySecret: "rzp_sec_secret_key",
      fetchClient: failingFetch,
    });

    await expect(
      adapter.createCustomer({
        email: "timeout@example.com",
      }),
    ).rejects.toThrow(BadGatewayError);
  });
});
