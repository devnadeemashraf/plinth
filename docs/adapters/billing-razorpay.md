# Swap-to-Production Handbook: Razorpay Billing Adapter (`@plinth/adapter-billing-razorpay`)

The **Razorpay Billing Adapter** provides first-class support for Indian payments (INR, UPI, Netbanking, cards, recurring auto-debit subscriptions, and statutory GSTIN/HSN metadata) adhering strictly to `@plinth/core`'s `BillingPort`.

---

## 1. Production Requirements & Credentials
In your Razorpay Dashboard (`https://dashboard.razorpay.com/`):
1. **API Keys:** Navigate to **Settings > API Keys** and generate:
   - `RAZORPAY_KEY_ID`: `rzp_live_...` (or `rzp_test_...` for staging)
   - `RAZORPAY_KEY_SECRET`: Secret key (envelope encrypted at rest via `Redacted<T>`)
2. **Webhooks:** Navigate to **Settings > Webhooks > Add New Webhook**:
   - **URL:** `https://your-domain.com/api/v1/billing/webhook/razorpay`
   - **Secret:** Configure a strong 32-character secret (`RAZORPAY_WEBHOOK_SECRET`)
   - **Active Events:**
     - `order.paid`
     - `payment.captured`
     - `payment.failed`
     - `subscription.authenticated`
     - `subscription.activated`
     - `subscription.charged`
     - `subscription.cancelled`
     - `subscription.paused`
     - `subscription.resumed`

---

## 2. Invariants & Implementation Details
- **Minor Units Only:** All monetary figures are passed and calculated strictly in integer paise (e.g. `50000` = ₹500.00). Floating-point values are rejected.
- **Raw-Body HMAC Verification:** Signature is verified against the `x-razorpay-signature` header using `crypto.createHmac("sha256", secret).update(rawBody).digest("hex")` in constant time (`crypto.timingSafeEqual`) to prevent timing side-channel attacks.
- **GST / HSN Support:** Tax details (`in_gst` with 15-character GSTIN format validation and 4-8 digit HSN/SAC codes) are preserved in order metadata and statutory invoice records.

---

## 3. Bootstrap Code Example
```typescript
import { RazorpayBillingAdapter } from "@plinth/adapter-billing-razorpay";
import { Redacted } from "@plinth/core";

const razorpayAdapter = new RazorpayBillingAdapter({
  keyId: process.env.RAZORPAY_KEY_ID!,
  keySecret: new Redacted(process.env.RAZORPAY_KEY_SECRET!),
  webhookSecret: new Redacted(process.env.RAZORPAY_WEBHOOK_SECRET!),
});
```
