import { StubBillingAdapter } from "@plinth/adapter-billing-stub";
import {
  type CreateOutboxEventInput,
  createTenantId,
  generateUuidV7,
  NotFoundError,
  type OutboxEvent,
  type OutboxRepositoryPort,
  type TenantContext,
} from "@plinth/core";
import type { Plan } from "@plinth/modules-billing";
import { BillingService, InMemoryBillingRepository } from "@plinth/modules-billing";
import { describe, expect, it } from "vitest";

const samplePlans: Plan[] = [
  {
    id: "plan_starter",
    name: "Starter Tier",
    description: "Basic starter plan",
    priceMinorUnits: 2900, // $29.00
    currency: "USD",
    billingInterval: "month",
    features: ["up_to_5_users", "10gb_storage"],
    entitlements: {
      maxUsers: 5,
      maxStorageGb: 10,
      advancedAudit: false,
    },
  },
  {
    id: "plan_pro",
    name: "Pro Enterprise",
    description: "Advanced pro enterprise plan",
    priceMinorUnits: 9900, // $99.00
    currency: "USD",
    billingInterval: "month",
    features: ["unlimited_users", "100gb_storage", "advanced_audit"],
    entitlements: {
      maxUsers: 100,
      maxStorageGb: 100,
      advancedAudit: true,
    },
  },
];

