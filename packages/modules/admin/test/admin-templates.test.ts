import { createRoleId, createTenantId } from "@plinth/core";
import { DEFAULT_BRAND_CONFIG } from "@plinth/modules-brand";
import { describe, expect, it } from "vitest";
import { renderAuthConfigView } from "../src/templates/auth-config.js";
import { renderBillingView } from "../src/templates/billing.js";
import { renderBrandView } from "../src/templates/brand.js";
import { renderDashboardView } from "../src/templates/dashboard.js";
import { renderDevInspectorView } from "../src/templates/dev-inspector.js";
import { escapeHtml, rawHtml, safeHtml } from "../src/templates/escape.js";
import { ADMIN_CSP_HEADER, renderAdminLayout } from "../src/templates/layout.js";
import { renderLoginPage, renderMfaPage } from "../src/templates/login.js";
import { renderRbacView } from "../src/templates/rbac.js";
import { renderTenantsView } from "../src/templates/tenants.js";

describe("Admin SSR Templates & Zero-Build HTML Engine (5-Category TDD)", () => {
  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should render a complete HTML5 document with Brand CSS custom properties", () => {
      const html = renderAdminLayout({
        title: "Test Dashboard",
        brand: DEFAULT_BRAND_CONFIG,
        csrfToken: "test-csrf-token-123",
        currentPath: "/_admin",
        userEmail: "admin@example.com",
        bodyHtml: "<p>Hello Admin</p>",
      });

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain('<html lang="en">');
      expect(html).toContain(DEFAULT_BRAND_CONFIG.name);
      expect(html).toContain(`--brand-primary: ${DEFAULT_BRAND_CONFIG.primaryColorHex}`);
      expect(html).toContain("admin@example.com");
      expect(html).toContain("<p>Hello Admin</p>");
      expect(html).toContain("test-csrf-token-123");
    });

    it("should render navigation links for all sub-panels", () => {
      const html = renderAdminLayout({
        title: "Nav Test",
        brand: DEFAULT_BRAND_CONFIG,
        csrfToken: "csrf-token",
        currentPath: "/_admin",
        userEmail: "admin@example.com",
        bodyHtml: "",
      });

      expect(html).toContain('href="/_admin"');
      expect(html).toContain('href="/_admin/brand"');
      expect(html).toContain('href="/_admin/auth"');
      expect(html).toContain('href="/_admin/rbac"');
      expect(html).toContain('href="/_admin/tenants"');
      expect(html).toContain('href="/_admin/billing"');
      expect(html).toContain('href="/_admin/dev"');
    });

    it("should render login and MFA pages cleanly", () => {
      const loginHtml = renderLoginPage({
        brand: DEFAULT_BRAND_CONFIG,
        csrfToken: "csrf-login-1",
      });
      expect(loginHtml).toContain('type="email"');
      expect(loginHtml).toContain('type="password"');
      expect(loginHtml).toContain('name="_csrf"');

      const mfaHtml = renderMfaPage({
        brand: DEFAULT_BRAND_CONFIG,
        mfaTicket: "ticket-xyz",
        csrfToken: "csrf-mfa-1",
      });
      expect(mfaHtml).toContain('name="totpCode"');
      expect(mfaHtml).toContain('name="mfaTicket"');
      expect(mfaHtml).toContain('value="ticket-xyz"');

      // Login & MFA with errors and custom mountPath
      const loginWithError = renderLoginPage({
        brand: DEFAULT_BRAND_CONFIG,
        csrfToken: "csrf-login-2",
        error: "Invalid email or password",
        mountPath: "/custom-admin",
      });
      expect(loginWithError).toContain("Invalid email or password");
      expect(loginWithError).toContain('action="/custom-admin/login"');

      const mfaWithError = renderMfaPage({
        brand: DEFAULT_BRAND_CONFIG,
        mfaTicket: "ticket-123",
        csrfToken: "csrf-mfa-2",
        error: "Invalid TOTP code",
        mountPath: "/custom-admin",
      });
      expect(mfaWithError).toContain("Invalid TOTP code");
      expect(mfaWithError).toContain('action="/custom-admin/mfa"');
    });
  });

  // Category 2: Boundary & XSS Prevention
  describe("Category 2: Boundary & XSS Prevention", () => {
    it("should escape all dangerous HTML characters (&, <, >, \", ')", () => {
      const malicious = `<script>alert("XSS & 'injection'")</script>`;
      const escaped = escapeHtml(malicious);
      expect(escaped).toBe(
        "&lt;script&gt;alert(&quot;XSS &amp; &#39;injection&#39;&quot;)&lt;/script&gt;",
      );
      expect(escaped).not.toContain("<script>");
    });

    it("should handle null, undefined, and non-string inputs safely", () => {
      expect(escapeHtml(undefined)).toBe("");
      expect(escapeHtml(null)).toBe("");
      expect(escapeHtml(12345)).toBe("12345");
      expect(escapeHtml(true)).toBe("true");
    });

    it("should escape interpolated values in safeHtml template tag", () => {
      const userInput = "<img src=x onerror=alert(1)>";
      const result = safeHtml`<div>User: ${userInput}</div>`;
      expect(result).toBe("<div>User: &lt;img src=x onerror=alert(1)&gt;</div>");
      expect(result).not.toContain("<img");
    });

    it("should escape userEmail and brand fields in layout", () => {
      const html = renderAdminLayout({
        title: '"><script>alert(1)</script>',
        brand: {
          ...DEFAULT_BRAND_CONFIG,
          name: 'EvilCorp <script>alert("XSS")</script>',
        },
        csrfToken: 'csrf"onfocus="alert(1)',
        currentPath: "/_admin",
        userEmail: '<evil>&"user@example.com',
        bodyHtml: "safe content",
      });

      expect(html).not.toContain("<script>alert(1)</script>");
      expect(html).not.toContain('<script>alert("XSS")</script>');
      expect(html).toContain("&lt;evil&gt;&amp;&quot;user@example.com");
    });
  });

  // Category 3: Security & Strict CSP
  describe("Category 3: Security & Strict CSP", () => {
    it("should define strict CSP containing zero inline scripts", () => {
      expect(ADMIN_CSP_HEADER).toContain("default-src 'self'");
      expect(ADMIN_CSP_HEADER).toContain("script-src 'none'");
      expect(ADMIN_CSP_HEADER).toContain("frame-ancestors 'none'");
      expect(ADMIN_CSP_HEADER).toContain("object-src 'none'");
    });

    it("should not contain any <script> tags in rendered HTML", () => {
      const html = renderAdminLayout({
        title: "Zero-Script Verification",
        brand: DEFAULT_BRAND_CONFIG,
        csrfToken: "csrf-token",
        currentPath: "/_admin",
        userEmail: "admin@example.com",
        bodyHtml: "<p>Static content</p>",
      });

      expect(html).not.toContain("<script");
      expect(html).not.toContain("</script>");
      expect(html).not.toContain("javascript:");
      expect(html).not.toContain("onerror=");
      expect(html).not.toContain("onload=");
    });
  });

  // Category 4: Flash Messages & Feedback
  describe("Category 4: Flash Messages & Feedback", () => {
    it("should render success and error alert banners when provided", () => {
      const htmlWithSuccess = renderAdminLayout({
        title: "Success Test",
        brand: DEFAULT_BRAND_CONFIG,
        csrfToken: "csrf",
        currentPath: "/_admin",
        userEmail: "admin@example.com",
        bodyHtml: "",
        message: "Settings saved successfully!",
      });
      expect(htmlWithSuccess).toContain("Settings saved successfully!");

      const htmlWithError = renderAdminLayout({
        title: "Error Test",
        brand: DEFAULT_BRAND_CONFIG,
        csrfToken: "csrf",
        currentPath: "/_admin",
        userEmail: "admin@example.com",
        bodyHtml: "",
        error: "Failed to update configuration",
      });
      expect(htmlWithError).toContain("Failed to update configuration");
    });
  });

  // Category 5: Sub-Panel View Renderers
  describe("Category 5: Sub-Panel View Renderers", () => {
    it("should render Dashboard view with system metrics", () => {
      const html = renderDashboardView({
        uptimeSec: 3600,
        nodeVersion: "v24.0.0",
        memoryMb: 128,
        tenantCount: 5,
        userCount: 42,
        roleCount: 6,
        auditEventCount: 100,
        dbHealthy: true,
      });
      expect(html).toContain("v24.0.0");
      expect(html).toContain("128 MB");
      expect(html).toContain("42");
    });

    it("should render Brand view with form fields and CSRF token", () => {
      const html = renderBrandView(DEFAULT_BRAND_CONFIG, "csrf-brand-test", "/_admin");
      expect(html).toContain(DEFAULT_BRAND_CONFIG.name);
      expect(html).toContain('name="_csrf" value="csrf-brand-test"');
      expect(html).toContain('name="primaryColorHex"');
    });

    it("should render Auth Config view with flags and secrets", () => {
      const html = renderAuthConfigView(
        {
          flags: [{ key: "auth.mfa_enforced", enabled: true, description: "Desc" }],
          secrets: [{ key: "AUTH_SECRET", maskedValue: "[ENCRYPTED_SECRET]", description: "Desc" }],
        },
        "csrf-auth-test",
        "/_admin",
      );
      expect(html).toContain("auth.mfa_enforced");
      expect(html).toContain("AUTH_SECRET");
      expect(html).toContain("csrf-auth-test");
    });

    it("should render RBAC view with role lists", () => {
      const html = renderRbacView(
        {
          roles: [
            {
              id: createRoleId("role_1"),
              tenantId: createTenantId("default_tenant"),
              name: "Super Administrator",
              permissions: 18446744073709551615n,
              isSystem: true,
              position: 100,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          allowCustomRoles: true,
        },
        "csrf-rbac-test",
        "/_admin",
      );
      expect(html).toContain("Super Administrator");
      expect(html).toContain("csrf-rbac-test");
    });

    it("should render Tenants view with tenant items and status badges", () => {
      const html = renderTenantsView(
        {
          tenants: [
            {
              id: createTenantId("tenant_1"),
              slug: "acme-corp",
              name: "Acme Corp",
              status: "active",
              plan: "enterprise",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        },
        "csrf-tenants-test",
        "/_admin",
      );
      expect(html).toContain("Acme Corp");
      expect(html).toContain("acme-corp");
      expect(html).toContain("csrf-tenants-test");
    });

    it("should render Billing view with subscriptions and invoices", () => {
      const html = renderBillingView(
        {
          isStub: true,
          subscriptions: [
            {
              id: "sub_1",
              customerId: "cus_1",
              planId: "pro",
              status: "active",
              currentPeriodEnd: new Date().toISOString(),
            },
          ],
          invoices: [
            {
              id: "inv_1",
              customerId: "cus_1",
              amount: 2900,
              currency: "usd",
              status: "paid",
              createdAt: new Date().toISOString(),
            },
          ],
        },
        "csrf-billing-test",
        "/_admin",
      );
      expect(html).toContain("sub_1");
      expect(html).toContain("inv_1");
      expect(html).toContain("csrf-billing-test");
    });

    it("should render Dev Inspector view with audit logs, outbox jobs, and emails", () => {
      const html = renderDevInspectorView(
        {
          auditLogs: [
            {
              id: "audit_1",
              actorType: "user",
              action: "auth.login",
              resourceType: "session",
              createdAt: new Date().toISOString(),
            },
          ],
          outboxJobs: [
            {
              id: "job_1",
              eventType: "user.registered",
              status: "failed",
              retryCount: 3,
              lastError: "Connection timeout",
              createdAt: new Date().toISOString(),
            },
          ],
          caughtEmails: [
            {
              id: "email_1",
              to: "test@example.com",
              subject: "Test Email",
              sentAt: new Date().toISOString(),
            },
          ],
        },
        "csrf-dev-test",
        "/_admin",
      );
      expect(html).toContain("auth.login");
      expect(html).toContain("job_1");
      expect(html).toContain("Connection timeout");
      expect(html).toContain("test@example.com");
    });

    it("should handle rawHtml directly without double escaping", () => {
      const raw = rawHtml("<span class='bold'>Hello</span>");
      const safe = safeHtml`<div>${raw}</div>`;
      expect(safe).toBe("<div><span class='bold'>Hello</span></div>");
    });
  });
});
