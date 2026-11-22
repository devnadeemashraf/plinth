import { SqliteDatabaseAdapter } from "@plinth/adapter-db-sqlite";
import { createTenantId, generateUuidV7 } from "@plinth/core";
import { DbBillingRepository } from "@plinth/modules-billing";
import { describe, expect, it } from "vitest";

describe("DbBillingRepository - SQLite SQL Persistence", () => {
  it("initializes schema and executes CRUD operations with tenant isolation", async () => {
    const db = new SqliteDatabaseAdapter({ filename: ":memory:" });
    const repo = new DbBillingRepository(db);

    await repo.initSchema();

    const tenantA = {
      tenantId: createTenantId("tenant_sql_a"),
      slug: "sql_a",
      mode: "multi" as const,
      isDefault: false,
    };
    const tenantB = {
      tenantId: createTenantId("tenant_sql_b"),
      slug: "sql_b",
      mode: "multi" as const,
      isDefault: false,
    };

    const subId = `sub_${generateUuidV7()}`;
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 86400 * 1000);

    // Save subscription
    await repo.saveSubscription(tenantA, {
      id: subId,
      tenantId: tenantA.tenantId,
      customerId: "cus_sql_1",
      planId: "plan_pro",
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      provider: "stub",
      providerSubscriptionId: subId,
    });

    // Tenant A can retrieve
    const retrieved = await repo.getSubscription(tenantA, subId);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(subId);
    expect(retrieved?.status).toBe("active");

    // Tenant B cannot retrieve (tenant isolation)
    const crossTenant = await repo.getSubscription(tenantB, subId);
    expect(crossTenant).toBeNull();

    // Active subscription query
    const active = await repo.getActiveSubscription(tenantA);
    expect(active?.id).toBe(subId);

    // Invoices
    const invId = `inv_${generateUuidV7()}`;
    await repo.saveInvoice(tenantA, {
      id: invId,
      tenantId: tenantA.tenantId,
      provider: "stub",
      providerInvoiceId: "pi_123",
      amountMinorUnits: 50000,
      currency: "INR",
      status: "paid",
      taxAmountMinorUnits: 9000,
      hsnCode: "998313",
      gstRatePercent: 18,
      gstin: "29ABCDE1234F1Z5",
      paidAt: now,
    });

    const invoicesA = await repo.listInvoices(tenantA);
    expect(invoicesA.items).toHaveLength(1);
    expect(invoicesA.items[0]?.hsnCode).toBe("998313");
    expect(invoicesA.items[0]?.gstin).toBe("29ABCDE1234F1Z5");

    const invoicesB = await repo.listInvoices(tenantB);
    expect(invoicesB.items).toHaveLength(0);

    // Entitlements
    await repo.saveEntitlements(tenantA, [
      {
        tenantId: tenantA.tenantId,
        featureKey: "seats",
        value: 10,
      },
      {
        tenantId: tenantA.tenantId,
        featureKey: "sso_enabled",
        value: true,
      },
    ]);

    expect(await repo.hasEntitlement(tenantA, "seats")).toBe(true);
    expect(await repo.hasEntitlement(tenantA, "sso_enabled")).toBe(true);
    expect(await repo.hasEntitlement(tenantA, "non_existent")).toBe(false);

    // Entitlement expiration & value type checks
    await repo.saveEntitlements(tenantA, [
      {
        tenantId: tenantA.tenantId,
        featureKey: "expired_feature",
        value: true,
        expiresAt: new Date(Date.now() - 60000), // in the past
      },
      {
        tenantId: tenantA.tenantId,
        featureKey: "zero_quota",
        value: 0,
      },
      {
        tenantId: tenantA.tenantId,
        featureKey: "string_flag",
        value: "disabled" as unknown as boolean,
      },
    ]);

    expect(await repo.hasEntitlement(tenantA, "expired_feature")).toBe(false);
    expect(await repo.hasEntitlement(tenantA, "zero_quota")).toBe(false);
    expect(await repo.hasEntitlement(tenantA, "string_flag")).toBe(false);

    const allEntitlements = await repo.getEntitlements(tenantA);
    expect(allEntitlements.length).toBeGreaterThan(0);

    // List invoices with pagination cursor
    const inv2 = `inv_${generateUuidV7()}`;
    await repo.saveInvoice(tenantA, {
      id: inv2,
      tenantId: tenantA.tenantId,
      provider: "stub",
      providerInvoiceId: "pi_124",
      amountMinorUnits: 25000,
      currency: "INR",
      status: "paid",
      taxAmountMinorUnits: 4500,
      paidAt: now,
    });

    const paginated1 = await repo.listInvoices(tenantA, { limit: 1 });
    expect(paginated1.items).toHaveLength(1);
    expect(paginated1.nextCursor).toBeDefined();

    const paginated2 = await repo.listInvoices(tenantA, {
      limit: 1,
      cursor: paginated1.nextCursor,
    });
    expect(paginated2.items).toHaveLength(1);

    // Webhook Receipt deduplication
    expect(await repo.isWebhookEventProcessed("stub", "evt_unique_1")).toBe(false);
    await repo.recordWebhookReceipt({
      id: generateUuidV7(),
      provider: "stub",
      providerEventId: "evt_unique_1",
      eventType: "payment.succeeded",
      processedAt: new Date(),
    });
    expect(await repo.isWebhookEventProcessed("stub", "evt_unique_1")).toBe(true);

    await db.close();
  });
});
