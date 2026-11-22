import { BadRequestError } from "@/errors/index.js";
import type { TenantId } from "@/primitives/brand-types.js";

export type BillingProvider = "stub" | "razorpay" | "stripe";

export type BillingMode = "payment" | "subscription";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete";

export type InvoiceStatus = "paid" | "open" | "void" | "uncollectible";

export interface BillingAddress {
  readonly line1?: string | undefined;
  readonly line2?: string | undefined;
  readonly city?: string | undefined;
  readonly state?: string | undefined;
  readonly postalCode?: string | undefined;
  readonly country: string; // ISO 3166-1 alpha-2, e.g. "IN", "US"
}

export interface TaxIdentifier {
  readonly type: "in_gst" | "eu_vat" | "us_ein" | string;
  readonly value: string;
}

export interface CheckoutLineItem {
  readonly name: string;
  readonly description?: string | undefined;
  /**
   * Price in integer minor units (e.g. cents, paise, pence).
   * Floating-point numbers are strictly prohibited.
   */
  readonly amount: number;
  readonly currency: string; // ISO 4217, e.g. "INR", "USD"
  readonly quantity: number;
  /**
   * Harmonized System of Nomenclature code for tax compliance (e.g. "998313" for IT services in India).
   */
  readonly hsnCode?: string | undefined;
  /**
   * Applicable GST rate percentage (e.g. 18 for 18% GST).
   */
  readonly gstRatePercent?: number | undefined;
}

export interface CreateCheckoutSessionInput {
  readonly tenantId: TenantId;
  readonly customerId?: string | undefined;
  readonly customerEmail?: string | undefined;
  readonly customerName?: string | undefined;
  readonly billingAddress?: BillingAddress | undefined;
  readonly taxId?: TaxIdentifier | undefined;
  readonly mode: BillingMode;
  readonly lineItems: readonly CheckoutLineItem[];
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly metadata?: Readonly<Record<string, string>> | undefined;
}

export interface CheckoutSession {
  readonly id: string;
  readonly url: string;
  readonly provider: BillingProvider;
  readonly status: "open" | "complete" | "expired";
  readonly amountTotal: number; // minor units
  readonly currency: string;
  readonly mode: BillingMode;
  readonly customerId?: string | undefined;
  readonly subscriptionId?: string | undefined;
  readonly metadata?: Readonly<Record<string, string>> | undefined;
}

export interface BillingCustomer {
  readonly id: string;
  readonly provider: BillingProvider;
  readonly email: string;
  readonly name?: string | undefined;
  readonly billingAddress?: BillingAddress | undefined;
  readonly taxId?: TaxIdentifier | undefined;
  readonly metadata?: Readonly<Record<string, string>> | undefined;
}

export interface CreateCustomerInput {
  readonly email: string;
  readonly name?: string | undefined;
  readonly billingAddress?: BillingAddress | undefined;
  readonly taxId?: TaxIdentifier | undefined;
  readonly metadata?: Readonly<Record<string, string>> | undefined;
}

export interface BillingSubscription {
  readonly id: string;
  readonly provider: BillingProvider;
  readonly customerId: string;
  readonly status: SubscriptionStatus;
  readonly planId: string;
  readonly currentPeriodStart: Date;
  readonly currentPeriodEnd: Date;
  readonly cancelAtPeriodEnd: boolean;
  readonly canceledAt?: Date | undefined;
  readonly metadata?: Readonly<Record<string, string>> | undefined;
}

export type BillingWebhookEventType =
  | "checkout.completed"
  | "payment.succeeded"
  | "payment.failed"
  | "subscription.created"
  | "subscription.updated"
  | "subscription.canceled"
  | "invoice.paid"
  | "invoice.payment_failed";

export interface BillingWebhookEventData {
  readonly checkoutSession?: Partial<CheckoutSession> | undefined;
  readonly subscription?: Partial<BillingSubscription> | undefined;
  readonly payment?:
    | {
        readonly id: string;
        readonly amount: number;
        readonly currency: string;
        readonly status: string;
        readonly customerId?: string | undefined;
        readonly metadata?: Readonly<Record<string, string>> | undefined;
      }
    | undefined;
  readonly invoice?:
    | {
        readonly id: string;
        readonly amount: number;
        readonly currency: string;
        readonly status: InvoiceStatus;
        readonly customerId?: string | undefined;
        readonly subscriptionId?: string | undefined;
        readonly pdfUrl?: string | undefined;
        readonly metadata?: Readonly<Record<string, string>> | undefined;
      }
    | undefined;
}

export interface BillingWebhookEvent {
  readonly id: string;
  readonly provider: BillingProvider;
  readonly eventType: BillingWebhookEventType;
  readonly timestamp: Date;
  readonly data: BillingWebhookEventData;
  readonly rawPayload: Readonly<Record<string, unknown>>;
}

