# Adapter Swap Handbook: Stub vs Razorpay vs Stripe

This 1-page guide explains how to swap between billing adapters: `@plinth/adapter-billing-stub`, `@plinth/adapter-billing-razorpay`, and `@plinth/adapter-billing-stripe`.

---

## 1. Architectural Comparison

| Dimension | Stub Billing (`adapter-billing-stub`) | Razorpay (`adapter-billing-razorpay`) | Stripe (`adapter-billing-stripe`) |
|---|---|---|---|
| **Best For** | Offline local dev, CI tests | India (UPI, Netbanking, Cards, GST/HSN) | Global (USD, EUR, Multi-currency, Apple Pay) |
| **Amounts** | Integer minor units (cents / paise) | Integer minor units (paise) | Integer minor units (cents) |
| **Tax Compliance** | Mock tax calculation | Indian GSTIN (15-char) & HSN/SAC codes | Stripe Tax / Automatic tax calculation |
| **Webhook Signature** | Local HMAC simulator | `x-razorpay-signature` (HMAC SHA-256) | `Stripe-Signature` (`t=...,v1=...`) with 300s replay window |
| **Deduplication** | In-memory key tracking | `(provider, provider_event_id)` SQL table | `(provider, provider_event_id)` SQL table |

---

## 2. Indian GST Compliance (Razorpay)
When configuring `@plinth/adapter-billing-razorpay`:
1. Customer GSTIN must match regex `/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/`.
2. HSN/SAC code must be 4 to 8 digits.
3. GST rate percent must be bounded between 0% and 100%.

---

## 3. Webhook Signature Verification Runbook

### For Stripe:
Pass raw body buffer to adapter:
```typescript
const event = await stripeAdapter.verifyWebhookSignature({
  rawBody: req.rawBody,
  signatureHeader: req.headers["stripe-signature"],
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
});
```

### For Razorpay:
```typescript
const event = await razorpayAdapter.verifyWebhookSignature({
  rawBody: req.rawBody,
  signatureHeader: req.headers["x-razorpay-signature"],
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET!,
});
```

---

## 4. Swap Steps

### To Switch to Stripe:
```bash
pnpm add @plinth/adapter-billing-stripe
```
In `src/server.ts`:
```typescript
import { StripeBillingAdapter } from "@plinth/adapter-billing-stripe";

const billing = new StripeBillingAdapter({
  apiKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
});
```

### To Switch to Razorpay:
```bash
pnpm add @plinth/adapter-billing-razorpay
```
In `src/server.ts`:
```typescript
import { RazorpayBillingAdapter } from "@plinth/adapter-billing-razorpay";

const billing = new RazorpayBillingAdapter({
  keyId: process.env.RAZORPAY_KEY_ID!,
  keySecret: process.env.RAZORPAY_KEY_SECRET!,
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET!,
});
```

### Verification:
```bash
pnpm test:billing
```
All adapters pass 100% of the shared `BillingPort` contract tests.
