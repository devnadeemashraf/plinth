import { StripeBillingAdapter } from "@plinth/adapter-billing-stripe";
import { BadGatewayError, BadRequestError } from "@plinth/core";
import { describe, expect, it } from "vitest";

describe("StripeBillingAdapter - Specific Features", () => {
  it("rejects empty apiKey in constructor", () => {
    expect(() => new StripeBillingAdapter({ apiKey: "" })).toThrow(BadRequestError);
  });

  it("rejects webhook if timestamp is expired beyond tolerance", async () => {
    const adapter = new StripeBillingAdapter({
      apiKey: "sk_test_123",
      webhookSecret: "whsec_test_secret",
      toleranceSeconds: 60, // 1 minute tolerance
    });

    // Generate webhook with timestamp from 10 minutes ago
    const expiredTimestamp = Math.floor(Date.now() / 1000) - 600;
    const { headers, rawBody } = adapter.simulateWebhook(
      {
        id: "evt_expired_1",
        provider: "stripe",
        eventType: "payment.succeeded",
        timestamp: new Date(expiredTimestamp * 1000),
        data: {},
        rawPayload: { type: "payment_intent.succeeded" },
      },
      "whsec_test_secret",
      expiredTimestamp,
    );

    await expect(
      adapter.verifyWebhookSignature({
        rawBody,
        headers,
        webhookSecret: "whsec_test_secret",
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it("maps upstream Stripe API errors to BadGatewayError", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({ error: { message: "Invalid API Key provided" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    };

    const adapter = new StripeBillingAdapter({
      apiKey: "sk_test_invalid",
      fetchClient: mockFetch,
    });

    await expect(adapter.getCustomer("cus_123")).rejects.toThrow(BadGatewayError);
  });

  it("wraps fetch network timeout/errors into BadGatewayError", async () => {
    const failingFetch: typeof fetch = async () => {
      throw new Error("Stripe network connection timed out");
    };

    const adapter = new StripeBillingAdapter({
      apiKey: "sk_test_timeout",
      fetchClient: failingFetch,
    });

    await expect(adapter.getCustomer("cus_123")).rejects.toThrow(BadGatewayError);
  });
});
