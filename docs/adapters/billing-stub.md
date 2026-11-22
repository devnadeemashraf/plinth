# Swap-to-Production Handbook: Billing Stub Adapter (`@plinth/adapter-billing-stub`)

The **Billing Stub Adapter** provides a 100% offline in-memory implementation of `@plinth/core`'s `BillingPort`. It requires zero external developer accounts, zero API keys, and simulates full checkout and webhook flows locally.

---

## 1. Local Behavior
- **Checkout URLs:** Generates local test checkout URLs (`http://localhost:3000/billing/stub-checkout?session_id=stub_cs_...`).
- **Webhooks:** Computes HMAC-SHA256 signatures over raw request bodies using the header `x-stub-signature` or `x-webhook-signature`.
- **Simulator Helper:** Ships `adapter.simulateWebhook(event, webhookSecret)` which generates cryptographically valid webhook headers and raw payload buffers for automated tests and Admin UI triggers.

---

## 2. Configuration & Invariants
```typescript
import { StubBillingAdapter } from "@plinth/adapter-billing-stub";

const billingAdapter = new StubBillingAdapter({
  baseUrl: "http://localhost:3000",
});
```

---

## 3. Swap to Production
To swap from `StubBillingAdapter` to `StripeBillingAdapter` or `RazorpayBillingAdapter`:
1. Change the dependency in your application container / bootstrap file.
2. Supply production environment variables (`STRIPE_API_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `BILLING_WEBHOOK_SECRET`).
3. Both production adapters implement identical `BillingPort` interfaces and satisfy 100% of the shared `runBillingContractTests` contract test suite.
