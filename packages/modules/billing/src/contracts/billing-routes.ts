import { cursorPaginationQuerySchema, defineRoute, type RouteContract } from "@plinth/core";
import { z } from "zod";
import { cancelSubscriptionSchema, createCheckoutSchema } from "../domain/billing.js";

export const createCheckoutRouteContract: RouteContract = defineRoute({
  method: "POST",
  path: "/api/v1/billing/checkout",
  summary: "Create a checkout session for a subscription plan or payment",
  description:
    "Initializes a provider-normalized checkout session and returns the checkout URL to redirect the user to.",
  bodySchema: createCheckoutSchema,
  responseSchemas: {
    200: z.object({
      checkoutUrl: z.string(),
      sessionId: z.string(),
    }),
  },
});

export const getSubscriptionRouteContract: RouteContract = defineRoute({
  method: "GET",
  path: "/api/v1/billing/subscription",
  summary: "Get active subscription details for the tenant",
  description: "Returns the current active subscription, plan details, status, and renewal period.",
  responseSchemas: {
    200: z.object({
      subscription: z
        .object({
          id: z.string(),
          planId: z.string(),
          status: z.string(),
          currentPeriodStart: z.string(),
          currentPeriodEnd: z.string(),
          cancelAtPeriodEnd: z.boolean(),
          provider: z.string(),
        })
        .nullable(),
    }),
  },
});

export const cancelSubscriptionRouteContract: RouteContract = defineRoute({
  method: "POST",
  path: "/api/v1/billing/subscription/cancel",
  summary: "Cancel current active subscription",
  description:
    "Cancels the tenant subscription either immediately or at the end of the current billing cycle.",
  bodySchema: cancelSubscriptionSchema,
  responseSchemas: {
    200: z.object({
      subscription: z.object({
        id: z.string(),
        status: z.string(),
        cancelAtPeriodEnd: z.boolean(),
        canceledAt: z.string().optional(),
      }),
    }),
  },
});

export const listInvoicesRouteContract: RouteContract = defineRoute({
  method: "GET",
  path: "/api/v1/billing/invoices",
  summary: "List invoices with cursor pagination",
  description: "Returns historical tax-compliant invoices and payment records for the tenant.",
  querySchema: cursorPaginationQuerySchema,
  responseSchemas: {
    200: z.object({
      items: z.array(
        z.object({
          id: z.string(),
          provider: z.string(),
          providerInvoiceId: z.string(),
          amountMinorUnits: z.number(),
          currency: z.string(),
          status: z.string(),
          taxAmountMinorUnits: z.number(),
          hsnCode: z.string().optional(),
          gstRatePercent: z.number().optional(),
          gstin: z.string().optional(),
          paidAt: z.string().optional(),
          pdfUrl: z.string().optional(),
        }),
      ),
      nextCursor: z.string().optional(),
    }),
  },
});

export const getEntitlementsRouteContract: RouteContract = defineRoute({
  method: "GET",
  path: "/api/v1/billing/entitlements",
  summary: "Get current tenant entitlements and quotas",
  description: "Returns all active feature flags and quota limits unlocked by current plan.",
  responseSchemas: {
    200: z.object({
      entitlements: z.record(z.string(), z.union([z.number(), z.boolean()])),
    }),
  },
});

export const billingWebhookRouteContract: RouteContract = defineRoute({
  method: "POST",
  path: "/api/v1/billing/webhook/:provider",
  summary: "Inbound webhook receiver for payment and subscription events",
  description:
    "Cryptographically verifies raw-body HMAC signatures, performs deduplication, and atomically updates billing state.",
  paramsSchema: z.object({
    provider: z.enum(["stub", "razorpay", "stripe"]),
  }),
  responseSchemas: {
    200: z.object({
      processed: z.boolean(),
      duplicate: z.boolean().optional(),
      eventId: z.string(),
      eventType: z.string(),
    }),
  },
});
