import { type HttpRequest, type HttpResponse, isIpAllowedByCidrs } from "@plinth/core";
import type { BrandConfig } from "@plinth/modules-brand";
import type { TenantPlan } from "@plinth/modules-tenants";
import type { AdminService } from "../services/admin-service.js";
import { renderAuthConfigView } from "../templates/auth-config.js";
import { renderBillingView } from "../templates/billing.js";
import { renderBrandView } from "../templates/brand.js";
import { renderDashboardView } from "../templates/dashboard.js";
import { renderDevInspectorView } from "../templates/dev-inspector.js";
import { ADMIN_CSP_HEADER, renderAdminLayout } from "../templates/layout.js";
import { renderLoginPage, renderMfaPage } from "../templates/login.js";
import { renderRbacView } from "../templates/rbac.js";
import { renderTenantsView } from "../templates/tenants.js";

export interface AdminControllerOptions {
  readonly service: AdminService;
  readonly mountPath?: string | undefined;
  readonly allowedCidrs?: readonly string[] | undefined;
  readonly isProduction?: boolean | undefined;
}

function parseCookies(cookieHeader?: string | string[]): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }
  const raw = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;
  const result: Record<string, string> = {};
  for (const pair of raw.split(";")) {
    const [k, ...v] = pair.trim().split("=");
    if (k) {
      result[k] = decodeURIComponent(v.join("="));
    }
  }
  return result;
}

export class AdminController {
  readonly #service: AdminService;
  readonly #mountPath: string;
  readonly #allowedCidrs: readonly string[];
  readonly #isProduction: boolean;

  constructor(options: AdminControllerOptions) {
    this.#service = options.service;
    this.#mountPath = options.mountPath ?? "/_admin";
    this.#allowedCidrs = options.allowedCidrs ?? [];
    this.#isProduction = options.isProduction ?? false;
  }

  get mountPath(): string {
    return this.#mountPath;
  }

  async handleRequest(req: HttpRequest): Promise<HttpResponse> {
    // 1. Enforce CIDR IP Allowlist
    if (this.#allowedCidrs.length > 0 && !isIpAllowedByCidrs(req.ip, this.#allowedCidrs)) {
      return {
        statusCode: 403,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-security-policy": ADMIN_CSP_HEADER,
        },
        body: "<h1>403 Forbidden</h1><p>Admin access is restricted by IP allowlist.</p>",
      };
    }

    const path = req.path;
    const method = req.method;
    const cookies = parseCookies(req.headers["cookie"]);
    const sessionId = cookies["plinth_admin_session"];
    const body = (req.body as Record<string, unknown>) ?? {};

    // Base security headers for all admin responses
    const baseHeaders = {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": ADMIN_CSP_HEADER,
      "x-frame-options": "DENY",
      "x-content-type-options": "nosniff",
    };

    // --- Authentication Routes (Login, MFA, Logout) ---

    // GET /_admin/login
    if (path === `${this.#mountPath}/login` && method === "GET") {
      const brand = await this.#service.getBrand();
      const html = renderLoginPage({
        brand,
        csrfToken: "login_token",
        mountPath: this.#mountPath,
      });
      return { statusCode: 200, headers: baseHeaders, body: html };
    }

    // POST /_admin/login
    if (path === `${this.#mountPath}/login` && method === "POST") {
      const email = typeof body["email"] === "string" ? body["email"] : "";
      const password = typeof body["password"] === "string" ? body["password"] : "";

      try {
        const { mfaTicket } = await this.#service.authenticate(email, password);
        return {
          statusCode: 303,
          headers: {
            ...baseHeaders,
            location: `${this.#mountPath}/mfa?ticket=${encodeURIComponent(mfaTicket)}`,
          },
        };
      } catch (err) {
        const brand = await this.#service.getBrand();
        const html = renderLoginPage({
          brand,
          csrfToken: "login_token",
          error: err instanceof Error ? err.message : "Invalid email or password.",
          mountPath: this.#mountPath,
        });
        return { statusCode: 200, headers: baseHeaders, body: html };
      }
    }

