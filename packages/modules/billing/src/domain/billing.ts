import type { BillingProvider, InvoiceStatus, SubscriptionStatus, TenantId } from "@plinth/core";
import { z } from "zod";

export interface Plan {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /**
   * Price in integer minor units (paise/cents).
   */
  readonly priceMinorUnits: number;
  readonly currency: string;
  readonly billingInterval: "month" | "year" | "one_time";
  readonly features: readonly string[];
  readonly entitlements: Readonly<Record<string, number | boolean>>;
  readonly metadata?: Readonly<Record<string, string>> | undefined;
}

export interface Subscription {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly customerId: string;
  readonly planId: string;
  readonly status: SubscriptionStatus;
  readonly currentPeriodStart: Date;
  readonly currentPeriodEnd: Date;
  readonly cancelAtPeriodEnd: boolean;
  readonly provider: BillingProvider;
  readonly providerSubscriptionId: string;
  readonly canceledAt?: Date | undefined;
  readonly metadata?: Readonly<Record<string, string>> | undefined;
}

export interface Entitlement {
  readonly tenantId: TenantId;
  readonly featureKey: string;
  readonly value: number | boolean;
  readonly expiresAt?: Date | undefined;
}

export interface Invoice {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly provider: BillingProvider;
  readonly providerInvoiceId: string;
  readonly amountMinorUnits: number;
  readonly currency: string;
  readonly status: InvoiceStatus;
  readonly taxAmountMinorUnits: number;
  readonly hsnCode?: string | undefined;
  readonly gstRatePercent?: number | undefined;
  readonly gstin?: string | undefined;
  readonly paidAt?: Date | undefined;
  readonly pdfUrl?: string | undefined;
  readonly metadata?: Readonly<Record<string, string>> | undefined;
}

export interface WebhookReceipt {
  readonly id: string;
  readonly provider: BillingProvider;
  readonly providerEventId: string;
  readonly eventType: string;
  readonly processedAt: Date;
}

export const billingAddressSchema = z
  .object({
    line1: z.string().optional(),
    line2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().length(2),
  })
  .strict();

export const taxIdentifierSchema = z
  .object({
    type: z.string().min(1),
    value: z.string().min(1),
  })
  .strict();

export const createCheckoutSchema = z
  .object({
    planId: z.string().min(1),
    successUrl: z.string().url(),
    cancelUrl: z.string().url(),
    customerEmail: z.string().email().optional(),
    customerName: z.string().min(1).optional(),
    billingAddress: billingAddressSchema.optional(),
    taxId: taxIdentifierSchema.optional(),
  })
  .strict();

export type CreateCheckoutDto = z.infer<typeof createCheckoutSchema>;

export const cancelSubscriptionSchema = z
  .object({
    cancelImmediately: z.boolean().optional(),
  })
  .strict();

export type CancelSubscriptionDto = z.infer<typeof cancelSubscriptionSchema>;
