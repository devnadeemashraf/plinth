import type { BillingPort, BillingWebhookEvent, CreateCheckoutSessionInput } from "@plinth/core";
import { BadRequestError, createTenantId } from "@plinth/core";
import { describe, expect, it } from "vitest";

export interface BillingContractSuiteOptions {
  readonly adapterName: string;
  readonly createAdapter: () => Promise<BillingPort> | BillingPort;
  readonly cleanup?: (() => Promise<void> | void) | undefined;
  /**
   * Helper that produces a correctly signed raw payload and headers for this provider.
   */
  readonly generateValidWebhook?: (
    event: BillingWebhookEvent,
    secret: string,
  ) => {
    headers: Record<string, string>;
    rawBody: Buffer | string;
  };
  readonly webhookSecret?: string | undefined;
}

export function runBillingContractTests(options: BillingContractSuiteOptions): void {
  const { adapterName, createAdapter, cleanup, generateValidWebhook } = options;
  const webhookSecret = options.webhookSecret ?? "whsec_test_secret_32_chars_long_entropy";

  describe(`BillingPort Contract Tests: ${adapterName}`, () => {
    let adapter: BillingPort;

    it("initializes adapter and reports valid provider identifier", async () => {
      adapter = await createAdapter();
      expect(["stub", "razorpay", "stripe"]).toContain(adapter.provider);
    });

    it("creates a checkout session with minor units and line items", async () => {
      adapter = await createAdapter();
      const input: CreateCheckoutSessionInput = {
        tenantId: createTenantId("tenant_bill_1"),
        customerEmail: "user@example.com",
        customerName: "Jane Doe",
        mode: "payment",
        lineItems: [
          {
            name: "Cloud Tier Subscription",
            amount: 2900, // $29.00 or ₹29.00
            currency: "USD",
            quantity: 1,
          },
          {
            name: "Audit Log Addon",
            amount: 1000, // $10.00
            currency: "USD",
            quantity: 2,
          },
        ],
        successUrl: "https://example.com/checkout/success",
        cancelUrl: "https://example.com/checkout/cancel",
        metadata: { tier: "cloud" },
      };

      const session = await adapter.createCheckoutSession(input);
      expect(session.id).toBeDefined();
      expect(typeof session.id).toBe("string");
      expect(session.url).toBeDefined();
      expect(session.provider).toBe(adapter.provider);
      expect(session.status).toBe("open");
      expect(session.amountTotal).toBe(4900); // 2900 + 2000
      expect(session.currency).toBe("USD");
    });

    it("strictly rejects checkout session with floating-point amounts", async () => {
      adapter = await createAdapter();
      const input: CreateCheckoutSessionInput = {
        tenantId: createTenantId("tenant_bill_err"),
        customerEmail: "user@example.com",
        mode: "payment",
        lineItems: [
          {
            name: "Broken Float Item",
            amount: 19.99, // INVALID FLOAT
            currency: "USD",
            quantity: 1,
          },
        ],
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      };

      await expect(adapter.createCheckoutSession(input)).rejects.toThrow(BadRequestError);
    });

    it("creates, retrieves, and checks customers", async () => {
      adapter = await createAdapter();
      const customer = await adapter.createCustomer({
        email: "alice@example.com",
        name: "Alice Smith",
        taxId: {
          type: "in_gst",
          value: "29ABCDE1234F1Z5",
        },
        metadata: { tier: "growth" },
      });

      expect(customer.id).toBeDefined();
      expect(customer.email).toBe("alice@example.com");
      expect(customer.name).toBe("Alice Smith");

      const fetched = await adapter.getCustomer(customer.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(customer.id);
      expect(fetched?.email).toBe(customer.email);

      const nonExistent = await adapter.getCustomer("non_existent_cust_id");
      expect(nonExistent).toBeNull();
    });

    it("manages subscriptions (retrieval and cancellation)", async () => {
      adapter = await createAdapter();
      // First create a subscription via checkout or direct customer
      const checkout = await adapter.createCheckoutSession({
        tenantId: createTenantId("tenant_sub_1"),
        customerEmail: "sub@example.com",
        mode: "subscription",
        lineItems: [
          {
            name: "Monthly Pro",
            amount: 5000,
            currency: "USD",
            quantity: 1,
          },
        ],
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      });

      if (checkout.subscriptionId) {
        const sub = await adapter.getSubscription(checkout.subscriptionId);
        expect(sub).not.toBeNull();
        expect(sub?.id).toBe(checkout.subscriptionId);

        const canceled = await adapter.cancelSubscription(checkout.subscriptionId);
        expect(["canceled", "active", "trialing"]).toContain(canceled.status);
      }
    });

    if (generateValidWebhook) {
      describe("Webhook Signature Verification", () => {
        const sampleEvent: BillingWebhookEvent = {
          id: "evt_test_12345",
          provider: "stub",
          eventType: "payment.succeeded",
          timestamp: new Date(),
          data: {
            payment: {
              id: "pay_test_12345",
              amount: 5000,
              currency: "USD",
              status: "succeeded",
            },
          },
          rawPayload: { event: "payment.succeeded", id: "evt_test_12345" },
        };

        it("accepts authentic webhook and normalizes event payload", async () => {
          adapter = await createAdapter();
          const { headers, rawBody } = generateValidWebhook(sampleEvent, webhookSecret);

          const verified = await adapter.verifyWebhookSignature({
            rawBody,
            headers,
            webhookSecret,
          });

          expect(verified.id).toBeDefined();
          expect(verified.eventType).toBe("payment.succeeded");
          expect(verified.provider).toBe(adapter.provider);
        });

        it("rejects forged or tampered webhook signature", async () => {
          adapter = await createAdapter();
          const { headers, rawBody } = generateValidWebhook(sampleEvent, webhookSecret);

          // Tamper with headers
          const forgedHeaders: Record<string, string> = { ...headers };
          for (const key of Object.keys(forgedHeaders)) {
            if (key.toLowerCase().includes("signature")) {
              forgedHeaders[key] = "deadbeef_invalid_forged_sig";
            }
          }

          await expect(
            adapter.verifyWebhookSignature({
              rawBody,
              headers: forgedHeaders,
              webhookSecret,
            }),
          ).rejects.toThrow(BadRequestError);
        });

        it("rejects tampered body even with valid original signature", async () => {
          adapter = await createAdapter();
          const { headers } = generateValidWebhook(sampleEvent, webhookSecret);

          const tamperedBody = Buffer.from(JSON.stringify({ hacked: true, amount: 0 }), "utf8");

          await expect(
            adapter.verifyWebhookSignature({
              rawBody: tamperedBody,
              headers,
              webhookSecret,
            }),
          ).rejects.toThrow(BadRequestError);
        });

        it("rejects when signature header is missing", async () => {
          adapter = await createAdapter();
          const { rawBody } = generateValidWebhook(sampleEvent, webhookSecret);

          await expect(
            adapter.verifyWebhookSignature({
              rawBody,
              headers: {},
              webhookSecret,
            }),
          ).rejects.toThrow(BadRequestError);
        });
      });
    }

    if (cleanup) {
      it("cleans up resources after contract suite completes", async () => {
        await cleanup();
      });
    }
  });
}
