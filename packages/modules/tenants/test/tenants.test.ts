import {
  ConflictError,
  DEFAULT_TENANT_CONTEXT,
  DEFAULT_TENANT_ID,
  ForbiddenError,
  NotFoundError,
  type TenantContext,
  ValidationError,
} from "@plinth/core";
import { InMemoryTenantRepository, TenantService } from "@plinth/modules-tenants/index.js";
import { beforeEach, describe, expect, it } from "vitest";

describe("modules / tenants (5-category TDD)", () => {
  let repo: InMemoryTenantRepository;
  let service: TenantService;

  beforeEach(() => {
    repo = new InMemoryTenantRepository();
    service = new TenantService(repo);
  });

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should retrieve default tenant in single-tenant mode", async () => {
      const defaultTenant = await service.getTenantBySlug("default", DEFAULT_TENANT_CONTEXT);
      expect(defaultTenant.id).toBe(DEFAULT_TENANT_ID);
      expect(defaultTenant.slug).toBe("default");
      expect(defaultTenant.name).toBe("Default Organization");
      expect(defaultTenant.plan).toBe("enterprise");
      expect(defaultTenant.status).toBe("active");
    });

    it("should provision a new tenant organization with valid metadata", async () => {
      const created = await service.createTenant(
        {
          slug: "acme-corp",
          name: "Acme Corporation",
          plan: "pro",
          quota: {
            maxUsers: 50,
            maxStorageBytes: 10_000_000,
          },
        },
        DEFAULT_TENANT_CONTEXT,
      );

      expect(created.slug).toBe("acme-corp");
      expect(created.name).toBe("Acme Corporation");
      expect(created.plan).toBe("pro");
      expect(created.status).toBe("active");
      expect(created.quota?.maxUsers).toBe(50);
      expect(created.id).toMatch(/^t_[a-f0-9]{16}$/);

      // Verify retrieval using tenant's own context
      const acmeCtx: TenantContext = {
        tenantId: created.id,
        slug: "acme-corp",
        mode: "multi",
        isDefault: false,
      };

      const fetched = await service.getTenantBySlug("acme-corp", acmeCtx);
      expect(fetched.id).toBe(created.id);
    });

    it("should update tenant profile, subscription plan, and quota", async () => {
      const created = await service.createTenant(
        {
          slug: "globex",
          name: "Globex Industries",
        },
        DEFAULT_TENANT_CONTEXT,
      );

      const globexCtx: TenantContext = {
        tenantId: created.id,
        slug: "globex",
        mode: "multi",
        isDefault: false,
      };

      const updated = await service.updateTenant(
        "globex",
        {
          name: "Globex Worldwide",
          plan: "enterprise",
          quota: { rateLimitRpm: 500 },
        },
        globexCtx,
      );

      expect(updated.name).toBe("Globex Worldwide");
      expect(updated.plan).toBe("enterprise");
      expect(updated.quota?.rateLimitRpm).toBe(500);
      expect(updated.createdAt).toBe(created.createdAt);
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should reject invalid slugs containing spaces, special characters, or excess length", async () => {
      await expect(
        service.createTenant({ slug: "invalid slug", name: "Invalid" }, DEFAULT_TENANT_CONTEXT),
      ).rejects.toThrow(ValidationError);

      await expect(
        service.createTenant({ slug: "invalid@slug", name: "Invalid" }, DEFAULT_TENANT_CONTEXT),
      ).rejects.toThrow(ValidationError);

      await expect(
        service.createTenant(
          { slug: "a".repeat(64), name: "Too Long Slug" },
          DEFAULT_TENANT_CONTEXT,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it("should strictly reject unknown properties on creation and update", async () => {
      await expect(
        service.createTenant(
          { slug: "safe-slug", name: "Safe", rogueProperty: true },
          DEFAULT_TENANT_CONTEXT,
        ),
      ).rejects.toThrow(ValidationError);

      const created = await service.createTenant(
        { slug: "bound-check", name: "Bound Check" },
        DEFAULT_TENANT_CONTEXT,
      );

      const ctx: TenantContext = {
        tenantId: created.id,
        slug: "bound-check",
        mode: "multi",
        isDefault: false,
      };

      await expect(
        service.updateTenant("bound-check", { injectedField: "hacked" }, ctx),
      ).rejects.toThrow(ValidationError);
    });

    it("should reject negative quota values", async () => {
      await expect(
        service.createTenant(
          {
            slug: "negative-quota",
            name: "Negative Quota",
            quota: { maxUsers: -5 },
          },
          DEFAULT_TENANT_CONTEXT,
        ),
      ).rejects.toThrow(ValidationError);
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should safely handle concurrent tenant creations with unique slugs", async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        service.createTenant(
          { slug: `concurrent-org-${i}`, name: `Concurrent Org ${i}` },
          DEFAULT_TENANT_CONTEXT,
        ),
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
      const uniqueIds = new Set(results.map((r) => r.id));
      expect(uniqueIds.size).toBe(5);
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should throw ConflictError on duplicate slug creation", async () => {
      await service.createTenant(
        { slug: "duplicate-slug", name: "First Tenant" },
        DEFAULT_TENANT_CONTEXT,
      );

      await expect(
        service.createTenant(
          { slug: "duplicate-slug", name: "Second Tenant" },
          DEFAULT_TENANT_CONTEXT,
        ),
      ).rejects.toThrow(ConflictError);
    });

    it("should throw NotFoundError when querying non-existent tenant", async () => {
      await expect(service.getTenantBySlug("ghost-tenant", DEFAULT_TENANT_CONTEXT)).rejects.toThrow(
        NotFoundError,
      );
    });

    it("should prevent deletion of the default tenant", async () => {
      await expect(service.deleteTenant("default", DEFAULT_TENANT_CONTEXT)).rejects.toThrow(
        "Cannot delete default tenant",
      );
    });
  });

  // Category 5: Security & Abuse Cases (Zero IDOR Invariant)
  describe("Category 5: Security & Abuse Cases (Zero IDOR)", () => {
    it("should strictly forbid cross-tenant lookup by slug in multi-tenant mode", async () => {
      // 1. Provision Tenant Alpha and Tenant Beta
      const alpha = await service.createTenant(
        { slug: "alpha-corp", name: "Alpha Corp" },
        DEFAULT_TENANT_CONTEXT,
      );
      const _beta = await service.createTenant(
        { slug: "beta-corp", name: "Beta Corp" },
        DEFAULT_TENANT_CONTEXT,
      );

      const alphaCtx: TenantContext = {
        tenantId: alpha.id,
        slug: "alpha-corp",
        mode: "multi",
        isDefault: false,
      };

      // 2. Alpha attempts to access Beta's tenant information via slug
      await expect(service.getTenantBySlug("beta-corp", alphaCtx)).rejects.toThrow(ForbiddenError);

      // 3. Alpha accesses its own information successfully
      const alphaOwn = await service.getTenantBySlug("alpha-corp", alphaCtx);
      expect(alphaOwn.id).toBe(alpha.id);
    });

    it("should strictly forbid cross-tenant modification attempts", async () => {
      const alpha = await service.createTenant(
        { slug: "alpha-update", name: "Alpha" },
        DEFAULT_TENANT_CONTEXT,
      );
      const _beta = await service.createTenant(
        { slug: "beta-update", name: "Beta" },
        DEFAULT_TENANT_CONTEXT,
      );

      const alphaCtx: TenantContext = {
        tenantId: alpha.id,
        slug: "alpha-update",
        mode: "multi",
        isDefault: false,
      };

      // Alpha attempts to modify Beta's name
      await expect(
        service.updateTenant("beta-update", { name: "Hacked Beta" }, alphaCtx),
      ).rejects.toThrow(ForbiddenError);
    });

    it("should strictly forbid cross-tenant deletion attempts", async () => {
      const alpha = await service.createTenant(
        { slug: "alpha-del", name: "Alpha" },
        DEFAULT_TENANT_CONTEXT,
      );
      const _beta = await service.createTenant(
        { slug: "beta-del", name: "Beta" },
        DEFAULT_TENANT_CONTEXT,
      );

      const alphaCtx: TenantContext = {
        tenantId: alpha.id,
        slug: "alpha-del",
        mode: "multi",
        isDefault: false,
      };

      // Alpha attempts to delete Beta
      await expect(service.deleteTenant("beta-del", alphaCtx)).rejects.toThrow(ForbiddenError);
    });
  });
});
