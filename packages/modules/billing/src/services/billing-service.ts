import {
  type BillingPort,
  type BillingProvider,
  createTenantId,
  generateUuidV7,
  NotFoundError,
  type OutboxRepositoryPort,
  type TenantContext,
} from "@plinth/core";
import type {
  CreateCheckoutDto,
  Entitlement,
  Invoice,
  Plan,
  Subscription,
  WebhookReceipt,
} from "../domain/billing.js";
import type {
  BillingPaginationOptions,
  BillingRepositoryPort,
  PaginatedInvoices,
} from "../ports/repository.js";

export interface BillingServiceOptions {
  readonly billingPort: BillingPort;
  readonly repository: BillingRepositoryPort;
  readonly plans: readonly Plan[];
  readonly webhookSecret?: string | undefined;
  readonly outboxRepo?: OutboxRepositoryPort | undefined;
}

export class BillingService {
  readonly #billingPort: BillingPort;
  readonly #repository: BillingRepositoryPort;
  readonly #plans = new Map<string, Plan>();
  readonly #webhookSecret: string;
  readonly #outboxRepo?: OutboxRepositoryPort | undefined;

  constructor(options: BillingServiceOptions) {
    this.#billingPort = options.billingPort;
    this.#repository = options.repository;
    this.#webhookSecret = options.webhookSecret ?? "";
    this.#outboxRepo = options.outboxRepo;

    for (const plan of options.plans) {
      this.#plans.set(plan.id, plan);
    }
  }

  getPlans(): readonly Plan[] {
    return Array.from(this.#plans.values());
  }

  getPlan(planId: string): Plan | null {
    return this.#plans.get(planId) ?? null;
  }

  async createCheckoutSession(
    ctx: TenantContext,
    dto: CreateCheckoutDto,
  ): Promise<{ checkoutUrl: string; sessionId: string }> {
    const plan = this.#plans.get(dto.planId);
    if (!plan) {
      throw new NotFoundError(`Plan '${dto.planId}' was not found.`, {
        code: "PLAN_NOT_FOUND",
      });
    }

    const session = await this.#billingPort.createCheckoutSession({
      tenantId: ctx.tenantId,
      customerEmail: dto.customerEmail,
      customerName: dto.customerName,
      billingAddress: dto.billingAddress,
      taxId: dto.taxId,
      mode: plan.billingInterval === "one_time" ? "payment" : "subscription",
      lineItems: [
        {
          name: plan.name,
          description: plan.description,
          amount: plan.priceMinorUnits,
          currency: plan.currency,
          quantity: 1,
        },
      ],
      successUrl: dto.successUrl,
      cancelUrl: dto.cancelUrl,
      metadata: {
        tenantId: ctx.tenantId,
        planId: plan.id,
      },
    });

