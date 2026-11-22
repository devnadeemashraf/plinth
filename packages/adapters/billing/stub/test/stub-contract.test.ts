import { StubBillingAdapter } from "@plinth/adapter-billing-stub";
import { runBillingContractTests } from "@plinth/contract-tests";
import { describe } from "vitest";

describe("StubBillingAdapter - Contract Suite", () => {
  const adapter = new StubBillingAdapter();
  const secret = "whsec_stub_testing_secret_key_12345";

  runBillingContractTests({
    adapterName: "StubBillingAdapter",
    createAdapter: () => adapter,
    cleanup: () => {
      adapter.reset();
    },
    webhookSecret: secret,
    generateValidWebhook: (event, webhookSecret) => {
      return adapter.simulateWebhook(event, webhookSecret);
    },
  });
});