    // GET /_admin/mfa
    if (path === `${this.#mountPath}/mfa` && method === "GET") {
      const ticket = typeof req.query["ticket"] === "string" ? req.query["ticket"] : "";
      const brand = await this.#service.getBrand();
      const html = renderMfaPage({
        brand,
        mfaTicket: ticket,
        csrfToken: "mfa_token",
        mountPath: this.#mountPath,
      });
      return { statusCode: 200, headers: baseHeaders, body: html };
    }

    // POST /_admin/mfa
    if (path === `${this.#mountPath}/mfa` && method === "POST") {
      const mfaTicket = typeof body["mfaTicket"] === "string" ? body["mfaTicket"] : "";
      const totpCode = typeof body["totpCode"] === "string" ? body["totpCode"] : "";

      try {
        const session = await this.#service.verifyMfa(mfaTicket, totpCode);
        const cookieVal = `plinth_admin_session=${session.id}; Path=/; HttpOnly; SameSite=Lax${this.#isProduction ? "; Secure" : ""}`;
        return {
          statusCode: 303,
          headers: {
            ...baseHeaders,
            location: this.#mountPath,
            "set-cookie": cookieVal,
          },
        };
      } catch (err) {
        const brand = await this.#service.getBrand();
        const html = renderMfaPage({
          brand,
          mfaTicket,
          csrfToken: "mfa_token",
          error: err instanceof Error ? err.message : "Invalid TOTP verification code.",
          mountPath: this.#mountPath,
        });
        return { statusCode: 200, headers: baseHeaders, body: html };
      }
    }

    // POST /_admin/logout
    if (path === `${this.#mountPath}/logout` && method === "POST") {
      if (sessionId) {
        await this.#service.invalidateSession(sessionId);
      }
      return {
        statusCode: 303,
        headers: {
          ...baseHeaders,
          location: `${this.#mountPath}/login`,
          "set-cookie": "plinth_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
        },
      };
    }

    // --- Authenticated Area: Validate Session ---

    const auth = sessionId ? await this.#service.validateSession(sessionId) : null;
    if (!auth) {
      return {
        statusCode: 303,
        headers: {
          ...baseHeaders,
          location: `${this.#mountPath}/login`,
        },
      };
    }

    const { session, user } = auth;
    const brand = await this.#service.getBrand();
    const flashSuccess =
      typeof req.query["success"] === "string" ? req.query["success"] : undefined;
    const flashError = typeof req.query["error"] === "string" ? req.query["error"] : undefined;

    // Mutating request CSRF validation
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      const formCsrf =
        typeof body["_csrf"] === "string"
          ? body["_csrf"]
          : Array.isArray(req.headers["x-csrf-token"])
            ? req.headers["x-csrf-token"][0]
            : req.headers["x-csrf-token"];

