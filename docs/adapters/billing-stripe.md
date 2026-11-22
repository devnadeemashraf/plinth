# Swap-to-Production Handbook: Stripe Billing Adapter (`@plinth/adapter-billing-stripe`)

The **Stripe Billing Adapter** provides global multi-currency checkout sessions, recurring subscriptions, and robust raw-body HMAC webhook handling adhering to `@plinth/core`'s `BillingPort`.

---

## 1. Production Requirements & Credentials
In your Stripe Dashboard (`https://dashboard.stripe.com/`):
1. **API Keys:** Navigate to **Developers > API keys**:
   - `STRIPE_API_KEY`: `sk_live_...` (or `sk_test_...` for test mode)
2. **Webhooks:** Navigate to **Developers > Webhooks > Add an endpoint**:
   - **URL:** `https://your-domain.com/api/v1/billing/webhook/stripe`
   - **Signing Secret:** Retrieve `whsec_...` (`STRIPE_WEBHOOK_SECRET`)
   - **Events to Listen to:**
     - `checkout.session.completed`
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid` / `invoice.payment_succeeded`
     - `invoice.payment_failed`

---

## 2. Invariants & Security Controls
- **Minor Units Only:** All figures are strictly integer cents/paise (e.g. `2900` = $29.00).
- **Raw-Body HMAC + Timestamp Tolerance:** Parsed from `Stripe-Signature` (`t=...,v1=...`). Computes HMAC-SHA256 of `${timestamp}.${rawBody}` and validates that the timestamp is within the configured tolerance window (default: 300s = 5 minutes) to defeat replay attacks.
- **Timing-Safe Comparison:** Compares hashes using `crypto.timingSafeEqual` to eliminate timing side-channel exploits.

---

## 3. Bootstrap Code Example
```typescript
import { StripeBillingAdapter } from "@plinth/adapter-billing-stripe";
import { Redacted } from "@plinth/core";

const stripeAdapter = new StripeBillingAdapter({
  apiKey: new Redacted(process.env.STRIPE_API_KEY!),
  webhookSecret: new Redacted(process.env.STRIPE_WEBHOOK_SECRET!),
  toleranceSeconds: 300,
});
```
