import {
  BrandService,
  DEFAULT_BRAND_CONFIG,
  InMemoryBrandRepository,
  updateBrandSchema,
} from "@plinth/modules-brand";
import { describe, expect, it } from "vitest";

describe("brand / BrandService & domain validation (5-category TDD)", () => {
  function createTestService() {
    const repo = new InMemoryBrandRepository();
    const service = new BrandService(repo);
    return { service, repo };
  }

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should return default brand configuration on initialization", async () => {
      const { service } = createTestService();
      const brand = await service.getBrand();

      expect(brand.name).toBe("Plinth");
      expect(brand.primaryColorHex).toBe("#4f46e5");
      expect(brand.supportEmail).toBe("support@plinth.dev");
    });

    it("should update valid brand attributes and return updated configuration", async () => {
      const { service } = createTestService();
      const updated = await service.updateBrand({
        name: "Acme Platform",
        tagline: "The fastest way to build",
        primaryColorHex: "#0055ff",
      });

      expect(updated.name).toBe("Acme Platform");
      expect(updated.tagline).toBe("The fastest way to build");
      expect(updated.primaryColorHex).toBe("#0055ff");
      // Unmodified properties should remain intact
      expect(updated.secondaryColorHex).toBe(DEFAULT_BRAND_CONFIG.secondaryColorHex);
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should reject invalid hex color formats in schema", () => {
      expect(() => updateBrandSchema.parse({ primaryColorHex: "blue" })).toThrow();
      expect(() => updateBrandSchema.parse({ primaryColorHex: "#123" })).toThrow();
      expect(() => updateBrandSchema.parse({ primaryColorHex: "#GGGGGG" })).toThrow();
      expect(() => updateBrandSchema.parse({ primaryColorHex: "#1234567" })).toThrow();
    });

    it("should reject invalid URLs and email formats", () => {
      expect(() => updateBrandSchema.parse({ supportEmail: "not-an-email" })).toThrow();
      expect(() => updateBrandSchema.parse({ logoUrlLight: "not-a-url" })).toThrow();
      expect(() => updateBrandSchema.parse({ legalTermsUrl: "ftp://unsafe" })).toThrow();
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should handle sequential updates deterministically", async () => {
      const { service } = createTestService();

      await service.updateBrand({ name: "Step 1" });
      const final = await service.updateBrand({ name: "Step 2" });

      expect(final.name).toBe("Step 2");
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should propagate errors if repository fails", async () => {
      const repo = new InMemoryBrandRepository();
      repo.get = async () => {
        throw new Error("Repository read failed");
      };
      const service = new BrandService(repo);

      await expect(service.getBrand()).rejects.toThrow("Repository read failed");
    });
  });

  // Category 5: Security & Abuse Cases
  describe("Category 5: Security & Abuse Cases", () => {
    it("should strictly reject extraneous fields in update schema to prevent mass-assignment", () => {
      expect(() =>
        updateBrandSchema.parse({
          name: "Acme",
          injectedAdminRole: true,
        }),
      ).toThrow();
    });

    it("should sanitize and reject XSS vectors in color fields", () => {
      expect(() =>
        updateBrandSchema.parse({
          primaryColorHex: '<script>alert("xss")</script>',
        }),
      ).toThrow();
    });
  });
});