export interface VerifyWebhookSignatureInput {
  readonly rawBody: Buffer | string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly webhookSecret: string;
  readonly toleranceSeconds?: number | undefined;
}

export interface BillingPort {
  readonly provider: BillingProvider;

  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession>;

  createCustomer(input: CreateCustomerInput): Promise<BillingCustomer>;

  getCustomer(customerId: string): Promise<BillingCustomer | null>;

  getSubscription(subscriptionId: string): Promise<BillingSubscription | null>;

  cancelSubscription(
    subscriptionId: string,
    options?: { cancelImmediately?: boolean } | undefined,
  ): Promise<BillingSubscription>;

  verifyWebhookSignature(input: VerifyWebhookSignatureInput): Promise<BillingWebhookEvent>;
}

/**
 * Validates that an amount is a non-negative safe integer representing minor currency units (paise/cents).
 */
export function validateMinorUnitAmount(amount: number): void {
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    !Number.isSafeInteger(amount) ||
    amount < 0
  ) {
    throw new BadRequestError(
      `Invalid monetary amount: ${amount}. Amount must be a non-negative integer representing minor units (cents/paise). Floating-point values are strictly rejected.`,
      { code: "INVALID_AMOUNT" },
    );
  }
}

/**
 * Validates a list of line items, ensuring minor units, positive quantity, and valid currency.
 */
export function validateLineItems(items: readonly CheckoutLineItem[]): void {
  if (!Array.isArray(items) || items.length === 0) {
    throw new BadRequestError("Checkout session must contain at least one line item.", {
      code: "EMPTY_LINE_ITEMS",
    });
  }

  for (const item of items) {
    if (!item.name || typeof item.name !== "string" || item.name.trim().length === 0) {
      throw new BadRequestError("Line item name must be a non-empty string.", {
        code: "INVALID_LINE_ITEM_NAME",
      });
    }

    validateMinorUnitAmount(item.amount);

    if (
      typeof item.quantity !== "number" ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      throw new BadRequestError(
        `Line item quantity for '${item.name}' must be a positive integer.`,
        { code: "INVALID_LINE_ITEM_QUANTITY" },
      );
    }

    if (!item.currency || typeof item.currency !== "string" || item.currency.trim().length !== 3) {
      throw new BadRequestError(
        `Line item currency for '${item.name}' must be a valid 3-letter ISO code.`,
        { code: "INVALID_LINE_ITEM_CURRENCY" },
      );
    }

    if (item.hsnCode && !validateHsnCode(item.hsnCode)) {
      throw new BadRequestError(
        `Line item HSN code '${item.hsnCode}' for '${item.name}' is invalid. HSN must be 4 to 8 digits.`,
        { code: "INVALID_HSN_CODE" },
      );
    }

    if (
      item.gstRatePercent !== undefined &&
      (typeof item.gstRatePercent !== "number" ||
        !Number.isFinite(item.gstRatePercent) ||
        item.gstRatePercent < 0 ||
        item.gstRatePercent > 100)
    ) {
      throw new BadRequestError(
        `Line item GST rate '${item.gstRatePercent}' for '${item.name}' must be a percentage between 0 and 100.`,
        { code: "INVALID_GST_RATE" },
      );
    }
  }
}

/**
 * Safely calculates the total minor-unit sum across line items.
 */
export function calculateLineItemsTotal(items: readonly CheckoutLineItem[]): number {
  validateLineItems(items);
  let total = 0;
  for (const item of items) {
    const itemTotal = item.amount * item.quantity;
    if (!Number.isSafeInteger(itemTotal) || !Number.isSafeInteger(total + itemTotal)) {
      throw new BadRequestError("Total line item amount exceeds safe integer range.", {
        code: "AMOUNT_OVERFLOW",
      });
    }
    total += itemTotal;
  }
  return total;
}

// Indian GSTIN regex: 2 digits State + 10 alphanumeric PAN + 1 entity + 1 'Z' + 1 checksum
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * Validates format of an Indian Goods and Services Tax Identification Number (GSTIN).
 */
export function validateGstin(gstin: string): boolean {
  if (!gstin || typeof gstin !== "string") {
    return false;
  }
  return GSTIN_REGEX.test(gstin);
}

// HSN / SAC code regex: 4 to 8 numeric digits
const HSN_REGEX = /^[0-9]{4,8}$/;

/**
 * Validates format of an HSN / SAC code (Harmonized System of Nomenclature / Services Accounting Code).
 */
export function validateHsnCode(hsnCode: string): boolean {
  if (!hsnCode || typeof hsnCode !== "string") {
    return false;
  }
  return HSN_REGEX.test(hsnCode);
}
