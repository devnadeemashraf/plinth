import type { BillingProvider, DatabasePort, TenantContext } from "@plinth/core";
import { createTenantId } from "@plinth/core";
import type { Entitlement, Invoice, Subscription, WebhookReceipt } from "../domain/billing.js";
import type {
  BillingPaginationOptions,
  BillingRepositoryPort,
  PaginatedInvoices,
} from "../ports/repository.js";

export class DbBillingRepository implements BillingRepositoryPort {
  readonly #db: DatabasePort;

  constructor(db: DatabasePort) {
    this.#db = db;
  }

  async initSchema(): Promise<void> {
    await this.#db.query(`
      CREATE TABLE IF NOT EXISTS billing_subscriptions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        status TEXT NOT NULL,
        current_period_start TEXT NOT NULL,
        current_period_end TEXT NOT NULL,
        cancel_at_period_end INTEGER NOT NULL,
        provider TEXT NOT NULL,
        provider_subscription_id TEXT NOT NULL,
        canceled_at TEXT,
        metadata TEXT
      );
    `);

    await this.#db.query(`
      CREATE TABLE IF NOT EXISTS billing_invoices (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_invoice_id TEXT NOT NULL,
        amount_minor_units INTEGER NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL,
        tax_amount_minor_units INTEGER NOT NULL,
        hsn_code TEXT,
        gst_rate_percent REAL,
        gstin TEXT,
        paid_at TEXT,
        pdf_url TEXT,
        metadata TEXT
      );
    `);

    await this.#db.query(`
      CREATE TABLE IF NOT EXISTS billing_entitlements (
        tenant_id TEXT NOT NULL,
        feature_key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        expires_at TEXT,
        PRIMARY KEY (tenant_id, feature_key)
      );
    `);

    await this.#db.query(`
      CREATE TABLE IF NOT EXISTS billing_webhook_receipts (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        provider_event_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        processed_at TEXT NOT NULL,
        UNIQUE (provider, provider_event_id)
      );
    `);
  }

  async saveSubscription(ctx: TenantContext, subscription: Subscription): Promise<void> {
    if (subscription.tenantId !== ctx.tenantId) {
      throw new Error("Tenant ID mismatch in saveSubscription.");
    }

    await this.#db.query(
      `INSERT INTO billing_subscriptions (
        id, tenant_id, customer_id, plan_id, status, current_period_start, current_period_end,
        cancel_at_period_end, provider, provider_subscription_id, canceled_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        plan_id = excluded.plan_id,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        canceled_at = excluded.canceled_at,
        metadata = excluded.metadata`,
      [
        subscription.id,
        subscription.tenantId,
        subscription.customerId,
        subscription.planId,
        subscription.status,
        subscription.currentPeriodStart.toISOString(),
        subscription.currentPeriodEnd.toISOString(),
        subscription.cancelAtPeriodEnd ? 1 : 0,
        subscription.provider,
        subscription.providerSubscriptionId,
        subscription.canceledAt ? subscription.canceledAt.toISOString() : null,
        subscription.metadata ? JSON.stringify(subscription.metadata) : null,
      ],
    );
  }

  async getSubscription(ctx: TenantContext, id: string): Promise<Subscription | null> {
    const rows = await this.#db.query<Record<string, unknown>>(
      "SELECT * FROM billing_subscriptions WHERE id = ? AND tenant_id = ?",
      [id, ctx.tenantId],
    );

    const first = rows[0];
    if (!first) return null;
    return this.#mapSubscription(first);
  }

  async getActiveSubscription(ctx: TenantContext): Promise<Subscription | null> {
    const rows = await this.#db.query<Record<string, unknown>>(
      "SELECT * FROM billing_subscriptions WHERE tenant_id = ? AND status IN ('active', 'trialing') ORDER BY current_period_end DESC LIMIT 1",
      [ctx.tenantId],
    );

    const first = rows[0];
    if (!first) return null;
    return this.#mapSubscription(first);
  }

  async saveInvoice(ctx: TenantContext, invoice: Invoice): Promise<void> {
    if (invoice.tenantId !== ctx.tenantId) {
      throw new Error("Tenant ID mismatch in saveInvoice.");
    }

    await this.#db.query(
      `INSERT INTO billing_invoices (
        id, tenant_id, provider, provider_invoice_id, amount_minor_units, currency,
        status, tax_amount_minor_units, hsn_code, gst_rate_percent, gstin, paid_at, pdf_url, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        paid_at = excluded.paid_at,
        pdf_url = excluded.pdf_url`,
      [
        invoice.id,
        invoice.tenantId,
        invoice.provider,
        invoice.providerInvoiceId,
        invoice.amountMinorUnits,
        invoice.currency,
        invoice.status,
        invoice.taxAmountMinorUnits,
        invoice.hsnCode ?? null,
        invoice.gstRatePercent ?? null,
        invoice.gstin ?? null,
        invoice.paidAt ? invoice.paidAt.toISOString() : null,
        invoice.pdfUrl ?? null,
        invoice.metadata ? JSON.stringify(invoice.metadata) : null,
      ],
    );
  }

  async listInvoices(
    ctx: TenantContext,
    pagination: BillingPaginationOptions = {},
  ): Promise<PaginatedInvoices> {
    const limit = Math.min(Math.max(pagination.limit ?? 20, 1), 100);

    let sql = "SELECT * FROM billing_invoices WHERE tenant_id = ?";
    const params: unknown[] = [ctx.tenantId];

    if (pagination.cursor) {
      sql += " AND id < ?";
      params.push(pagination.cursor);
    }

    sql += " ORDER BY id DESC LIMIT ?";
    params.push(limit + 1);

    const rows = await this.#db.query<Record<string, unknown>>(sql, params);
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const items = pageRows.map((r) => this.#mapInvoice(r));
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

    return { items, nextCursor };
  }

  async saveEntitlements(ctx: TenantContext, entitlements: readonly Entitlement[]): Promise<void> {
    for (const ent of entitlements) {
      await this.#db.query(
        `INSERT INTO billing_entitlements (tenant_id, feature_key, value_json, expires_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(tenant_id, feature_key) DO UPDATE SET
          value_json = excluded.value_json,
          expires_at = excluded.expires_at`,
        [
          ctx.tenantId,
          ent.featureKey,
          JSON.stringify(ent.value),
          ent.expiresAt ? ent.expiresAt.toISOString() : null,
        ],
      );
    }
  }

  async getEntitlements(ctx: TenantContext): Promise<readonly Entitlement[]> {
    const rows = await this.#db.query<Record<string, unknown>>(
      "SELECT * FROM billing_entitlements WHERE tenant_id = ?",
      [ctx.tenantId],
    );

    return rows.map((r) => ({
      tenantId: createTenantId(String(r["tenant_id"])),
      featureKey: String(r["feature_key"]),
      value: JSON.parse(String(r["value_json"])) as number | boolean,
      expiresAt: r["expires_at"] ? new Date(String(r["expires_at"])) : undefined,
    }));
  }

  async hasEntitlement(ctx: TenantContext, featureKey: string): Promise<boolean> {
    const rows = await this.#db.query<Record<string, unknown>>(
      "SELECT * FROM billing_entitlements WHERE tenant_id = ? AND feature_key = ?",
      [ctx.tenantId, featureKey],
    );

    const row = rows[0];
    if (!row) return false;

    if (row["expires_at"]) {
      const expires = new Date(String(row["expires_at"]));
      if (expires.getTime() <= Date.now()) {
        return false;
      }
    }

    const value = JSON.parse(String(row["value_json"]));
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value > 0;
    return false;
  }

  async isWebhookEventProcessed(provider: BillingProvider, eventId: string): Promise<boolean> {
    const rows = await this.#db.query<Record<string, unknown>>(
      "SELECT id FROM billing_webhook_receipts WHERE provider = ? AND provider_event_id = ?",
      [provider, eventId],
    );
    return rows.length > 0;
  }

  async recordWebhookReceipt(receipt: WebhookReceipt): Promise<void> {
    await this.#db.query(
      `INSERT INTO billing_webhook_receipts (id, provider, provider_event_id, event_type, processed_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(provider, provider_event_id) DO NOTHING`,
      [
        receipt.id,
        receipt.provider,
        receipt.providerEventId,
        receipt.eventType,
        receipt.processedAt.toISOString(),
      ],
    );
  }

  #mapSubscription(r: Record<string, unknown>): Subscription {
    return {
      id: String(r["id"]),
      tenantId: createTenantId(String(r["tenant_id"])),
      customerId: String(r["customer_id"]),
      planId: String(r["plan_id"]),
      status: String(r["status"]) as Subscription["status"],
      currentPeriodStart: new Date(String(r["current_period_start"])),
      currentPeriodEnd: new Date(String(r["current_period_end"])),
      cancelAtPeriodEnd: Boolean(r["cancel_at_period_end"]),
      provider: String(r["provider"]) as BillingProvider,
      providerSubscriptionId: String(r["provider_subscription_id"]),
      canceledAt: r["canceled_at"] ? new Date(String(r["canceled_at"])) : undefined,
      metadata: r["metadata"] ? JSON.parse(String(r["metadata"])) : undefined,
    };
  }

  #mapInvoice(r: Record<string, unknown>): Invoice {
    return {
      id: String(r["id"]),
      tenantId: createTenantId(String(r["tenant_id"])),
      provider: String(r["provider"]) as BillingProvider,
      providerInvoiceId: String(r["provider_invoice_id"]),
      amountMinorUnits: Number(r["amount_minor_units"]),
      currency: String(r["currency"]),
      status: String(r["status"]) as Invoice["status"],
      taxAmountMinorUnits: Number(r["tax_amount_minor_units"]),
      hsnCode: r["hsn_code"] ? String(r["hsn_code"]) : undefined,
      gstRatePercent: r["gst_rate_percent"] ? Number(r["gst_rate_percent"]) : undefined,
      gstin: r["gstin"] ? String(r["gstin"]) : undefined,
      paidAt: r["paid_at"] ? new Date(String(r["paid_at"])) : undefined,
      pdfUrl: r["pdf_url"] ? String(r["pdf_url"]) : undefined,
      metadata: r["metadata"] ? JSON.parse(String(r["metadata"])) : undefined,
    };
  }
}