      if (!formCsrf || formCsrf !== session.csrfToken) {
        return {
          statusCode: 403,
          headers: baseHeaders,
          body: "<h1>403 Forbidden</h1><p>CSRF token validation failed.</p>",
        };
      }
    }

    // --- Panel Routing ---

    // 1. Dashboard: GET /_admin
    if (path === this.#mountPath && method === "GET") {
      const stats = await this.#service.getDashboardViewModel();
      const bodyHtml = renderDashboardView(stats);
      const layoutHtml = renderAdminLayout({
        title: "Dashboard",
        brand,
        csrfToken: session.csrfToken,
        currentPath: path,
        userEmail: user.email,
        bodyHtml,
        mountPath: this.#mountPath,
        message: flashSuccess,
        error: flashError,
      });
      return { statusCode: 200, headers: baseHeaders, body: layoutHtml };
    }

    // 2. Brand: GET & POST /_admin/brand
    if (path === `${this.#mountPath}/brand`) {
      if (method === "GET") {
        const bodyHtml = renderBrandView(brand, session.csrfToken, this.#mountPath);
        const layoutHtml = renderAdminLayout({
          title: "Brand Customization",
          brand,
          csrfToken: session.csrfToken,
          currentPath: path,
          userEmail: user.email,
          bodyHtml,
          mountPath: this.#mountPath,
          message: flashSuccess,
          error: flashError,
        });
        return { statusCode: 200, headers: baseHeaders, body: layoutHtml };
      }

      if (method === "POST") {
        const brandUpdate: Partial<BrandConfig> = {};
        if (typeof body["name"] === "string") brandUpdate.name = body["name"];
        if (typeof body["tagline"] === "string") brandUpdate.tagline = body["tagline"];
        if (typeof body["primaryColorHex"] === "string")
          brandUpdate.primaryColorHex = body["primaryColorHex"];
        if (typeof body["secondaryColorHex"] === "string")
          brandUpdate.secondaryColorHex = body["secondaryColorHex"];
        if (typeof body["accentColorHex"] === "string")
          brandUpdate.accentColorHex = body["accentColorHex"];
        if (typeof body["supportEmail"] === "string")
          brandUpdate.supportEmail = body["supportEmail"];
        if (typeof body["emailFooterHtml"] === "string")
          brandUpdate.emailFooterHtml = body["emailFooterHtml"];
        if (typeof body["legalTermsUrl"] === "string")
          brandUpdate.legalTermsUrl = body["legalTermsUrl"];
        if (typeof body["legalPrivacyUrl"] === "string")
          brandUpdate.legalPrivacyUrl = body["legalPrivacyUrl"];

        await this.#service.updateBrand(brandUpdate);

        return {
          statusCode: 303,
          headers: {
            ...baseHeaders,
            location: `${this.#mountPath}/brand?success=Brand+settings+saved+successfully`,
          },
        };
      }
    }

    // 3. Auth & Config: GET & POST /_admin/auth
    if (path === `${this.#mountPath}/auth` && method === "GET") {
      const authConfig = await this.#service.getAuthConfig();
      const bodyHtml = renderAuthConfigView(authConfig, session.csrfToken, this.#mountPath);
      const layoutHtml = renderAdminLayout({
        title: "Auth & Runtime Config",
        brand,
        csrfToken: session.csrfToken,
        currentPath: path,
        userEmail: user.email,
        bodyHtml,
        mountPath: this.#mountPath,
        message: flashSuccess,
        error: flashError,
      });
      return { statusCode: 200, headers: baseHeaders, body: layoutHtml };
    }

    if (path === `${this.#mountPath}/auth/toggle` && method === "POST") {
      const key = String(body["key"] ?? "");
      const enabled = body["enabled"] === "true" || body["enabled"] === true;
      await this.#service.toggleAuthFlag(key, enabled);
      return {
        statusCode: 303,
        headers: {
          ...baseHeaders,
          location: `${this.#mountPath}/auth?success=Feature+flag+updated`,
        },
      };
    }

    if (path === `${this.#mountPath}/auth/secret` && method === "POST") {
      const key = String(body["key"] ?? "");
      const value = String(body["value"] ?? "");
      await this.#service.setSecret(key, value);
      return {
        statusCode: 303,
        headers: {
          ...baseHeaders,
          location: `${this.#mountPath}/auth?success=Secret+updated+successfully`,
        },
      };
    }

    // 4. RBAC: GET & POST /_admin/rbac
    if (path === `${this.#mountPath}/rbac` && method === "GET") {
      const rbacData = await this.#service.getRbac();
      const bodyHtml = renderRbacView(rbacData, session.csrfToken, this.#mountPath);
      const layoutHtml = renderAdminLayout({
        title: "RBAC Roles & Permissions",
        brand,
        csrfToken: session.csrfToken,
        currentPath: path,
        userEmail: user.email,
        bodyHtml,
        mountPath: this.#mountPath,
        message: flashSuccess,
        error: flashError,
      });
      return { statusCode: 200, headers: baseHeaders, body: layoutHtml };
    }

    if (path === `${this.#mountPath}/rbac/toggle-custom` && method === "POST") {
      const allow = body["allowCustomRoles"] === "true" || body["allowCustomRoles"] === true;
      await this.#service.toggleCustomRoles(allow);
      return {
        statusCode: 303,
        headers: {
          ...baseHeaders,
          location: `${this.#mountPath}/rbac?success=Custom+roles+setting+updated`,
        },
      };
    }

    // 5. Tenants: GET & POST /_admin/tenants
    if (path === `${this.#mountPath}/tenants` && method === "GET") {
      const tenantsData = await this.#service.getTenants();
      const bodyHtml = renderTenantsView(tenantsData, session.csrfToken, this.#mountPath);
      const layoutHtml = renderAdminLayout({
        title: "Tenant Organizations",
        brand,
        csrfToken: session.csrfToken,
        currentPath: path,
        userEmail: user.email,
        bodyHtml,
        mountPath: this.#mountPath,
        message: flashSuccess,
        error: flashError,
      });
      return { statusCode: 200, headers: baseHeaders, body: layoutHtml };
    }

    if (path === `${this.#mountPath}/tenants/status` && method === "POST") {
      const tenantId = String(body["tenantId"] ?? "");
      const status = (body["status"] === "suspended" ? "suspended" : "active") as
        | "active"
        | "suspended";
      await this.#service.updateTenantStatus(tenantId, status);
      return {
        statusCode: 303,
        headers: {
          ...baseHeaders,
          location: `${this.#mountPath}/tenants?success=Tenant+status+updated`,
        },
      };
    }

    if (path === `${this.#mountPath}/tenants/plan` && method === "POST") {
      const tenantId = String(body["tenantId"] ?? "");
      const rawPlan = body["plan"];
      const plan = (rawPlan === "enterprise" || rawPlan === "pro" ? rawPlan : "free") as TenantPlan;
      await this.#service.updateTenantPlan(tenantId, plan);
      return {
        statusCode: 303,
        headers: {
          ...baseHeaders,
          location: `${this.#mountPath}/tenants?success=Tenant+plan+updated`,
        },
      };
    }

    // 6. Billing: GET & POST /_admin/billing
    if (path === `${this.#mountPath}/billing` && method === "GET") {
      const billingData = await this.#service.getBilling();
      const bodyHtml = renderBillingView(billingData, session.csrfToken, this.#mountPath);
      const layoutHtml = renderAdminLayout({
        title: "Billing & Subscriptions",
        brand,
        csrfToken: session.csrfToken,
        currentPath: path,
        userEmail: user.email,
        bodyHtml,
        mountPath: this.#mountPath,
        message: flashSuccess,
        error: flashError,
      });
      return { statusCode: 200, headers: baseHeaders, body: layoutHtml };
    }

    if (path === `${this.#mountPath}/billing/simulate` && method === "POST") {
      const eventType = String(body["eventType"] ?? "checkout.session.completed");
      const customerId = String(body["customerId"] ?? "");
      await this.#service.simulateBilling(eventType, customerId);
      return {
        statusCode: 303,
        headers: {
          ...baseHeaders,
          location: `${this.#mountPath}/billing?success=Simulated+billing+event+dispatched`,
        },
      };
    }

    // 7. Dev Inspector: GET & POST /_admin/dev
    if (path === `${this.#mountPath}/dev` && method === "GET") {
      const devData = await this.#service.getDevInspector();
      const bodyHtml = renderDevInspectorView(devData, session.csrfToken, this.#mountPath);
      const layoutHtml = renderAdminLayout({
        title: "Dev & Ops Inspector",
        brand,
        csrfToken: session.csrfToken,
        currentPath: path,
        userEmail: user.email,
        bodyHtml,
        mountPath: this.#mountPath,
        message: flashSuccess,
        error: flashError,
      });
      return { statusCode: 200, headers: baseHeaders, body: layoutHtml };
    }

    if (path === `${this.#mountPath}/dev/queue/retry` && method === "POST") {
      const jobId = String(body["jobId"] ?? "");
      await this.#service.retryOutboxJob(jobId);
      return {
        statusCode: 303,
        headers: {
          ...baseHeaders,
          location: `${this.#mountPath}/dev?success=Job+queued+for+retry`,
        },
      };
    }

    // Fallback: Redirect to /_admin dashboard
    return {
      statusCode: 303,
      headers: {
        ...baseHeaders,
        location: this.#mountPath,
      },
    };
  }
}
