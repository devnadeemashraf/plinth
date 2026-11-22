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
  type HttpRequest,
  hashPassword,
} from "@plinth/core";
import { InMemoryAuditLogRepository } from "@plinth/modules-audit";
import { InMemoryAuthRepository, type User } from "@plinth/modules-auth";
import { InMemoryBrandRepository } from "@plinth/modules-brand";
import { InMemoryConfigStoreRepository } from "@plinth/modules-config-store";
import { InMemoryRoleRepository, type Role } from "@plinth/modules-rbac";
import { InMemoryTenantRepository } from "@plinth/modules-tenants";
import { beforeEach, describe, expect, it } from "vitest";
import { createAdminRoutes } from "../src/contracts/admin-routes.js";
import { AdminController } from "../src/handlers/admin-controller.js";
import { AdminService } from "../src/services/admin-service.js";

const VALID_MASTER_KEY = Buffer.from(
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  "hex",
);

function makeReq(partial: Partial<HttpRequest>): HttpRequest {
  return {
    method: "GET",
    url: "/_admin",
    path: "/_admin",
    headers: {},
    params: {},
    query: {},
    ip: "127.0.0.1",
    ...partial,
  };
}

describe("AdminController (5-Category TDD)", () => {
  let authRepo: InMemoryAuthRepository;
  let roleRepo: InMemoryRoleRepository;
  let brandRepo: InMemoryBrandRepository;
  let configRepo: InMemoryConfigStoreRepository;
  let tenantRepo: InMemoryTenantRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let adminService: AdminService;
  let controller: AdminController;

  let superUser: User;
  let superUserTotpSecret: string;

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

    // Create super user
    const { secret } = generateTotpSecret("Plinth", "admin@example.com");
    superUserTotpSecret = secret;
    const encSecret = encryptEnvelope(secret, VALID_MASTER_KEY);
    const passHash = await hashPassword("StrongAdminPassword123!");

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

    adminService = new AdminService({
      authRepo,
      roleRepo,
      brandRepo,
      configRepo,
      tenantRepo,
      auditRepo,
      masterKey: VALID_MASTER_KEY,
    });

    controller = new AdminController({
      service: adminService,
      mountPath: "/_admin",
      allowedCidrs: ["127.0.0.1/32", "::1/128"],
    });
  });

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should render login page on GET /_admin/login", async () => {
      const res = await controller.handleRequest(
        makeReq({ method: "GET", url: "/_admin/login", path: "/_admin/login" }),
      );
      expect(res.statusCode).toBe(200);
      expect(res.headers?.["content-type"]).toBe("text/html; charset=utf-8");
      expect(String(res.body)).toContain("Admin Login");
      expect(String(res.body)).toContain('name="email"');
      expect(String(res.body)).toContain('name="password"');
    });

    it("should complete full login -> MFA -> session cookie -> dashboard flow", async () => {
      // 1. POST /_admin/login
      const loginRes = await controller.handleRequest(
        makeReq({
          method: "POST",
          url: "/_admin/login",
          path: "/_admin/login",
          body: {
            email: "admin@example.com",
            password: "StrongAdminPassword123!",
          },
        }),
      );
      expect(loginRes.statusCode).toBe(303);
      expect(loginRes.headers?.["location"]).toContain("/_admin/mfa?ticket=");

      const locationStr = String(loginRes.headers?.["location"] ?? "");
      const ticket = locationStr.split("ticket=")[1] ?? "";

      // 2. GET /_admin/mfa
      const mfaPageRes = await controller.handleRequest(
        makeReq({
          method: "GET",
          url: `/_admin/mfa?ticket=${ticket}`,
          path: "/_admin/mfa",
          query: { ticket },
        }),
      );
      expect(mfaPageRes.statusCode).toBe(200);
      expect(String(mfaPageRes.body)).toContain("Two-Factor Authentication");

      // 3. POST /_admin/mfa with valid code
      const code = generateTotp(superUserTotpSecret);
      const mfaVerifyRes = await controller.handleRequest(
        makeReq({
          method: "POST",
          url: "/_admin/mfa",
          path: "/_admin/mfa",
          body: {
            mfaTicket: ticket,
            totpCode: code,
          },
        }),
      );
      expect(mfaVerifyRes.statusCode).toBe(303);
      expect(mfaVerifyRes.headers?.["location"]).toBe("/_admin");
      expect(mfaVerifyRes.headers?.["set-cookie"]).toBeDefined();
      const cookieHeader = String(mfaVerifyRes.headers?.["set-cookie"]);
      expect(cookieHeader).toContain("plinth_admin_session=");

      const sessionId = cookieHeader.split("plinth_admin_session=")[1]?.split(";")[0];

      // 4. GET /_admin with session cookie
      const dashboardRes = await controller.handleRequest(
        makeReq({
          method: "GET",
          url: "/_admin",
          path: "/_admin",
          headers: {
            cookie: `plinth_admin_session=${sessionId}`,
          },
        }),
      );
      expect(dashboardRes.statusCode).toBe(200);
      expect(String(dashboardRes.body)).toContain("System &amp; Runtime Overview");
      expect(String(dashboardRes.body)).toContain("admin@example.com");
    });

    it("should update brand settings on POST /_admin/brand", async () => {
      // First get a session
      const { mfaTicket } = await adminService.authenticate(
        "admin@example.com",
        "StrongAdminPassword123!",
      );
      const code = generateTotp(superUserTotpSecret);
      const session = await adminService.verifyMfa(mfaTicket, code);

      const res = await controller.handleRequest(
        makeReq({
          method: "POST",
          url: "/_admin/brand",
          path: "/_admin/brand",
          headers: {
            cookie: `plinth_admin_session=${session.id}`,
          },
          body: {
            _csrf: session.csrfToken,
            name: "Updated Plinth Enterprise",
            tagline: "Ultra Resilient",
            primaryColorHex: "#2563eb",
            secondaryColorHex: "#1e40af",
            accentColorHex: "#3b82f6",
          },
        }),
      );

      expect(res.statusCode).toBe(303);
      expect(res.headers?.["location"]).toContain("/_admin/brand");

      const brand = await brandRepo.get();
      expect(brand?.name).toBe("Updated Plinth Enterprise");
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should redirect unauthenticated requests to /_admin/login", async () => {
      const res = await controller.handleRequest(
        makeReq({
          method: "GET",
          url: "/_admin",
          path: "/_admin",
        }),
      );
      expect(res.statusCode).toBe(303);
      expect(res.headers?.["location"]).toBe("/_admin/login");
    });

    it("should re-render login with error on wrong password", async () => {
      const res = await controller.handleRequest(
        makeReq({
          method: "POST",
          url: "/_admin/login",
          path: "/_admin/login",
          body: {
            email: "admin@example.com",
            password: "WrongPassword123!",
          },
        }),
      );
      expect(res.statusCode).toBe(200);
      expect(String(res.body)).toContain("Invalid email or password");
    });

    it("should re-render MFA with error on wrong TOTP code", async () => {
      const { mfaTicket } = await adminService.authenticate(
        "admin@example.com",
        "StrongAdminPassword123!",
      );

      const res = await controller.handleRequest(
        makeReq({
          method: "POST",
          url: "/_admin/mfa",
          path: "/_admin/mfa",
          body: {
            mfaTicket,
            totpCode: "000000",
          },
        }),
      );
      expect(res.statusCode).toBe(200);
      expect(String(res.body)).toContain("Invalid TOTP verification code");
    });
  });

  // Category 3: Security & CSRF Protection
  describe("Category 3: Security & CSRF Protection", () => {
    it("should reject mutating POST request when CSRF token is missing", async () => {
      const { mfaTicket } = await adminService.authenticate(
        "admin@example.com",
        "StrongAdminPassword123!",
      );
      const code = generateTotp(superUserTotpSecret);
      const session = await adminService.verifyMfa(mfaTicket, code);

      const res = await controller.handleRequest(
        makeReq({
          method: "POST",
          url: "/_admin/brand",
          path: "/_admin/brand",
          headers: {
            cookie: `plinth_admin_session=${session.id}`,
          },
          body: {
            name: "CSRF Attack Attempt",
            // _csrf omitted
          },
        }),
      );

      expect(res.statusCode).toBe(403);
      expect(String(res.body)).toContain("CSRF");
    });

    it("should reject mutating POST request when CSRF token is mismatched", async () => {
      const { mfaTicket } = await adminService.authenticate(
        "admin@example.com",
        "StrongAdminPassword123!",
      );
      const code = generateTotp(superUserTotpSecret);
      const session = await adminService.verifyMfa(mfaTicket, code);

      const res = await controller.handleRequest(
        makeReq({
          method: "POST",
          url: "/_admin/brand",
          path: "/_admin/brand",
          headers: {
            cookie: `plinth_admin_session=${session.id}`,
          },
          body: {
            _csrf: "invalid-token",
            name: "CSRF Attack Attempt",
          },
        }),
      );

      expect(res.statusCode).toBe(403);
      expect(String(res.body)).toContain("CSRF");
    });

    it("should enforce strict CSP header on all responses", async () => {
      const res = await controller.handleRequest(
        makeReq({ method: "GET", url: "/_admin/login", path: "/_admin/login" }),
      );
      expect(res.headers?.["content-security-policy"]).toBeDefined();
      expect(res.headers?.["content-security-policy"]).toContain("default-src 'self'");
      expect(res.headers?.["content-security-policy"]).toContain("script-src 'none'");
    });
  });

  // Category 4: Fault Injection & CIDR Restriction
  describe("Category 4: Fault Injection & CIDR Restriction", () => {
    it("should immediately reject requests from disallowed IP with 403 Forbidden", async () => {
      const res = await controller.handleRequest(
        makeReq({
          method: "GET",
          url: "/_admin/login",
          path: "/_admin/login",
          ip: "198.51.100.42", // Not in 127.0.0.1/32 or ::1/128
        }),
      );

      expect(res.statusCode).toBe(403);
      expect(String(res.body)).toContain("IP allowlist");
    });
  });

  // Category 5: Logout & Session Invalidation
  describe("Category 5: Logout & Session Invalidation", () => {
    it("should invalidate session and clear cookie on POST /_admin/logout", async () => {
      const { mfaTicket } = await adminService.authenticate(
        "admin@example.com",
        "StrongAdminPassword123!",
      );
      const code = generateTotp(superUserTotpSecret);
      const session = await adminService.verifyMfa(mfaTicket, code);

      const res = await controller.handleRequest(
        makeReq({
          method: "POST",
          url: "/_admin/logout",
          path: "/_admin/logout",
          headers: {
            cookie: `plinth_admin_session=${session.id}`,
          },
          body: {
            _csrf: session.csrfToken,
          },
        }),
      );

      expect(res.statusCode).toBe(303);
      expect(res.headers?.["location"]).toBe("/_admin/login");
      expect(String(res.headers?.["set-cookie"])).toContain("Max-Age=0");

      // Verify session was destroyed
      expect(await adminService.validateSession(session.id)).toBeNull();
    });
  });

  // Category 6: Sub-Panels End-to-End HTTP Handlers
  describe("Category 6: Sub-Panels End-to-End HTTP Handlers", () => {
    let sessionCookie: string;
    let csrfToken: string;

    beforeEach(async () => {
      const { mfaTicket } = await adminService.authenticate(
        "admin@example.com",
        "StrongAdminPassword123!",
      );
      const code = generateTotp(superUserTotpSecret);
      const session = await adminService.verifyMfa(mfaTicket, code);
      sessionCookie = `plinth_admin_session=${session.id}`;
      csrfToken = session.csrfToken;
    });

    it("should handle GET and POST for /_admin/auth sub-panel", async () => {
      const getRes = await controller.handleRequest(
        makeReq({
          method: "GET",
          url: "/_admin/auth",
          path: "/_admin/auth",
          headers: { cookie: sessionCookie },
        }),
      );
      expect(getRes.statusCode).toBe(200);

      const toggleRes = await controller.handleRequest(
        makeReq({
          method: "POST",
          url: "/_admin/auth/toggle",
          path: "/_admin/auth/toggle",
          headers: { cookie: sessionCookie },
          body: { _csrf: csrfToken, key: "auth.allow_signups", enabled: "true" },
        }),
      );
      expect(toggleRes.statusCode).toBe(303);
      expect(toggleRes.headers?.["location"]).toContain("/_admin/auth");

      const secretRes = await controller.handleRequest(
        makeReq({
          method: "POST",
          url: "/_admin/auth/secret",
          path: "/_admin/auth/secret",
          headers: { cookie: sessionCookie },
          body: { _csrf: csrfToken, key: "JWT_SECRET", value: "super-secret-key-1234" },
        }),
      );
      expect(secretRes.statusCode).toBe(303);
      expect(secretRes.headers?.["location"]).toContain("/_admin/auth");
    });

    it("should handle GET and POST for /_admin/rbac sub-panel", async () => {
      const getRes = await controller.handleRequest(
        makeReq({
          method: "GET",
          url: "/_admin/rbac",
          path: "/_admin/rbac",
          headers: { cookie: sessionCookie },
        }),
      );
      expect(getRes.statusCode).toBe(200);

      const toggleRes = await controller.handleRequest(
        makeReq({
          method: "POST",
          url: "/_admin/rbac/toggle-custom",
          path: "/_admin/rbac/toggle-custom",
          headers: { cookie: sessionCookie },
          body: { _csrf: csrfToken, allowCustomRoles: "false" },
        }),
      );
      expect(toggleRes.statusCode).toBe(303);
      expect(toggleRes.headers?.["location"]).toContain("/_admin/rbac");
    });

    it("should handle GET and POST for /_admin/tenants sub-panel", async () => {
      const getRes = await controller.handleRequest(
        makeReq({
          method: "GET",
          url: "/_admin/tenants",
          path: "/_admin/tenants",
          headers: { cookie: sessionCookie },
        }),
      );
      expect(getRes.statusCode).toBe(200);

      const statusRes = await controller.handleRequest(
        makeReq({
          method: "POST",
          url: "/_admin/tenants/status",
          path: "/_admin/tenants/status",
          headers: { cookie: sessionCookie },
          body: { _csrf: csrfToken, tenantId: "default_tenant", status: "active" },
        }),
      );
      expect(statusRes.statusCode).toBe(303);
      expect(statusRes.headers?.["location"]).toContain("/_admin/tenants");

      const planRes = await controller.handleRequest(
        makeReq({
          method: "POST",
          url: "/_admin/tenants/plan",
          path: "/_admin/tenants/plan",
          headers: { cookie: sessionCookie },
          body: { _csrf: csrfToken, tenantId: "default_tenant", plan: "pro" },
        }),
      );
      expect(planRes.statusCode).toBe(303);
      expect(planRes.headers?.["location"]).toContain("/_admin/tenants");
    });

    it("should handle GET and POST for /_admin/billing sub-panel", async () => {
      const getRes = await controller.handleRequest(
        makeReq({
          method: "GET",
          url: "/_admin/billing",
          path: "/_admin/billing",
          headers: { cookie: sessionCookie },
        }),
      );
      expect(getRes.statusCode).toBe(200);

      const simRes = await controller.handleRequest(
        makeReq({
          method: "POST",
          url: "/_admin/billing/simulate",
          path: "/_admin/billing/simulate",
          headers: { cookie: sessionCookie },
          body: { _csrf: csrfToken, eventType: "invoice.paid", customerId: "cus_123" },
        }),
      );
      expect(simRes.statusCode).toBe(303);
      expect(simRes.headers?.["location"]).toContain("/_admin/billing");
    });

    it("should handle GET and POST for /_admin/dev sub-panel", async () => {
      adminService.addSimulatedJob({
        id: "retry_job_1",
        eventType: "analytics.track",
        status: "failed",
        retryCount: 1,
        createdAt: new Date().toISOString(),
      });

      const getRes = await controller.handleRequest(
        makeReq({
          method: "GET",
          url: "/_admin/dev",
          path: "/_admin/dev",
          headers: { cookie: sessionCookie },
        }),
      );
      expect(getRes.statusCode).toBe(200);

      const retryRes = await controller.handleRequest(
        makeReq({
          method: "POST",
          url: "/_admin/dev/queue/retry",
          path: "/_admin/dev/queue/retry",
          headers: { cookie: sessionCookie },
          body: { _csrf: csrfToken, jobId: "retry_job_1" },
        }),
      );
      expect(retryRes.statusCode).toBe(303);
      expect(retryRes.headers?.["location"]).toContain("/_admin/dev");
    });

    it("should reject mutating request with missing or mismatched CSRF token", async () => {
      const res = await controller.handleRequest(
        makeReq({
          method: "POST",
          url: "/_admin/brand",
          path: "/_admin/brand",
          headers: { cookie: sessionCookie },
          body: { _csrf: "invalid-token" },
        }),
      );
      expect(res.statusCode).toBe(403);
      expect(String(res.body)).toContain("CSRF");
    });

    it("should accept CSRF token passed via x-csrf-token header", async () => {
      const res = await controller.handleRequest(
        makeReq({
          method: "POST",
          url: "/_admin/auth/toggle",
          path: "/_admin/auth/toggle",
          headers: {
            cookie: sessionCookie,
            "x-csrf-token": csrfToken,
          },
          body: { key: "auth.allow_signups", enabled: "true" },
        }),
      );
      expect(res.statusCode).toBe(303);
    });

    it("should redirect unknown paths within admin mount to dashboard", async () => {
      const res = await controller.handleRequest(
        makeReq({
          method: "GET",
          url: "/_admin/unknown-page",
          path: "/_admin/unknown-page",
          headers: { cookie: sessionCookie },
        }),
      );
      expect(res.statusCode).toBe(303);
      expect(res.headers?.["location"]).toBe("/_admin");
    });

    it("should define all admin route contracts via createAdminRoutes", () => {
      const routes = createAdminRoutes("/_admin");
      expect(Object.keys(routes).length).toBe(20);
      expect(routes["getLogin"]?.path).toBe("/_admin/login");
      expect(routes["getBrand"]?.path).toBe("/_admin/brand");
      expect(routes["getDev"]?.path).toBe("/_admin/dev");
    });

    it("should support production secure cookies and empty CIDRs", async () => {
      const prodController = new AdminController({
        service: adminService,
        mountPath: "/_admin",
        allowedCidrs: [],
        isProduction: true,
      });

      const { mfaTicket } = await adminService.authenticate(
        "admin@example.com",
        "StrongAdminPassword123!",
      );
      const code = generateTotp(superUserTotpSecret);

      const mfaRes = await prodController.handleRequest(
        makeReq({
          method: "POST",
          url: "/_admin/mfa",
          path: "/_admin/mfa",
          body: { mfaTicket, totpCode: code },
        }),
      );
      expect(mfaRes.statusCode).toBe(303);
      expect(String(mfaRes.headers?.["set-cookie"])).toContain("; Secure");
    });

    it("should render flash messages and handle query parameters", async () => {
      const successRes = await controller.handleRequest(
        makeReq({
          method: "GET",
          url: "/_admin?success=Action+Completed",
          path: "/_admin",
          query: { success: "Action Completed" },
          headers: { cookie: [sessionCookie] },
        }),
      );
      expect(successRes.statusCode).toBe(200);
      expect(String(successRes.body)).toContain("Action Completed");

      const errorRes = await controller.handleRequest(
        makeReq({
          method: "GET",
          url: "/_admin?error=Something+Failed",
          path: "/_admin",
          query: { error: "Something Failed" },
          headers: { cookie: sessionCookie },
        }),
      );
      expect(errorRes.statusCode).toBe(200);
      expect(String(errorRes.body)).toContain("Something Failed");
    });

    it("should handle tenant plan mutations with enterprise and invalid fallback plans", async () => {
      const entRes = await controller.handleRequest(
        makeReq({
          method: "POST",
          url: "/_admin/tenants/plan",
          path: "/_admin/tenants/plan",
          headers: { cookie: sessionCookie },
          body: { _csrf: csrfToken, tenantId: "default_tenant", plan: "enterprise" },
        }),
      );
      expect(entRes.statusCode).toBe(303);

      const fallbackRes = await controller.handleRequest(
        makeReq({
          method: "POST",
          url: "/_admin/tenants/plan",
          path: "/_admin/tenants/plan",
          headers: { cookie: sessionCookie },
          body: { _csrf: csrfToken, tenantId: "default_tenant", plan: "invalid_plan" },
        }),
      );
      expect(fallbackRes.statusCode).toBe(303);
    });
  });
});
