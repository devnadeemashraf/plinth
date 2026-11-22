import {
  ADMINISTRATOR_BIT,
  createRoleId,
  createTenantContext,
  createTenantId,
  createUserId,
  decryptEnvelope,
  generateUuidV7,
  hasBit,
  verifyPassword,
  verifyTotp,
} from "@plinth/core";
import { InMemoryAuthRepository } from "@plinth/modules-auth";
import { InMemoryRoleRepository, type Role } from "@plinth/modules-rbac";
import { describe, expect, it } from "vitest";
import { createSuperuser } from "../src/commands/create-superuser.js";

// 32-byte master key with >= 16 distinct bytes for envelope encryption
const VALID_MASTER_KEY = Buffer.from(
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  "hex",
);

function createMockRepos() {
  const authRepo = new InMemoryAuthRepository();
  const roleRepo = new InMemoryRoleRepository();
  return { authRepo, roleRepo };
}

describe("Super User CLI - plinth admin:create-superuser (5-Category TDD)", () => {
  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should successfully bootstrap a super user with mandatory TOTP and Administrator role", async () => {
      const { authRepo, roleRepo } = createMockRepos();

      const result = await createSuperuser({
        email: "admin@example.com",
        password: "SuperSecretPassword123!",
        authRepo,
        roleRepo,
        masterKey: VALID_MASTER_KEY,
      });

      expect(result.userId).toBeDefined();
      expect(result.email).toBe("admin@example.com");
      expect(result.tenantId).toBe("default_tenant");
      expect(result.totpSecret).toMatch(/^[A-Z2-7]+$/);
      expect(result.otpauthUri).toContain("otpauth://totp/");
      expect(result.recoveryCodes).toHaveLength(8);

      // Verify user in Auth repository
      const tenantCtx = createTenantContext(createTenantId("default_tenant"));
      const user = await authRepo.findUserByEmail(tenantCtx, "admin@example.com");
      expect(user).not.toBeNull();
      if (!user) {
        throw new Error("Expected user to be created");
      }
      expect(user.status).toBe("active");
      expect(user.emailVerified).toBe(true);
      expect(user.totpEnabled).toBe(true);
      expect(user.totpSecretEncrypted).toBeDefined();

      // Verify user has role with ADMINISTRATOR_BIT assigned
      const assignedRoles = await roleRepo.getMemberRoles(tenantCtx.tenantId, user.id, tenantCtx);
      expect(assignedRoles).toHaveLength(1);
      const adminRole = assignedRoles[0];
      expect(adminRole?.permissions).toBeDefined();
      if (!adminRole) {
        throw new Error("Expected assigned role");
      }
      expect(hasBit(adminRole.permissions, ADMINISTRATOR_BIT)).toBe(true);
      expect(adminRole.position).toBe(100);
    });

    it("should support custom tenant ID and username", async () => {
      const { authRepo, roleRepo } = createMockRepos();

      const result = await createSuperuser({
        email: "ops@company.internal",
        password: "CompanySecurePassword2026#",
        username: "super_ops",
        tenantId: "acme_corp",
        authRepo,
        roleRepo,
        masterKey: VALID_MASTER_KEY,
      });

      expect(result.tenantId).toBe("acme_corp");
      const tenantCtx = createTenantContext(createTenantId("acme_corp"));
      const user = await authRepo.findUserByUsername(tenantCtx, "super_ops");
      expect(user).not.toBeNull();
      expect(user?.email).toBe("ops@company.internal");
    });

    it("should generate a TOTP secret whose generated codes verify correctly", async () => {
      const { authRepo, roleRepo } = createMockRepos();

      const result = await createSuperuser({
        email: "totp-test@example.com",
        password: "PasswordWithEntropy88#",
        authRepo,
        roleRepo,
        masterKey: VALID_MASTER_KEY,
      });

      const { generateTotp } = await import("@plinth/core");
      const code = generateTotp(result.totpSecret);
      expect(verifyTotp(code, result.totpSecret)).toBe(true);
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should reject invalid email format", async () => {
      const { authRepo, roleRepo } = createMockRepos();

      await expect(
        createSuperuser({
          email: "not-an-email",
          password: "StrongPassword123!",
          authRepo,
          roleRepo,
          masterKey: VALID_MASTER_KEY,
        }),
      ).rejects.toThrow(/email/i);
    });

    it("should reject weak passwords", async () => {
      const { authRepo, roleRepo } = createMockRepos();

      await expect(
        createSuperuser({
          email: "weak@example.com",
          password: "short",
          authRepo,
          roleRepo,
          masterKey: VALID_MASTER_KEY,
        }),
      ).rejects.toThrow(/password/i);
    });

    it("should normalize email and username casing/whitespace", async () => {
      const { authRepo, roleRepo } = createMockRepos();

      const result = await createSuperuser({
        email: "  ADMIN.WHITESPACE@EXAMPLE.COM  ",
        password: "StrongPassword123!",
        username: "  SuperAdmin  ",
        authRepo,
        roleRepo,
        masterKey: VALID_MASTER_KEY,
      });

      expect(result.email).toBe("admin.whitespace@example.com");
      const tenantCtx = createTenantContext(createTenantId("default_tenant"));
      const user = await authRepo.findUserByEmail(tenantCtx, "admin.whitespace@example.com");
      expect(user).not.toBeNull();
    });
  });

  // Category 3: Concurrency & Idempotency
  describe("Category 3: Concurrency & Idempotency", () => {
    it("should reject creating duplicate super user with already existing email", async () => {
      const { authRepo, roleRepo } = createMockRepos();

      await createSuperuser({
        email: "duplicate@example.com",
        password: "StrongPassword123!",
        authRepo,
        roleRepo,
        masterKey: VALID_MASTER_KEY,
      });

      await expect(
        createSuperuser({
          email: "duplicate@example.com",
          password: "AnotherPassword456!",
          authRepo,
          roleRepo,
          masterKey: VALID_MASTER_KEY,
        }),
      ).rejects.toThrow(/already exists/i);
    });

    it("should reuse Administrator role if one already exists for tenant", async () => {
      const { authRepo, roleRepo } = createMockRepos();
      const tenantCtx = createTenantContext(createTenantId("default_tenant"));

      // Pre-seed an Administrator role
      const existingRole: Role = {
        id: createRoleId(generateUuidV7()),
        tenantId: tenantCtx.tenantId,
        name: "Administrator",
        permissions: ADMINISTRATOR_BIT,
        position: 100,
        isSystem: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await roleRepo.createRole(existingRole, tenantCtx);

      const result = await createSuperuser({
        email: "user2@example.com",
        password: "StrongPassword123!",
        authRepo,
        roleRepo,
        masterKey: VALID_MASTER_KEY,
      });

      const roles = await roleRepo.getMemberRoles(
        tenantCtx.tenantId,
        createUserId(result.userId),
        tenantCtx,
      );
      expect(roles).toHaveLength(1);
      expect(roles[0]?.id).toBe(existingRole.id);
    });
  });

  // Category 4: Fault Injection
  describe("Category 4: Fault Injection", () => {
    it("should fail fast if master key has insufficient entropy", async () => {
      const { authRepo, roleRepo } = createMockRepos();
      const lowEntropyKey = Buffer.alloc(32, 0xaa); // all same bytes

      await expect(
        createSuperuser({
          email: "entropy@example.com",
          password: "StrongPassword123!",
          authRepo,
          roleRepo,
          masterKey: lowEntropyKey,
        }),
      ).rejects.toThrow(/entropy/i);
    });
  });

  // Category 5: Security & Anti-Takeover
  describe("Category 5: Security & Anti-Takeover", () => {
    it("should store password as secure Argon2id hash and never plaintext", async () => {
      const { authRepo, roleRepo } = createMockRepos();
      const rawPassword = "VerySecurePassword2026!";

      await createSuperuser({
        email: "security@example.com",
        password: rawPassword,
        authRepo,
        roleRepo,
        masterKey: VALID_MASTER_KEY,
      });

      const tenantCtx = createTenantContext(createTenantId("default_tenant"));
      const user = await authRepo.findUserByEmail(tenantCtx, "security@example.com");
      expect(user?.passwordHash).toBeDefined();
      expect(user?.passwordHash).not.toBe(rawPassword);
      expect(user?.passwordHash).toMatch(/^\$argon2id\$/);

      if (!user?.passwordHash) {
        throw new Error("Expected user with passwordHash");
      }
      const isValid = await verifyPassword(user.passwordHash, rawPassword);
      expect(isValid).toBe(true);
    });

    it("should store TOTP secret encrypted using AES-256-GCM envelope encryption", async () => {
      const { authRepo, roleRepo } = createMockRepos();

      const result = await createSuperuser({
        email: "totp-enc@example.com",
        password: "VerySecurePassword2026!",
        authRepo,
        roleRepo,
        masterKey: VALID_MASTER_KEY,
      });

      const tenantCtx = createTenantContext(createTenantId("default_tenant"));
      const user = await authRepo.findUserByEmail(tenantCtx, "totp-enc@example.com");
      expect(user?.totpSecretEncrypted).toBeDefined();
      expect(user?.totpSecretEncrypted).not.toBe(result.totpSecret);

      if (!user?.totpSecretEncrypted) {
        throw new Error("Expected user with totpSecretEncrypted");
      }
      const decrypted = decryptEnvelope(user.totpSecretEncrypted, VALID_MASTER_KEY).toString(
        "utf8",
      );
      expect(decrypted).toBe(result.totpSecret);
    });
  });
});
