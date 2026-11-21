import { describe, expect, it } from "vitest";
import {
  createTenantId,
  DEFAULT_TENANT_CONTEXT,
  DEFAULT_TENANT_ID,
  getTenantContext,
  requireTenantContext,
  runWithTenantContext,
  type TenantContext,
} from "@/tenancy/context.js";

describe("tenancy / TenantContext & AsyncLocalStorage (5-category TDD)", () => {
  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should mint a branded TenantId and create valid TenantContext", () => {
      const tenantId = createTenantId("tenant_acme_123");
      expect(tenantId).toBe("tenant_acme_123");

      const context: TenantContext = {
        tenantId,
        slug: "acme",
        mode: "multi",
        isDefault: false,
      };

      expect(context.tenantId).toBe("tenant_acme_123");
      expect(context.slug).toBe("acme");
      expect(context.mode).toBe("multi");
      expect(context.isDefault).toBe(false);
    });

    it("should provide DEFAULT_TENANT_CONTEXT for single-tenant mode", () => {
      expect(DEFAULT_TENANT_ID).toBe("default_tenant");
      expect(DEFAULT_TENANT_CONTEXT.tenantId).toBe("default_tenant");
      expect(DEFAULT_TENANT_CONTEXT.mode).toBe("single");
      expect(DEFAULT_TENANT_CONTEXT.isDefault).toBe(true);
    });

    it("should execute within runWithTenantContext and retrieve context via getTenantContext", async () => {
      const customContext: TenantContext = {
        tenantId: createTenantId("t_456"),
        slug: "globex",
        mode: "multi",
        isDefault: false,
      };

      const result = await runWithTenantContext(customContext, async () => {
        const active = getTenantContext();
        expect(active).toEqual(customContext);
        return active?.slug;
      });

      expect(result).toBe("globex");
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should reject empty or whitespace-only tenantId creation", () => {
      expect(() => createTenantId("")).toThrow("Tenant ID cannot be empty");
      expect(() => createTenantId("   ")).toThrow("Tenant ID cannot be empty");
    });

    it("should trim and normalize valid tenant ID inputs", () => {
      const id = createTenantId("  tenant_trimmed  ");
      expect(id).toBe("tenant_trimmed");
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should maintain strictly isolated tenant contexts across concurrent async tasks", async () => {
      const tenantA: TenantContext = {
        tenantId: createTenantId("tenant_a"),
        slug: "tenant-a",
        mode: "multi",
        isDefault: false,
      };

      const tenantB: TenantContext = {
        tenantId: createTenantId("tenant_b"),
        slug: "tenant-b",
        mode: "multi",
        isDefault: false,
      };

      const taskA = runWithTenantContext(tenantA, async () => {
        await new Promise((r) => setTimeout(r, 10));
        const ctx = getTenantContext();
        return ctx?.tenantId;
      });

      const taskB = runWithTenantContext(tenantB, async () => {
        await new Promise((r) => setTimeout(r, 5));
        const ctx = getTenantContext();
        return ctx?.tenantId;
      });

      const [resA, resB] = await Promise.all([taskA, taskB]);
      expect(resA).toBe("tenant_a");
      expect(resB).toBe("tenant_b");
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should return undefined from getTenantContext outside any runWithTenantContext", () => {
      expect(getTenantContext()).toBeUndefined();
    });

    it("should throw UnauthorizedError when requireTenantContext is called outside active context", () => {
      expect(() => requireTenantContext()).toThrow(
        "Tenant context is required but none was found in the current execution scope",
      );
    });
  });

  // Category 5: Security & Abuse Cases
  describe("Category 5: Security & Abuse Cases", () => {
    it("should prevent context leaking across nested scopes", async () => {
      const outerCtx: TenantContext = {
        tenantId: createTenantId("outer"),
        slug: "outer",
        mode: "multi",
        isDefault: false,
      };

      const innerCtx: TenantContext = {
        tenantId: createTenantId("inner"),
        slug: "inner",
        mode: "multi",
        isDefault: false,
      };

      await runWithTenantContext(outerCtx, async () => {
        expect(getTenantContext()?.slug).toBe("outer");

        await runWithTenantContext(innerCtx, async () => {
          expect(getTenantContext()?.slug).toBe("inner");
        });

        // Restored to outer context
        expect(getTenantContext()?.slug).toBe("outer");
      });

      // Cleared after outer finishes
      expect(getTenantContext()).toBeUndefined();
    });
  });
});
