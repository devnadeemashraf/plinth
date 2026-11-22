import {
  ADMINISTRATOR_BIT,
  createRoleId,
  createTenantContext,
  createTenantId,
  createUserId,
  encryptEnvelope,
  generateTotp,
  generateTotpSecret,
  generateUuidV7,
  hashPassword,
} from "@plinth/core";
import { InMemoryAuditLogRepository } from "@plinth/modules-audit";
import { InMemoryAuthRepository, type User } from "@plinth/modules-auth";
import { DEFAULT_BRAND_CONFIG, InMemoryBrandRepository } from "@plinth/modules-brand";
import { InMemoryConfigStoreRepository } from "@plinth/modules-config-store";
import { InMemoryRoleRepository, type Role } from "@plinth/modules-rbac";
import { InMemoryTenantRepository } from "@plinth/modules-tenants";
import { beforeEach, describe, expect, it } from "vitest";
import type { AdminSession } from "../src/domain/admin-models.js";
import { AdminService } from "../src/services/admin-service.js";

const VALID_MASTER_KEY = Buffer.from(
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  "hex",
);

describe("AdminService (5-Category TDD)", () => {
  let authRepo: InMemoryAuthRepository;
  let roleRepo: InMemoryRoleRepository;
  let brandRepo: InMemoryBrandRepository;
  let configRepo: InMemoryConfigStoreRepository;
  let tenantRepo: InMemoryTenantRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let adminService: AdminService;

  let superUser: User;
  let superUserTotpSecret: string;
  let regularUser: User;

  beforeEach(async () => {
    authRepo = new InMemoryAuthRepository();
    roleRepo = new InMemoryRoleRepository();
    brandRepo = new InMemoryBrandRepository();
    configRepo = new InMemoryConfigStoreRepository();
    tenantRepo = new InMemoryTenantRepository();
    auditRepo = new InMemoryAuditLogRepository();

    const tenantCtx = createTenantContext(createTenantId("default_tenant"));

    // Seed Administrator role
    const adminRole: Role = {
      id: createRoleId(generateUuidV7()),
      tenantId: tenantCtx.tenantId,
      name: "Administrator",
      permissions: ADMINISTRATOR_BIT,
      position: 100,
      isSystem: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await roleRepo.createRole(adminRole, tenantCtx);

    // Seed Member role
    const memberRole: Role = {
      id: createRoleId(generateUuidV7()),
      tenantId: tenantCtx.tenantId,
      name: "Member",
      permissions: 2n,
      position: 10,
      isSystem: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await roleRepo.createRole(memberRole, tenantCtx);

    // Create super user
    const { secret } = generateTotpSecret("Plinth", "admin@example.com");
    superUserTotpSecret = secret;
    const encSecret = encryptEnvelope(secret, VALID_MASTER_KEY);
    const passHash = await hashPassword("StrongSuperUserPassword123!");

    superUser = {
      id: createUserId(generateUuidV7()),
      tenantId: tenantCtx.tenantId,
      email: "admin@example.com",
      emailVerified: true,
      passwordHash: passHash,
      totpSecretEncrypted: encSecret,
      totpEnabled: true,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await authRepo.createUser(tenantCtx, superUser);
    await roleRepo.assignRoleToMember(tenantCtx.tenantId, superUser.id, adminRole.id, tenantCtx);

    // Create regular user without admin bit
    regularUser = {
      id: createUserId(generateUuidV7()),
      tenantId: tenantCtx.tenantId,
      email: "regular@example.com",
      emailVerified: true,
      passwordHash: passHash,
      totpSecretEncrypted: encSecret,
      totpEnabled: true,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await authRepo.createUser(tenantCtx, regularUser);
    await roleRepo.assignRoleToMember(tenantCtx.tenantId, regularUser.id, memberRole.id, tenantCtx);

    adminService = new AdminService({
      authRepo,
      roleRepo,
      brandRepo,
      configRepo,
      tenantRepo,
      auditRepo,
      masterKey: VALID_MASTER_KEY,
    });
  });

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should authenticate super user and exchange TOTP for a valid AdminSession", async () => {
      // Step 1: Password authentication yields an MFA ticket
      const { mfaTicket } = await adminService.authenticate(
        "admin@example.com",
        "StrongSuperUserPassword123!",
      );
      expect(mfaTicket).toBeDefined();

      // Step 2: Valid TOTP exchange mints a session
      const code = generateTotp(superUserTotpSecret);
      const session = await adminService.verifyMfa(mfaTicket, code);

      expect(session.id).toBeDefined();
      expect(session.email).toBe("admin@example.com");
      expect(session.csrfToken).toBeDefined();
      expect(session.csrfToken.length).toBeGreaterThanOrEqual(32);

      // Step 3: Validate session
      const validated = await adminService.validateSession(session.id);
      expect(validated).not.toBeNull();
      expect(validated?.user.id).toBe(superUser.id);
    });

    it("should retrieve and update brand configuration", async () => {
      const initial = await adminService.getBrand();
      expect(initial.name).toBe(DEFAULT_BRAND_CONFIG.name);

      const updated = await adminService.updateBrand({
        name: "Acme Corp",
        primaryColorHex: "#059669",
      });
      expect(updated.name).toBe("Acme Corp");
      expect(updated.primaryColorHex).toBe("#059669");

      const fetched = await adminService.getBrand();
      expect(fetched.name).toBe("Acme Corp");
    });

    it("should aggregate dashboard stats cleanly", async () => {
      const stats = await adminService.getDashboardViewModel();
      expect(stats.tenantCount).toBe(1);
      expect(stats.userCount).toBe(2);
      expect(stats.roleCount).toBe(2);
      expect(stats.dbHealthy).toBe(true);
      expect(stats.nodeVersion).toBeDefined();
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should reject non-admin users even with correct password", async () => {
      await expect(
        adminService.authenticate("regular@example.com", "StrongSuperUserPassword123!"),
      ).rejects.toThrow(/super user privileges required|access denied/i);
    });

    it("should reject invalid passwords", async () => {
      await expect(
        adminService.authenticate("admin@example.com", "WrongPassword!"),
      ).rejects.toThrow(/invalid/i);
    });

    it("should reject invalid TOTP codes", async () => {
      const { mfaTicket } = await adminService.authenticate(
        "admin@example.com",
        "StrongSuperUserPassword123!",
      );
      await expect(adminService.verifyMfa(mfaTicket, "000000")).rejects.toThrow(/invalid/i);
    });

    it("should reject expired or corrupted MFA tickets", async () => {
      await expect(adminService.verifyMfa("corrupted-ticket", "123456")).rejects.toThrow(/ticket/i);
    });
  });

  // Category 3: Concurrency & Idempotency
  describe("Category 3: Concurrency & Idempotency", () => {
    it("should allow multiple concurrent admin sessions for the same user", async () => {
      const { mfaTicket: t1 } = await adminService.authenticate(
        "admin@example.com",
        "StrongSuperUserPassword123!",
      );
      const { mfaTicket: t2 } = await adminService.authenticate(
        "admin@example.com",
        "StrongSuperUserPassword123!",
      );

      const code = generateTotp(superUserTotpSecret);
      const s1 = await adminService.verifyMfa(t1, code);
      const s2 = await adminService.verifyMfa(t2, code);

      expect(s1.id).not.toBe(s2.id);
      expect((await adminService.validateSession(s1.id))?.session.id).toBe(s1.id);
      expect((await adminService.validateSession(s2.id))?.session.id).toBe(s2.id);

      // Invalidate one session leaves the other intact
      await adminService.invalidateSession(s1.id);
      expect(await adminService.validateSession(s1.id)).toBeNull();
      expect(await adminService.validateSession(s2.id)).not.toBeNull();
    });
  });

  // Category 4: Fault Injection
  describe("Category 4: Fault Injection", () => {
    it("should return null on expired session validation", async () => {
      const { mfaTicket } = await adminService.authenticate(
        "admin@example.com",
        "StrongSuperUserPassword123!",
      );
      const code = generateTotp(superUserTotpSecret);
      const session = await adminService.verifyMfa(mfaTicket, code);

      // Artificially expire the session
      const expiredSession: AdminSession = {
        ...session,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      };
      adminService.injectSessionForTesting(expiredSession);

      const check = await adminService.validateSession(session.id);
      expect(check).toBeNull();
    });
  });

  // Category 5: Security & Anti-Takeover
  describe("Category 5: Security & Anti-Takeover", () => {
    it("should prevent access if super user is suspended after login", async () => {
      const { mfaTicket } = await adminService.authenticate(
        "admin@example.com",
        "StrongSuperUserPassword123!",
      );
      const code = generateTotp(superUserTotpSecret);
      const session = await adminService.verifyMfa(mfaTicket, code);

      // Suspend user
      const tenantCtx = createTenantContext(createTenantId("default_tenant"));
      await authRepo.updateUser(tenantCtx, {
        ...superUser,
        status: "suspended",
        updatedAt: new Date().toISOString(),
      });

      const check = await adminService.validateSession(session.id);
      expect(check).toBeNull();
    });

    it("should prevent access if ADMINISTRATOR role is revoked from user", async () => {
      const { mfaTicket } = await adminService.authenticate(
        "admin@example.com",
        "StrongSuperUserPassword123!",
      );
      const code = generateTotp(superUserTotpSecret);
      const session = await adminService.verifyMfa(mfaTicket, code);

      // Remove roles
      const tenantCtx = createTenantContext(createTenantId("default_tenant"));
      const roles = await roleRepo.getMemberRoles(tenantCtx.tenantId, superUser.id, tenantCtx);
      for (const role of roles) {
        await roleRepo.removeRoleFromMember(tenantCtx.tenantId, superUser.id, role.id, tenantCtx);
      }

      const check = await adminService.validateSession(session.id);
      expect(check).toBeNull();
    });

    it("should manage auth flags and runtime secrets", async () => {
      const config = await adminService.getAuthConfig();
      expect(config.flags.length).toBeGreaterThan(0);
      expect(config.secrets.length).toBeGreaterThan(0);

      await adminService.toggleAuthFlag("auth.allow_signups", false);
      await adminService.setSecret("STRIPE_SECRET_KEY", "sk_test_12345");

      const setting = await configRepo.get("STRIPE_SECRET_KEY");
      expect(setting?.isSecret).toBe(true);
    });

    it("should manage RBAC custom roles setting", async () => {
      const rbac = await adminService.getRbac();
      expect(rbac.roles.length).toBeGreaterThan(0);
      expect(rbac.allowCustomRoles).toBe(true);

      await adminService.toggleCustomRoles(false);
      const updated = await adminService.getRbac();
      expect(updated.allowCustomRoles).toBe(false);
    });

    it("should manage tenant list, status, and plans", async () => {
      const tenants = await adminService.getTenants();
      expect(tenants.tenants.length).toBeGreaterThan(0);

      await adminService.updateTenantStatus("default_tenant", "suspended");
      const suspended = await tenantRepo.findById(
        createTenantId("default_tenant"),
        createTenantContext(createTenantId("default_tenant")),
      );
      expect(suspended?.status).toBe("suspended");

      await adminService.updateTenantPlan("default_tenant", "pro");
      const pro = await tenantRepo.findById(
        createTenantId("default_tenant"),
        createTenantContext(createTenantId("default_tenant")),
      );
      expect(pro?.plan).toBe("pro");
    });

    it("should retrieve billing view and simulate events", async () => {
      const billing = await adminService.getBilling();
      expect(billing.isStub).toBe(true);
      expect(billing.subscriptions.length).toBeGreaterThan(0);
      expect(billing.invoices.length).toBeGreaterThan(0);

      await adminService.simulateBilling("invoice.payment_succeeded", "cus_999");
      const audits = await auditRepo.query({ limit: 10 });
      expect(audits.some((a) => a.action === "billing.simulated.invoice.payment_succeeded")).toBe(
        true,
      );
    });

    it("should manage dev inspector outbox jobs and queue retries", async () => {
      adminService.addSimulatedJob({
        id: "job_dlq_1",
        eventType: "email.send",
        status: "failed",
        retryCount: 3,
        lastError: "SMTP Timeout",
        createdAt: new Date().toISOString(),
      });

      const inspector = await adminService.getDevInspector();
      expect(inspector.outboxJobs.length).toBeGreaterThan(0);
      expect(inspector.caughtEmails.length).toBeGreaterThan(0);

      await adminService.retryOutboxJob("job_dlq_1");
      const updatedInspector = await adminService.getDevInspector();
      const retried = updatedInspector.outboxJobs.find((j) => j.id === "job_dlq_1");
      expect(retried?.status).toBe("pending");
      expect(retried?.retryCount).toBe(4);

      // Non-existent job
      const notFound = await adminService.retryOutboxJob("non_existent_job");
      expect(notFound).toBe(false);
    });

    it("should throw on verifyMfa if user has no TOTP secret", async () => {
      const tenantCtx = createTenantContext(createTenantId("default_tenant"));
      const userWithoutTotp: User = {
        id: createUserId(generateUuidV7()),
        tenantId: tenantCtx.tenantId,
        email: "nototp@example.com",
        passwordHash: await hashPassword("Password123#"),
        status: "active",
        emailVerified: true,
        totpEnabled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await authRepo.createUser(tenantCtx, userWithoutTotp);

      // Create Admin role assignment for this user so authenticate passes
      const adminRole: Role = {
        id: createRoleId(generateUuidV7()),
        tenantId: tenantCtx.tenantId,
        name: "Admin2",
        permissions: ADMINISTRATOR_BIT,
        position: 100,
        isSystem: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await roleRepo.createRole(adminRole, tenantCtx);
      await roleRepo.assignRoleToMember(
        tenantCtx.tenantId,
        userWithoutTotp.id,
        adminRole.id,
        tenantCtx,
      );

      const { mfaTicket } = await adminService.authenticate("nototp@example.com", "Password123#");
      await expect(adminService.verifyMfa(mfaTicket, "123456")).rejects.toThrow(
        "User or TOTP secret not found",
      );
    });

    it("should function cleanly without optional repositories (audit, config, tenants)", async () => {
      const minimalService = new AdminService({
        authRepo,
        roleRepo,
        brandRepo,
        masterKey: VALID_MASTER_KEY,
      });

      // Dashboard stats without auditRepo
      const stats = await minimalService.getDashboardViewModel();
      expect(stats.auditEventCount).toBe(0);

      // Auth config mutators without configRepo
      await minimalService.toggleAuthFlag("auth.allow_signups", false);
      await minimalService.setSecret("TEST_SECRET", "val");

      // Tenants without tenantRepo fallback
      const tenants = await minimalService.getTenants();
      expect(tenants.tenants.length).toBe(1);

      // Billing simulation without auditRepo
      await minimalService.simulateBilling("invoice.created", "cus_test");

      // Dev inspector without auditRepo
      const inspector = await minimalService.getDevInspector();
      expect(inspector.auditLogs.length).toBe(0);
    });

    it("should throw on authenticate with wrong password or missing user", async () => {
      await expect(
        adminService.authenticate("nonexistent@example.com", "Password123!"),
      ).rejects.toThrow("Invalid email or password");

      await expect(
        adminService.authenticate("admin@example.com", "WrongPassword!"),
      ).rejects.toThrow("Invalid email or password");
    });

    it("should throw on verifyMfa with invalid ticket or invalid TOTP code", async () => {
      await expect(adminService.verifyMfa("invalid-ticket", "123456")).rejects.toThrow(
        "MFA ticket is invalid or expired",
      );

      const { mfaTicket } = await adminService.authenticate(
        "admin@example.com",
        "StrongSuperUserPassword123!",
      );

      await expect(adminService.verifyMfa(mfaTicket, "000000")).rejects.toThrow(
        "Invalid TOTP verification code",
      );
    });

    it("should invalidate session cleanly", async () => {
      const { mfaTicket } = await adminService.authenticate(
        "admin@example.com",
        "StrongSuperUserPassword123!",
      );
      const code = generateTotp(superUserTotpSecret);
      const session = await adminService.verifyMfa(mfaTicket, code);

      await adminService.invalidateSession(session.id);
      expect(await adminService.validateSession(session.id)).toBeNull();
    });
  });
});