    return {
      checkoutUrl: session.url,
      sessionId: session.id,
    };
  }

  async handleWebhook(
    _provider: BillingProvider,
    rawBody: Buffer | string,
    headers: Readonly<Record<string, string | string[] | undefined>>,
  ): Promise<{
    processed: boolean;
    duplicate?: boolean | undefined;
    eventId: string;
    eventType: string;
  }> {
    const event = await this.#billingPort.verifyWebhookSignature({
      rawBody,
      headers,
      webhookSecret: this.#webhookSecret,
    });

    // Webhook Deduplication: check (provider, provider_event_id)
    const alreadyProcessed = await this.#repository.isWebhookEventProcessed(
      event.provider,
      event.id,
    );
    if (alreadyProcessed) {
      return {
        processed: false,
        duplicate: true,
        eventId: event.id,
        eventType: event.eventType,
      };
    }

    // Extract tenantId from metadata or raw payload
    const metadata =
      event.data.checkoutSession?.metadata ??
      event.data.subscription?.metadata ??
      (event.rawPayload["metadata"] as Record<string, string> | undefined) ??
      {};

    const rawTenantId = metadata["tenantId"] ?? "default_tenant";
    const tenantId = createTenantId(rawTenantId);
    const tenantContext: TenantContext = {
      tenantId,
      slug: rawTenantId,
      mode: "multi",
      isDefault: false,
      tier: "pro",
      quota: { maxUsers: 100, maxStorageBytes: 10 * 1024 * 1024 },
    };

    // State machine updates
    if (event.eventType === "checkout.completed") {
      const planId = metadata["planId"] ?? "default_plan";
      const plan = this.#plans.get(planId);

      if (event.data.checkoutSession?.mode === "subscription") {
        const subId = event.data.checkoutSession.subscriptionId ?? `sub_${generateUuidV7()}`;
        const now = new Date();
        const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const subscription: Subscription = {
          id: subId,
          tenantId,
          customerId: event.data.checkoutSession.customerId ?? `cus_${generateUuidV7()}`,
          planId,
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          provider: event.provider,
          providerSubscriptionId: subId,
          metadata,
        };

        await this.#repository.saveSubscription(tenantContext, subscription);

        if (plan) {
          await this.#applyPlanEntitlements(tenantContext, plan);
        }
      }
    } else if (
      event.eventType === "subscription.created" ||
      event.eventType === "subscription.updated"
    ) {
      const subData = event.data.subscription;
      if (subData?.id) {
        const planId = subData.planId ?? metadata["planId"] ?? "default_plan";
        const plan = this.#plans.get(planId);
        const now = new Date();
        const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const subscription: Subscription = {
          id: subData.id,
          tenantId,
          customerId: subData.customerId ?? `cus_${generateUuidV7()}`,
          planId,
          status: subData.status ?? "active",
          currentPeriodStart: subData.currentPeriodStart ?? now,
          currentPeriodEnd: subData.currentPeriodEnd ?? periodEnd,
          cancelAtPeriodEnd: subData.cancelAtPeriodEnd ?? false,
          provider: event.provider,
          providerSubscriptionId: subData.id,
          metadata,
        };

        await this.#repository.saveSubscription(tenantContext, subscription);

        if (plan && (subData.status === "active" || subData.status === "trialing")) {
          await this.#applyPlanEntitlements(tenantContext, plan);
        }
      }
    } else if (event.eventType === "subscription.canceled") {
      const subData = event.data.subscription;
      if (subData?.id) {
        const existing = await this.#repository.getSubscription(tenantContext, subData.id);
        if (existing) {
          const canceledSub: Subscription = {
            ...existing,
            status: "canceled",
            canceledAt: new Date(),
          };
          await this.#repository.saveSubscription(tenantContext, canceledSub);
        }
      }
    } else if (event.eventType === "payment.succeeded" || event.eventType === "invoice.paid") {
      const invoiceData = event.data.invoice;
      const paymentData = event.data.payment;

      const invoice: Invoice = {
        id: `inv_${generateUuidV7()}`,
        tenantId,
        provider: event.provider,
        providerInvoiceId: invoiceData?.id ?? paymentData?.id ?? `pi_${generateUuidV7()}`,
        amountMinorUnits: invoiceData?.amount ?? paymentData?.amount ?? 0,
        currency: invoiceData?.currency ?? paymentData?.currency ?? "USD",
        status: "paid",
        taxAmountMinorUnits: 0,
        paidAt: new Date(),
        pdfUrl: invoiceData?.pdfUrl,
        metadata,
      };

      await this.#repository.saveInvoice(tenantContext, invoice);
    }

    // Outbox Integration
    if (this.#outboxRepo) {
      await this.#outboxRepo.create({
        tenantId,
        eventType: "billing.webhook_processed",
        payload: {
          provider: event.provider,
          eventId: event.id,
          eventType: event.eventType,
        },
      });
    }

    // Record receipt to guarantee idempotency and deduplication
    const receipt: WebhookReceipt = {
      id: generateUuidV7(),
      provider: event.provider,
      providerEventId: event.id,
      eventType: event.eventType,
      processedAt: new Date(),
    };
    await this.#repository.recordWebhookReceipt(receipt);

    return {
      processed: true,
      eventId: event.id,
      eventType: event.eventType,
    };
  }

  async checkEntitlement(ctx: TenantContext, featureKey: string): Promise<boolean> {
    return this.#repository.hasEntitlement(ctx, featureKey);
  }

  async getActiveSubscription(ctx: TenantContext): Promise<Subscription | null> {
    return this.#repository.getActiveSubscription(ctx);
  }

  async getEntitlements(ctx: TenantContext): Promise<Record<string, number | boolean>> {
    const list = await this.#repository.getEntitlements(ctx);
    const result: Record<string, number | boolean> = {};
    for (const ent of list) {
      result[ent.featureKey] = ent.value;
    }
    return result;
  }

  async cancelSubscription(
    ctx: TenantContext,
    subscriptionId: string,
    cancelImmediately = false,
  ): Promise<Subscription> {
    const existing = await this.#repository.getSubscription(ctx, subscriptionId);
    if (!existing) {
      throw new NotFoundError(`Subscription '${subscriptionId}' not found for tenant.`, {
        code: "SUBSCRIPTION_NOT_FOUND",
      });
    }

    // Propagate cancellation to upstream billing provider
    try {
      await this.#billingPort.cancelSubscription(existing.providerSubscriptionId, {
        cancelImmediately,
      });
    } catch {
      // Allow graceful fallback if already canceled upstream
    }

    const updated: Subscription = {
      ...existing,
      status: cancelImmediately ? "canceled" : existing.status,
      cancelAtPeriodEnd: !cancelImmediately,
      canceledAt: new Date(),
    };

    await this.#repository.saveSubscription(ctx, updated);
    return updated;
  }

  async listInvoices(
    ctx: TenantContext,
    pagination?: BillingPaginationOptions,
  ): Promise<PaginatedInvoices> {
    return this.#repository.listInvoices(ctx, pagination);
  }

  async #applyPlanEntitlements(ctx: TenantContext, plan: Plan): Promise<void> {
    const entitlements: Entitlement[] = [];
    for (const [key, value] of Object.entries(plan.entitlements)) {
      entitlements.push({
        tenantId: ctx.tenantId,
        featureKey: key,
        value,
      });
    }
    await this.#repository.saveEntitlements(ctx, entitlements);
  }
}
