import { StripeBillingAdapter } from "@plinth/adapter-billing-stripe";
import { runBillingContractTests } from "@plinth/contract-tests";
import { generateUuidV7 } from "@plinth/core";
import { describe } from "vitest";

describe("StripeBillingAdapter - Contract Suite", () => {
  const secret = "whsec_stripe_test_secret_for_contract_tests_32";

  // Mock fetch simulating Stripe API endpoints
  const mockFetch: typeof fetch = async (input, init) => {
    const url = input.toString();
    const method = init?.method ?? "GET";

    if (url.includes("/checkout/sessions")) {
      const id = `cs_test_${generateUuidV7()}`;
      return new Response(
        JSON.stringify({
          id,
          url: `https://checkout.stripe.com/pay/${id}`,
          amount_total: 4900,
          currency: "usd",
          status: "open",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (url.includes("/customers")) {
      if (url.includes("non_existent")) {
        return new Response(JSON.stringify({ error: { message: "No such customer" } }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          id: `cus_${generateUuidV7()}`,
          name: "Alice Smith",
          email: "alice@example.com",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (url.includes("/subscriptions")) {
      return new Response(
        JSON.stringify({
          id: `sub_${generateUuidV7()}`,
          status: method === "DELETE" ? "canceled" : "active",
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ id: `item_${generateUuidV7()}` }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const adapter = new StripeBillingAdapter({
    apiKey: "sk_test_1234567890abcdef",
    webhookSecret: secret,
    fetchClient: mockFetch,
  });

  runBillingContractTests({
    adapterName: "StripeBillingAdapter",
    createAdapter: () => adapter,
    webhookSecret: secret,
    generateValidWebhook: (event, webhookSecret) => {
      return adapter.simulateWebhook(event, webhookSecret);
    },
  });
});
