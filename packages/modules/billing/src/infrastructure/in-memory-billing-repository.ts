import type { BillingProvider, TenantContext } from "@plinth/core";
import type { Entitlement, Invoice, Subscription, WebhookReceipt } from "../domain/billing.js";
import type {
  BillingPaginationOptions,
  BillingRepositoryPort,
  PaginatedInvoices,
} from "../ports/repository.js";

export class InMemoryBillingRepository implements BillingRepositoryPort {
  readonly #subscriptions = new Map<string, Subscription>();
  readonly #invoices = new Map<string, Invoice>();
  readonly #entitlements = new Map<string, Map<string, Entitlement>>();
  readonly #receipts = new Set<string>();

  async saveSubscription(ctx: TenantContext, subscription: Subscription): Promise<void> {
    if (subscription.tenantId !== ctx.tenantId) {
      throw new Error("Tenant ID mismatch in saveSubscription.");
    }
    this.#subscriptions.set(subscription.id, subscription);
  }

  async getSubscription(ctx: TenantContext, id: string): Promise<Subscription | null> {
    const sub = this.#subscriptions.get(id);
    if (!sub || sub.tenantId !== ctx.tenantId) {
      return null;
    }
    return sub;
  }

  async getActiveSubscription(ctx: TenantContext): Promise<Subscription | null> {
    for (const sub of this.#subscriptions.values()) {
      if (sub.tenantId === ctx.tenantId && (sub.status === "active" || sub.status === "trialing")) {
        return sub;
      }
    }
    return null;
  }

  async saveInvoice(ctx: TenantContext, invoice: Invoice): Promise<void> {
    if (invoice.tenantId !== ctx.tenantId) {
      throw new Error("Tenant ID mismatch in saveInvoice.");
    }
    this.#invoices.set(invoice.id, invoice);
  }

  async listInvoices(
    ctx: TenantContext,
    pagination: BillingPaginationOptions = {},
  ): Promise<PaginatedInvoices> {
    const limit = Math.min(Math.max(pagination.limit ?? 20, 1), 100);
    const tenantInvoices: Invoice[] = [];

    for (const inv of this.#invoices.values()) {
      if (inv.tenantId === ctx.tenantId) {
        tenantInvoices.push(inv);
      }
    }

    // Sort by ID descending (UUIDv7 is chronological)
    tenantInvoices.sort((a, b) => b.id.localeCompare(a.id));

    let startIndex = 0;
    if (pagination.cursor) {
      const idx = tenantInvoices.findIndex((inv) => inv.id === pagination.cursor);
      if (idx !== -1) {
        startIndex = idx + 1;
      }
    }

    const items = tenantInvoices.slice(startIndex, startIndex + limit);
    const nextCursor =
      startIndex + limit < tenantInvoices.length ? items[items.length - 1]?.id : undefined;

    return { items, nextCursor };
  }

  async saveEntitlements(ctx: TenantContext, entitlements: readonly Entitlement[]): Promise<void> {
    let tenantMap = this.#entitlements.get(ctx.tenantId);
    if (!tenantMap) {
      tenantMap = new Map();
      this.#entitlements.set(ctx.tenantId, tenantMap);
    }

    for (const ent of entitlements) {
      tenantMap.set(ent.featureKey, ent);
    }
  }

  async getEntitlements(ctx: TenantContext): Promise<readonly Entitlement[]> {
    const tenantMap = this.#entitlements.get(ctx.tenantId);
    if (!tenantMap) return [];
    return Array.from(tenantMap.values());
  }

  async hasEntitlement(ctx: TenantContext, featureKey: string): Promise<boolean> {
    const tenantMap = this.#entitlements.get(ctx.tenantId);
    if (!tenantMap) return false;
    const ent = tenantMap.get(featureKey);
    if (!ent) return false;

    if (ent.expiresAt && ent.expiresAt.getTime() <= Date.now()) {
      return false;
    }

    if (typeof ent.value === "boolean") {
      return ent.value;
    }
    if (typeof ent.value === "number") {
      return ent.value > 0;
    }
    return false;
  }

  async isWebhookEventProcessed(provider: BillingProvider, eventId: string): Promise<boolean> {
    const key = `${provider}:${eventId}`;
    return this.#receipts.has(key);
  }

  async recordWebhookReceipt(receipt: WebhookReceipt): Promise<void> {
    const key = `${receipt.provider}:${receipt.providerEventId}`;
    this.#receipts.add(key);
  }

  clear(): void {
    this.#subscriptions.clear();
    this.#invoices.clear();
    this.#entitlements.clear();
    this.#receipts.clear();
  }
}
