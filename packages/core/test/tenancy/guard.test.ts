import { describe, expect, it } from "vitest";
import {
  assertTenantContext,
  createTenantId,
  DEFAULT_TENANT_CONTEXT,
  runWithTenantContext,
  withTenantGuard,
} from "@/index.js";

describe("tenancy / guard (5-category TDD)", () => {
  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should assert valid TenantContext without throwing", () => {
      expect(() => assertTenantContext(DEFAULT_TENANT_CONTEXT)).not.toThrow();
    });

    it("should execute within withTenantGuard when tenant context is active", async () => {
      const custom = {
        tenantId: createTenantId("t_guard_1"),
        slug: "guard-test",
        mode: "multi" as const,
        isDefault: false,
      };

      const result = await runWithTenantContext(custom, () =>
        withTenantGuard((ctx) => {
          return `protected:${ctx.slug}`;
        }),
      );

      expect(result).toBe("protected:guard-test");
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should reject null, undefined, and non-object inputs in assertTenantContext", () => {
      expect(() => assertTenantContext(null)).toThrow("Valid TenantContext is required");
      expect(() => assertTenantContext(undefined)).toThrow("Valid TenantContext is required");
      expect(() => assertTenantContext("not-an-object")).toThrow("Valid TenantContext is required");
      expect(() => assertTenantContext(12345)).toThrow("Valid TenantContext is required");
    });

    it("should reject object missing tenantId or slug", () => {
      expect(() => assertTenantContext({ slug: "only-slug" })).toThrow(
        "Valid TenantContext is required",
      );
      expect(() => assertTenantContext({ tenantId: "only-id" })).toThrow(
        "Valid TenantContext is required",
      );
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should safely resolve concurrent guarded tasks with distinct contexts", async () => {
      const ctx1 = {
        tenantId: createTenantId("ctx_1"),
        slug: "slug-1",
        mode: "multi" as const,
        isDefault: false,
      };
      const ctx2 = {
        tenantId: createTenantId("ctx_2"),
        slug: "slug-2",
        mode: "multi" as const,
        isDefault: false,
      };

      const [r1, r2] = await Promise.all([
        runWithTenantContext(ctx1, () => withTenantGuard((c) => c.tenantId)),
        runWithTenantContext(ctx2, () => withTenantGuard((c) => c.tenantId)),
      ]);

      expect(r1).toBe("ctx_1");
      expect(r2).toBe("ctx_2");
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should throw UnauthorizedError when withTenantGuard is called without ambient context", async () => {
      await expect(() => withTenantGuard((c) => c.slug)).rejects.toThrow(
        "Tenant context is required but none was found",
      );
    });
  });

  // Category 5: Security & Abuse Cases
  describe("Category 5: Security & Abuse Cases", () => {
    it("should reject spoofed or malformed context objects", () => {
      expect(() =>
        assertTenantContext({
          tenantId: 12345, // invalid type
          slug: "test",
        }),
      ).toThrow("Valid TenantContext is required");

      expect(() =>
        assertTenantContext({
          tenantId: "valid_id",
          slug: ["invalid", "slug"], // invalid type
        }),
      ).toThrow("Valid TenantContext is required");
    });
  });
});
