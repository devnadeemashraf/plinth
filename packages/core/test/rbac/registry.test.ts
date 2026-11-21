import { beforeEach, describe, expect, it } from "vitest";
import { ADMINISTRATOR_BIT, CORE_PERMISSIONS, PermissionRegistry } from "@/rbac/registry.js";

describe("RBAC / Permission Registry (5-Category TDD)", () => {
  let registry: PermissionRegistry;

  beforeEach(() => {
    registry = new PermissionRegistry();
  });

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should initialize with all core system permissions registered in bits 0..63", () => {
      const all = registry.getAll();
      expect(all.length).toBeGreaterThanOrEqual(10);

      const admin = registry.get("ADMINISTRATOR");
      expect(admin).toBeDefined();
      expect(admin?.position).toBe(0);
      expect(admin?.bit).toBe(ADMINISTRATOR_BIT);
      expect(admin?.isSystem).toBe(true);

      const manageRoles = registry.get("MANAGE_ROLES");
      expect(manageRoles).toBeDefined();
      expect(manageRoles?.isSystem).toBe(true);

      const byPos = registry.getByPosition(0);
      expect(byPos?.name).toBe("ADMINISTRATOR");
      expect(registry.getByPosition(999)).toBeUndefined();
    });

    it("should register product permissions starting from bit 64", () => {
      registry.registerProductPermission({
        name: "DOCUMENT_PUBLISH",
        position: 64,
        description: "Publish documents to the public workspace",
      });

      const perm = registry.get("DOCUMENT_PUBLISH");
      expect(perm).toBeDefined();
      expect(perm?.position).toBe(64);
      expect(perm?.bit).toBe(1n << 64n);
      expect(perm?.isSystem).toBe(false);
    });

    it("should convert between list of permission names and combined bitmask", () => {
      registry.registerProductPermission({
        name: "DOCUMENT_READ",
        position: 65,
      });

      const mask = registry.namesToMask(["MANAGE_ROLES", "DOCUMENT_READ"]);
      const manageRolesBit = CORE_PERMISSIONS.MANAGE_ROLES.bit;
      const docReadBit = 1n << 65n;
      expect(mask).toBe(manageRolesBit | docReadBit);

      const names = registry.maskToNames(mask);
      expect(names).toContain("MANAGE_ROLES");
      expect(names).toContain("DOCUMENT_READ");
      expect(names).not.toContain("ADMINISTRATOR");
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should register high bit positions cleanly (e.g. position 128, 255)", () => {
      registry.registerProductPermission({
        name: "CUSTOM_HYPER_PERMISSION",
        position: 255,
      });

      const perm = registry.get("CUSTOM_HYPER_PERMISSION");
      expect(perm?.position).toBe(255);
      expect(perm?.bit).toBe(1n << 255n);
    });

    it("should handle empty names list or zero bitmask gracefully", () => {
      expect(registry.namesToMask([])).toBe(0n);
      expect(registry.maskToNames(0n)).toEqual([]);
    });

    it("should ignore unrecognized names or return error according to strictness", () => {
      expect(() => registry.namesToMask(["NON_EXISTENT_PERM"])).toThrowError(/unknown permission/i);
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should return the exact same permissions list in multiple queries", () => {
      const list1 = registry.getAll();
      const list2 = registry.getAll();
      expect(list1).toEqual(list2);
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should reject product permissions with bit position < 64 (reserved for core system)", () => {
      expect(() =>
        registry.registerProductPermission({
          name: "ILLEGAL_LOW_BIT",
          position: 15,
        }),
      ).toThrowError(/reserved for core system permissions/i);

      expect(() =>
        registry.registerProductPermission({
          name: "ILLEGAL_ZERO_BIT",
          position: 0,
        }),
      ).toThrowError(/reserved for core system permissions/i);
    });

    it("should reject duplicate permission names", () => {
      registry.registerProductPermission({
        name: "SHARED_NAME",
        position: 66,
      });

      expect(() =>
        registry.registerProductPermission({
          name: "SHARED_NAME",
          position: 67,
        }),
      ).toThrowError(/already exists/i);
    });

    it("should reject duplicate bit positions", () => {
      registry.registerProductPermission({
        name: "PERM_A",
        position: 70,
      });

      expect(() =>
        registry.registerProductPermission({
          name: "PERM_B",
          position: 70,
        }),
      ).toThrowError(/already assigned/i);
    });
  });

  // Category 5: Security & Abuse Cases
  describe("Category 5: Security & Abuse Cases", () => {
    it("should prevent overriding core system ADMINISTRATOR bit", () => {
      expect(() =>
        registry.registerProductPermission({
          name: "ADMINISTRATOR",
          position: 64,
        }),
      ).toThrowError(/already exists/i);
    });

    it("should normalize and trim permission names", () => {
      registry.registerProductPermission({
        name: "  INVOICE_CREATE  ",
        position: 80,
      });

      expect(registry.get("INVOICE_CREATE")).toBeDefined();
    });
  });
});