describe("BillingService - 5-Category TDD Test Suite", () => {
  const secret = "whsec_billing_service_test_secret_32_bytes";

  function createTestHarness(outboxEvents: OutboxEvent[] = []) {
    const stubAdapter = new StubBillingAdapter();
    const repo = new InMemoryBillingRepository();

    const mockOutboxRepo: OutboxRepositoryPort = {
      async create<TPayload = Record<string, unknown>>(
        input: CreateOutboxEventInput<TPayload>,
      ): Promise<OutboxEvent<TPayload>> {
        const evt: OutboxEvent<TPayload> = {
          id: generateUuidV7(),
          tenantId: input.tenantId ?? "default_tenant",
          eventType: input.eventType,
          payload: input.payload,
          status: "pending",
          retryCount: 0,
          maxRetries: 5,
          backoffSeconds: 30,
          scheduledAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        outboxEvents.push(evt as unknown as OutboxEvent);
        return evt;
      },
      async createBatch() {
        return [];
      },
      async fetchPending() {
        return [];
      },
      async markCompleted() {},
      async markFailed() {},
      async getById() {
        return null;
      },
      async listDeadLetters() {
        return [];
      },
      async retryDeadLetter() {
        return false;
      },
    };

    const service = new BillingService({
      billingPort: stubAdapter,
      repository: repo,
      plans: samplePlans,
      webhookSecret: secret,
      outboxRepo: mockOutboxRepo,
    });

    const tenantA: TenantContext = {
      tenantId: createTenantId("tenant_alpha"),
      slug: "alpha",
      mode: "multi",
      isDefault: false,
    };

    const tenantB: TenantContext = {
      tenantId: createTenantId("tenant_bravo"),
      slug: "bravo",
      mode: "multi",
      isDefault: false,
    };

    return { stubAdapter, repo, service, tenantA, tenantB, outboxEvents };
  }

  describe("Category 1: Happy Path", () => {
    it("lists available plans and fetches individual plan details", () => {
      const { service } = createTestHarness();
      const plans = service.getPlans();
      expect(plans).toHaveLength(2);
      expect(service.getPlan("plan_starter")?.name).toBe("Starter Tier");
      expect(service.getPlan("non_existent")).toBeNull();
    });

    it("creates a checkout session for a valid subscription plan", async () => {
      const { service, tenantA } = createTestHarness();
      const result = await service.createCheckoutSession(tenantA, {
        planId: "plan_pro",
        customerEmail: "admin@alpha.com",
        customerName: "Alpha Admin",
        successUrl: "https://alpha.com/success",
        cancelUrl: "https://alpha.com/cancel",
      });

      expect(result.checkoutUrl).toContain("session_id=");
      expect(result.sessionId).toBeDefined();
    });

    it("processes subscription webhook, grants entitlements, and stores invoice", async () => {
      const { service, stubAdapter, tenantA, outboxEvents } = createTestHarness();

      const webhookEvent = {
        id: "evt_sub_created_123",
        provider: "stub" as const,
        eventType: "subscription.created" as const,
        timestamp: new Date(),
        data: {
          subscription: {
            id: "sub_alpha_pro",
            planId: "plan_pro",
            status: "active" as const,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 86400 * 1000),
            cancelAtPeriodEnd: false,
          },
        },
        rawPayload: {
          event: "subscription.created",
          id: "evt_sub_created_123",
          metadata: { tenantId: tenantA.tenantId, planId: "plan_pro" },
          data: {
            subscription: {
              id: "sub_alpha_pro",
              planId: "plan_pro",
              status: "active",
            },
          },
        },
      };

      const { headers, rawBody } = stubAdapter.simulateWebhook(webhookEvent, secret);
      const res = await service.handleWebhook("stub", rawBody, headers);

      expect(res.processed).toBe(true);
      expect(res.duplicate).toBeUndefined();
      expect(res.eventId).toBe("evt_sub_created_123");

      // Verify entitlements granted
      const hasAudit = await service.checkEntitlement(tenantA, "advancedAudit");
      expect(hasAudit).toBe(true);

      const entitlements = await service.getEntitlements(tenantA);
      expect(entitlements["maxUsers"]).toBe(100);

      // Verify outbox event emitted
      expect(outboxEvents).toHaveLength(1);
      expect(outboxEvents[0]?.eventType).toBe("billing.webhook_processed");
    });

    it("creates checkout session for one_time payment plan", async () => {
      const oneTimePlan: Plan = {
        id: "plan_lifetime",
        name: "Lifetime Pass",
        description: "One-off purchase",
        priceMinorUnits: 29900,
        currency: "USD",
        billingInterval: "one_time",
        features: ["lifetime_access"],
        entitlements: { lifetime: true },
      };
      const stubAdapter = new StubBillingAdapter();
      const repo = new InMemoryBillingRepository();
      const service = new BillingService({
        billingPort: stubAdapter,
        repository: repo,
        plans: [oneTimePlan],
        webhookSecret: secret,
      });
      const tenant = {
        tenantId: createTenantId("tenant_lifetime"),
        slug: "lifetime",
        mode: "multi" as const,
        isDefault: false,
      };

      const session = await service.createCheckoutSession(tenant, {
        planId: "plan_lifetime",
        successUrl: "https://lifetime.com/success",
        cancelUrl: "https://lifetime.com/cancel",
      });
      expect(session.sessionId).toBeDefined();
      expect(session.checkoutUrl).toContain("stub-checkout");
    });

    it("retrieves active subscription or null if none active", async () => {
      const { service, repo, tenantA } = createTestHarness();

      // No active subscription initially
      const none = await service.getActiveSubscription(tenantA);
      expect(none).toBeNull();

      // Add active subscription
      await repo.saveSubscription(tenantA, {
        id: "sub_alpha_active",
        tenantId: tenantA.tenantId,
        customerId: "cus_alpha",
        planId: "plan_starter",
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400 * 1000),
        cancelAtPeriodEnd: false,
        provider: "stub",
        providerSubscriptionId: "stub_sub_alpha_active",
      });

      const active = await service.getActiveSubscription(tenantA);
      expect(active).not.toBeNull();
      expect(active?.id).toBe("sub_alpha_active");
    });

    it("cancels subscription with cancelImmediately = false (at period end)", async () => {
      const { service, repo, tenantA } = createTestHarness();

      await repo.saveSubscription(tenantA, {
        id: "sub_end_period",
        tenantId: tenantA.tenantId,
        customerId: "cus_alpha",
        planId: "plan_pro",
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400 * 1000),
        cancelAtPeriodEnd: false,
        provider: "stub",
        providerSubscriptionId: "stub_sub_end_period",
      });

      const updated = await service.cancelSubscription(tenantA, "sub_end_period", false);
      expect(updated.cancelAtPeriodEnd).toBe(true);
      expect(updated.status).toBe("active");
    });

    it("gracefully catches upstream billing provider cancel failures", async () => {
      const failingPort = new StubBillingAdapter();
      // Force cancelSubscription to reject
      failingPort.cancelSubscription = async () => {
        throw new Error("Provider network timeout");
      };

      const repo = new InMemoryBillingRepository();
      const service = new BillingService({
        billingPort: failingPort,
        repository: repo,
        plans: samplePlans,
        webhookSecret: secret,
      });

      const tenantA = {
        tenantId: createTenantId("tenant_graceful"),
        slug: "graceful",
        mode: "multi" as const,
        isDefault: false,
      };

      await repo.saveSubscription(tenantA, {
        id: "sub_failing_provider",
        tenantId: tenantA.tenantId,
        customerId: "cus_alpha",
        planId: "plan_starter",
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400 * 1000),
        cancelAtPeriodEnd: false,
        provider: "stub",
        providerSubscriptionId: "stub_sub_failing_provider",
      });

      // Cancellation should succeed locally despite upstream error
      const canceled = await service.cancelSubscription(tenantA, "sub_failing_provider", true);
      expect(canceled.status).toBe("canceled");
    });

    it("processes webhooks for subscription.canceled and updates state", async () => {
      const { service, repo, stubAdapter, tenantA } = createTestHarness();

      await repo.saveSubscription(tenantA, {
        id: "sub_to_cancel",
        tenantId: tenantA.tenantId,
        customerId: "cus_alpha",
        planId: "plan_pro",
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400 * 1000),
        cancelAtPeriodEnd: false,
        provider: "stub",
        providerSubscriptionId: "sub_to_cancel",
      });

      const webhookEvent = {
        id: "evt_sub_canceled_99",
        provider: "stub" as const,
        eventType: "subscription.canceled" as const,
        timestamp: new Date(),
        data: {
          subscription: {
            id: "sub_to_cancel",
            status: "canceled" as const,
          },
        },
        rawPayload: {
          event: "subscription.canceled",
          id: "evt_sub_canceled_99",
          metadata: { tenantId: tenantA.tenantId },
          data: {
            subscription: {
              id: "sub_to_cancel",
              status: "canceled",
            },
          },
        },
      };

      const { headers, rawBody } = stubAdapter.simulateWebhook(webhookEvent, secret);
      const res = await service.handleWebhook("stub", rawBody, headers);
      expect(res.processed).toBe(true);

      const sub = await repo.getSubscription(tenantA, "sub_to_cancel");
      expect(sub?.status).toBe("canceled");
      expect(sub?.canceledAt).toBeDefined();
    });

    it("handles webhooks for checkout.completed without subscription mode", async () => {
      const { service, stubAdapter, tenantA } = createTestHarness();

      const webhookEvent = {
        id: "evt_checkout_onetime_88",
        provider: "stub" as const,
        eventType: "checkout.completed" as const,
        timestamp: new Date(),
        data: {
          checkoutSession: {
            id: "cs_onetime_88",
            mode: "payment" as const,
          },
        },
        rawPayload: {
          event: "checkout.completed",
          id: "evt_checkout_onetime_88",
          metadata: { tenantId: tenantA.tenantId },
        },
      };

      const { headers, rawBody } = stubAdapter.simulateWebhook(webhookEvent, secret);
      const res = await service.handleWebhook("stub", rawBody, headers);
      expect(res.processed).toBe(true);
    });

    it("handles webhooks with missing tenantId in metadata by falling back to default", async () => {
      const { service, stubAdapter } = createTestHarness();

      const webhookEvent = {
        id: "evt_no_tenant_metadata",
        provider: "stub" as const,
        eventType: "invoice.paid" as const,
        timestamp: new Date(),
        data: {
          payment: {
            id: "pay_fallback",
            amount: 2500,
            currency: "USD",
            status: "succeeded",
          },
        },
        rawPayload: {
          event: "invoice.paid",
          id: "evt_no_tenant_metadata",
        },
      };

      const { headers, rawBody } = stubAdapter.simulateWebhook(webhookEvent, secret);
      const res = await service.handleWebhook("stub", rawBody, headers);
      expect(res.processed).toBe(true);
    });

    it("tests InMemoryBillingRepository boundary cases for entitlements and clear", async () => {
      const repo = new InMemoryBillingRepository();
      const tenant = {
        tenantId: createTenantId("tenant_in_mem"),
        slug: "in_mem",
        mode: "multi" as const,
        isDefault: false,
      };

      // Non-existent entitlement
      expect(await repo.hasEntitlement(tenant, "missing")).toBe(false);

      // Expired entitlement
      await repo.saveEntitlements(tenant, [
        {
          tenantId: tenant.tenantId,
          featureKey: "expired_feature",
          value: true,
          expiresAt: new Date(Date.now() - 10000), // past
        },
        {
          tenantId: tenant.tenantId,
          featureKey: "zero_quota",
          value: 0,
        },
        {
          tenantId: tenant.tenantId,
          featureKey: "positive_quota",
          value: 10,
        },
        {
          tenantId: tenant.tenantId,
          featureKey: "string_val",
          value: "custom" as unknown as boolean,
        },
      ]);

      expect(await repo.hasEntitlement(tenant, "expired_feature")).toBe(false);
      expect(await repo.hasEntitlement(tenant, "zero_quota")).toBe(false);
      expect(await repo.hasEntitlement(tenant, "positive_quota")).toBe(true);
      expect(await repo.hasEntitlement(tenant, "string_val")).toBe(false);

      // Test clear()
      repo.clear();
      expect(await repo.getEntitlements(tenant)).toEqual([]);
    });
  });

  describe("Category 2: Boundary & Fuzzing", () => {
    it("throws NotFoundError when checkout requested for non-existent plan", async () => {
      const { service, tenantA } = createTestHarness();
      await expect(
        service.createCheckoutSession(tenantA, {
          planId: "non_existent_plan",
          successUrl: "https://alpha.com/ok",
          cancelUrl: "https://alpha.com/cancel",
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("enforces pagination bounds on listInvoices", async () => {
      const { service, repo, tenantA } = createTestHarness();
      for (let i = 0; i < 5; i++) {
        await repo.saveInvoice(tenantA, {
          id: `inv_0193${i}`,
          tenantId: tenantA.tenantId,
          provider: "stub",
          providerInvoiceId: `pi_${i}`,
          amountMinorUnits: 2900,
          currency: "USD",
          status: "paid",
          taxAmountMinorUnits: 0,
        });
      }

      const page1 = await service.listInvoices(tenantA, { limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).toBeDefined();

      const page2 = await service.listInvoices(tenantA, {
        limit: 2,
        cursor: page1.nextCursor,
      });
      expect(page2.items).toHaveLength(2);
    });
  });

  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("detects and deduplicates replayed webhooks using (provider, provider_event_id)", async () => {
      const { service, stubAdapter, tenantA, outboxEvents } = createTestHarness();

      const webhookEvent = {
        id: "evt_duplicate_test_999",
        provider: "stub" as const,
        eventType: "payment.succeeded" as const,
        timestamp: new Date(),
        data: {
          payment: {
            id: "pay_123",
            amount: 5000,
            currency: "USD",
            status: "succeeded",
          },
        },
        rawPayload: {
          event: "payment.succeeded",
          id: "evt_duplicate_test_999",
          metadata: { tenantId: tenantA.tenantId },
        },
      };

      const { headers, rawBody } = stubAdapter.simulateWebhook(webhookEvent, secret);

      // First delivery: processed
      const res1 = await service.handleWebhook("stub", rawBody, headers);
      expect(res1.processed).toBe(true);
      expect(res1.duplicate).toBeUndefined();
      expect(outboxEvents).toHaveLength(1);

      // Second identical delivery: deduplicated
      const res2 = await service.handleWebhook("stub", rawBody, headers);
      expect(res2.processed).toBe(false);
      expect(res2.duplicate).toBe(true);
      // No duplicate outbox event
      expect(outboxEvents).toHaveLength(1);
    });
  });

  describe("Category 5: Security & Multi-Tenancy Isolation", () => {
    it("prevents Tenant B from cancelling or accessing Tenant A subscription", async () => {
      const { service, repo, tenantA, tenantB } = createTestHarness();

      const subA = {
        id: "sub_secret_alpha_1",
        tenantId: tenantA.tenantId,
        customerId: "cus_alpha",
        planId: "plan_pro",
        status: "active" as const,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400 * 1000),
        cancelAtPeriodEnd: false,
        provider: "stub" as const,
        providerSubscriptionId: "stub_sub_secret_alpha_1",
      };

      await repo.saveSubscription(tenantA, subA);

      // Tenant B tries to cancel Tenant A's subscription -> NotFoundError
      await expect(service.cancelSubscription(tenantB, "sub_secret_alpha_1")).rejects.toThrow(
        NotFoundError,
      );

      // Tenant A can cancel successfully
      const canceled = await service.cancelSubscription(tenantA, "sub_secret_alpha_1", true);
      expect(canceled.status).toBe("canceled");
    });

    it("strictly isolates invoices between tenants", async () => {
      const { service, repo, tenantA, tenantB } = createTestHarness();

      await repo.saveInvoice(tenantA, {
        id: "inv_alpha_only",
        tenantId: tenantA.tenantId,
        provider: "stub",
        providerInvoiceId: "pi_alpha",
        amountMinorUnits: 9900,
        currency: "USD",
        status: "paid",
        taxAmountMinorUnits: 0,
      });

      const tenantBInvoices = await service.listInvoices(tenantB);
      expect(tenantBInvoices.items).toHaveLength(0);

      const tenantAInvoices = await service.listInvoices(tenantA);
      expect(tenantAInvoices.items).toHaveLength(1);
      expect(tenantAInvoices.items[0]?.id).toBe("inv_alpha_only");
    });
  });
});
