import { RazorpayBillingAdapter } from "@plinth/adapter-billing-razorpay";
import { runBillingContractTests } from "@plinth/contract-tests";
import { generateUuidV7 } from "@plinth/core";
import { describe } from "vitest";

describe("RazorpayBillingAdapter - Contract Suite", () => {
  const secret = "whsec_rzp_contract_test_secret_32";

  // Mock fetch simulating Razorpay REST API
  const mockFetch: typeof fetch = async (input, init) => {
    const url = input.toString();
    const method = init?.method ?? "GET";
    const bodyText = typeof init?.body === "string" ? init.body : "{}";
    const body = JSON.parse(bodyText);

    if (url.includes("/orders")) {
      return new Response(
        JSON.stringify({
          id: `order_${generateUuidV7()}`,
          entity: "order",
          amount: body.amount ?? 5000,
          currency: body.currency ?? "INR",
          status: "created",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (url.includes("/subscriptions") && method === "POST") {
      return new Response(
        JSON.stringify({
          id: `sub_${generateUuidV7()}`,
          entity: "subscription",
          plan_id: body.plan_id ?? "plan_pro",
          status: "created",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (url.includes("/customers")) {
      if (url.includes("non_existent")) {
        return new Response(JSON.stringify({ error: { description: "Customer not found" } }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          id: `cust_${generateUuidV7()}`,
          entity: "customer",
          name: body.name ?? "Alice Smith",
          email: body.email ?? "alice@example.com",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ id: `item_${generateUuidV7()}` }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const adapter = new RazorpayBillingAdapter({
    keyId: "rzp_test_key_id_123",
    keySecret: "rzp_test_secret_key_456",
    webhookSecret: secret,
    fetchClient: mockFetch,
  });

  runBillingContractTests({
    adapterName: "RazorpayBillingAdapter",
    createAdapter: () => adapter,
    webhookSecret: secret,
    generateValidWebhook: (event, webhookSecret) => {
      return adapter.simulateWebhook(event, webhookSecret);
    },
  });
});
