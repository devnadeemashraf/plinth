import type { BillingProvider, TenantContext } from "@plinth/core";
import type { Entitlement, Invoice, Subscription, WebhookReceipt } from "../domain/billing.js";

export interface BillingPaginationOptions {
  readonly limit?: number | undefined;
  readonly cursor?: string | undefined;
}

export interface PaginatedInvoices {
  readonly items: readonly Invoice[];
  readonly nextCursor?: string | undefined;
}

export interface BillingRepositoryPort {
  saveSubscription(ctx: TenantContext, subscription: Subscription): Promise<void>;

  getSubscription(ctx: TenantContext, id: string): Promise<Subscription | null>;

  getActiveSubscription(ctx: TenantContext): Promise<Subscription | null>;

  saveInvoice(ctx: TenantContext, invoice: Invoice): Promise<void>;

  listInvoices(
    ctx: TenantContext,
    pagination?: BillingPaginationOptions,
  ): Promise<PaginatedInvoices>;

  saveEntitlements(ctx: TenantContext, entitlements: readonly Entitlement[]): Promise<void>;

  getEntitlements(ctx: TenantContext): Promise<readonly Entitlement[]>;

  hasEntitlement(ctx: TenantContext, featureKey: string): Promise<boolean>;

  isWebhookEventProcessed(provider: BillingProvider, eventId: string): Promise<boolean>;

  recordWebhookReceipt(receipt: WebhookReceipt): Promise<void>;
}
