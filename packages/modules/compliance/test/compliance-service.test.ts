import { createTenantId, type TenantContext } from "@plinth/core";
import { ComplianceService, InMemoryComplianceRepository } from "@plinth/modules-compliance";
import { InMemoryUserRepository } from "@plinth/modules-users";
import { describe, expect, it } from "vitest";

describe("ComplianceService - GDPR & India DPDP (5-Category TDD Matrix)", () => {
  const tenant1: TenantContext = {
    tenantId: createTenantId("tenant-1"),
    slug: "tenant-1",
    mode: "multi",
    isDefault: false,
  };
  const tenant2: TenantContext = {
    tenantId: createTenantId("tenant-2"),
    slug: "tenant-2",
    mode: "multi",
    isDefault: false,
  };

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should record consents and return latest effective consent map", async () => {
      const repo = new InMemoryComplianceRepository();
      const userRepo = new InMemoryUserRepository();
      const service = new ComplianceService({
        repository: repo,
        userRepository: userRepo,
      });

      await service.recordConsents(tenant1, "user-1", [
        { category: "analytics", status: "granted", version: "v1.0" },
        { category: "marketing", status: "granted", version: "v1.0" },
      ]);

      const map = await service.getLatestConsentMap(tenant1, "user-1");
      expect(map.essential).toBe(true);
      expect(map.analytics).toBe(true);
      expect(map.marketing).toBe(true);
      expect(map.functional).toBe(false);

      const records = await service.getConsents(tenant1, "user-1");
      expect(records.length).toBe(2);
      expect(records[0]?.category).toBe("analytics");
      expect(records[1]?.category).toBe("marketing");
    });

    it("should export user data conforming to GDPR Art. 20 & India DPDP Sec. 12", async () => {
      const repo = new InMemoryComplianceRepository();
      const userRepo = new InMemoryUserRepository();
      const service = new ComplianceService({
        repository: repo,
        userRepository: userRepo,
        packType: "both",
      });

      await userRepo.save(tenant1, {
        id: "user-1",
        tenantId: tenant1.tenantId,
        email: "alice@example.com",
        displayName: "Alice Smith",
        locale: "en-US",
        timezone: "UTC",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.recordConsents(tenant1, "user-1", [
        { category: "analytics", status: "granted", version: "v1.0" },
      ]);

      const exportData = await service.exportUserData(tenant1, "user-1");
      expect(exportData.exportId).toBeDefined();
      expect(exportData.userId).toBe("user-1");
      expect(exportData.tenantId).toBe(tenant1.tenantId);
      expect(exportData.regulation).toContain("GDPR Article 20");
      expect(exportData.regulation).toContain("India DPDP Act 2023");
      expect((exportData.profile as { email: string }).email).toBe("alice@example.com");
      expect(exportData.consents.length).toBe(1);
    });

    it("should process erasure, anonymize profile, and preserve financial audit invariants", async () => {
      const repo = new InMemoryComplianceRepository();
      const userRepo = new InMemoryUserRepository();
      const service = new ComplianceService({
        repository: repo,
        userRepository: userRepo,
      });

      await userRepo.save(tenant1, {
        id: "user-1",
        tenantId: tenant1.tenantId,
        email: "alice@example.com",
        displayName: "Alice Smith",
        locale: "en-US",
        timezone: "UTC",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.recordConsents(tenant1, "user-1", [
        { category: "marketing", status: "granted", version: "v1.0" },
      ]);

      const erasureResult = await service.requestErasure(tenant1, "user-1");
      expect(erasureResult.userId).toBe("user-1");
      expect(erasureResult.financialRecordsPreserved).toBe(true);
      expect(erasureResult.exemptionsApplied.length).toBeGreaterThan(0);
      expect(erasureResult.exemptionsApplied[0]).toContain("GDPR Article 17(3)(b)");
      expect(erasureResult.exemptionsApplied[1]).toContain("India DPDP Act 2023 Section 17(2)");

      // Verify user profile is anonymized
      const anonymizedProfile = await userRepo.getById(tenant1, "user-1");
      expect(anonymizedProfile?.displayName).toBe("Anonymized User");
      expect(anonymizedProfile?.email).toContain("@erased.plinth.internal");

      // Verify non-essential consent is revoked in consent ledger
      const consentMap = await service.getLatestConsentMap(tenant1, "user-1");
      expect(consentMap.marketing).toBe(false);
    });

    it("should export user data with audit log reader and support individual regulations", async () => {
      const repo = new InMemoryComplianceRepository();
      const userRepo = new InMemoryUserRepository();
      const auditReader = {
        query: async () => [
          {
            action: "user.login",
            timestamp: new Date("2026-01-01T00:00:00Z"),
            ipAddress: "192.168.1.1",
          },
          {
            action: "user.logout",
            timestamp: new Date("2026-01-01T01:00:00Z"),
          },
        ],
      };

      const gdprService = new ComplianceService({
        repository: repo,
        userRepository: userRepo,
        auditReader,
        packType: "gdpr",
      });
      expect(gdprService.getPackType()).toBe("gdpr");

      const dpdpService = new ComplianceService({
        repository: repo,
        userRepository: userRepo,
        auditReader,
        packType: "india-dpdp",
      });
      expect(dpdpService.getPackType()).toBe("india-dpdp");

      const gdprExport = await gdprService.exportUserData(tenant1, "user-1");
      expect(gdprExport.regulation).toBe("GDPR Article 20 (Right to data portability)");
      expect(gdprExport.auditEvents.length).toBe(2);
      expect(gdprExport.auditEvents[0]?.action).toBe("user.login");
      expect(gdprExport.auditEvents[1]?.action).toBe("user.logout");

      const dpdpExport = await dpdpService.exportUserData(tenant1, "user-1");
      expect(dpdpExport.regulation).toContain("India DPDP Act 2023 Section 12");
    });

    it("should clean up storage avatar when user requests erasure with storage adapter", async () => {
      const repo = new InMemoryComplianceRepository();
      const userRepo = new InMemoryUserRepository();
      const deletedKeys: string[] = [];
      const storage = {
        putObject: async () => ({ key: "", url: "" }),
        getObject: async () => ({
          key: "",
          body: Buffer.alloc(0),
          contentType: "",
          contentLength: 0,
        }),
        deleteObject: async (input: { key: string }) => {
          deletedKeys.push(input.key);
          return { key: input.key, deleted: true };
        },
        headObject: async () => ({ exists: false }),
        getSignedUrl: async () => ({ signedUrl: "", expiresAt: new Date() }),
      };

      const service = new ComplianceService({
        repository: repo,
        userRepository: userRepo,
        storage,
      });

      await userRepo.save(tenant1, {
        id: "user-with-avatar",
        tenantId: tenant1.tenantId,
        email: "bob@example.com",
        displayName: "Bob",
        avatarUrl: "storage://avatars/tenant-1/bob.png",
        locale: "en-US",
        timezone: "UTC",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.requestErasure(tenant1, "user-with-avatar");
      expect(deletedKeys).toContain("avatars/tenant-1/bob.png");

      // Test user with non-storage avatar and essential consent recording
      await userRepo.save(tenant1, {
        id: "user-non-storage-avatar",
        tenantId: tenant1.tenantId,
        email: "charlie@example.com",
        displayName: "Charlie",
        avatarUrl: "https://external.com/charlie.png",
        locale: "en-US",
        timezone: "UTC",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await service.recordConsents(tenant1, "user-non-storage-avatar", [
        { category: "essential", status: "granted", version: "v1.0" },
      ]);
      const essentialMap = await service.getLatestConsentMap(tenant1, "user-non-storage-avatar");
      expect(essentialMap.essential).toBe(true);

      await service.requestErasure(tenant1, "user-non-storage-avatar");

      repo.clear();
      const afterClear = await repo.getConsents(tenant1, "user-1");
      expect(afterClear.length).toBe(0);
    });
  });

  // Category 2: Boundary & Validation
  describe("Category 2: Boundary & Validation", () => {
    it("should reject attempts to revoke essential consent", async () => {
      const repo = new InMemoryComplianceRepository();
      const userRepo = new InMemoryUserRepository();
      const service = new ComplianceService({
        repository: repo,
        userRepository: userRepo,
      });

      await expect(
        service.recordConsents(tenant1, "user-1", [
          { category: "essential", status: "revoked", version: "v1.0" },
        ]),
      ).rejects.toThrow("Essential consent cannot be revoked");
    });
  });

  // Category 3: Concurrency & Chronological Ordering
  describe("Category 3: Ordering & Chronological State", () => {
    it("should reflect chronological consent changes correctly", async () => {
      const repo = new InMemoryComplianceRepository();
      const userRepo = new InMemoryUserRepository();
      const service = new ComplianceService({
        repository: repo,
        userRepository: userRepo,
      });

      // Grant -> Revoke -> Re-grant
      await service.recordConsents(tenant1, "user-1", [
        { category: "analytics", status: "granted", version: "v1.0" },
      ]);
      let map = await service.getLatestConsentMap(tenant1, "user-1");
      expect(map.analytics).toBe(true);

      await service.recordConsents(tenant1, "user-1", [
        { category: "analytics", status: "revoked", version: "v1.1" },
      ]);
      map = await service.getLatestConsentMap(tenant1, "user-1");
      expect(map.analytics).toBe(false);

      await service.recordConsents(tenant1, "user-1", [
        { category: "analytics", status: "granted", version: "v1.2" },
      ]);
      map = await service.getLatestConsentMap(tenant1, "user-1");
      expect(map.analytics).toBe(true);
    });
  });

  // Category 4: Fault Injection & Resilience
  describe("Category 4: Fault Injection", () => {
    it("should handle erasure idempotently when user profile does not exist", async () => {
      const repo = new InMemoryComplianceRepository();
      const userRepo = new InMemoryUserRepository();
      const service = new ComplianceService({
        repository: repo,
        userRepository: userRepo,
      });

      const result = await service.requestErasure(tenant1, "non-existent-user");
      expect(result.financialRecordsPreserved).toBe(true);
    });
  });

  // Category 5: Security & Tenant Isolation
  describe("Category 5: Security & Tenant Isolation", () => {
    it("should prevent cross-tenant consent leakage", async () => {
      const repo = new InMemoryComplianceRepository();
      const userRepo = new InMemoryUserRepository();
      const service = new ComplianceService({
        repository: repo,
        userRepository: userRepo,
      });

      await service.recordConsents(tenant1, "user-1", [
        { category: "analytics", status: "granted", version: "v1.0" },
      ]);

      // Tenant 2 queries consents for user-1
      const tenant2Consents = await service.getConsents(tenant2, "user-1");
      expect(tenant2Consents.length).toBe(0);

      const tenant2Map = await service.getLatestConsentMap(tenant2, "user-1");
      expect(tenant2Map.analytics).toBe(false);
    });
  });
});
