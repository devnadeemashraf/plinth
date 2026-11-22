import { StubBillingAdapter } from "@plinth/adapter-billing-stub";
import { BadRequestError } from "@plinth/core";
import { describe, expect, it } from "vitest";

describe("StubBillingAdapter - Specific Features", () => {
  it("rejects invalid customer email format", async () => {
    const adapter = new StubBillingAdapter();
    await expect(
      adapter.createCustomer({
        email: "not-an-email",
        name: "Test",
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it("rejects non-existent subscription cancellation", async () => {
    const adapter = new StubBillingAdapter();
    await expect(adapter.cancelSubscription("non_existent_sub_123")).rejects.toThrow(
      BadRequestError,
    );
  });

  it("handles malformed JSON payload in webhook", async () => {
    const adapter = new StubBillingAdapter();
    const secret = "secret_12345678901234567890";
    const rawBody = Buffer.from("{ bad_json: ", "utf8");

    // Compute valid signature for the malformed body to test json parse error handling
    const crypto = await import("node:crypto");
    const sig = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    await expect(
      adapter.verifyWebhookSignature({
        rawBody,
        headers: { "x-stub-signature": sig },
        webhookSecret: secret,
      }),
    ).rejects.toThrow(BadRequestError);
  });
});
