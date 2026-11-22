import {
  ADMINISTRATOR_BIT,
  BadRequestError,
  createTenantContext,
  createTenantId,
  decryptEnvelope,
  encryptEnvelope,
  ForbiddenError,
  generateSecureToken,
  generateUuidV7,
  hasBit,
  normalizeEmail,
  type TenantId,
  UnauthorizedError,
  type UserId,
  verifyPassword,
  verifyTotp,
} from "@plinth/core";
import type { AuditLogEntry, AuditLogRepositoryPort } from "@plinth/modules-audit";
import type { AuthRepositoryPort, User } from "@plinth/modules-auth";
import {
  type BrandConfig,
  type BrandRepositoryPort,
  DEFAULT_BRAND_CONFIG,
} from "@plinth/modules-brand";
import type { ConfigStoreRepositoryPort } from "@plinth/modules-config-store";
import type { RoleRepositoryPort } from "@plinth/modules-rbac";
import type { TenantPlan, TenantRepositoryPort, TenantStatus } from "@plinth/modules-tenants";
import type {
  AdminSession,
  AuthConfigViewModel,
  AuthFlagItem,
  AuthSecretItem,
  BillingViewModel,
  DashboardViewModel,
  DevInspectorViewModel,
  OutboxJobItem,
  RbacViewModel,
  TenantsViewModel,
} from "../domain/admin-models.js";

export interface AdminServiceOptions {
  readonly authRepo: AuthRepositoryPort;
  readonly roleRepo: RoleRepositoryPort;
  readonly brandRepo: BrandRepositoryPort;
  readonly configRepo?: ConfigStoreRepositoryPort | undefined;
  readonly tenantRepo?: TenantRepositoryPort | undefined;
  readonly auditRepo?: AuditLogRepositoryPort | undefined;
  readonly masterKey: Buffer | Uint8Array;
  readonly sessionTtlSec?: number | undefined; // Default 24 hours
}

interface PendingMfaTicket {
  readonly userId: UserId;
  readonly email: string;
  readonly tenantId: TenantId;
  readonly expiresAtMs: number;
}

export class AdminService {
  readonly #authRepo: AuthRepositoryPort;
  readonly #roleRepo: RoleRepositoryPort;
  readonly #brandRepo: BrandRepositoryPort;
  readonly #configRepo?: ConfigStoreRepositoryPort | undefined;
  readonly #tenantRepo?: TenantRepositoryPort | undefined;
  readonly #auditRepo?: AuditLogRepositoryPort | undefined;
  readonly #masterKey: Buffer | Uint8Array;
  readonly #sessionTtlSec: number;

  readonly #sessions = new Map<string, AdminSession>();
  readonly #pendingMfa = new Map<string, PendingMfaTicket>();
  #allowCustomRoles = true;

  // In-memory jobs for dev inspector simulation
  readonly #simulatedJobs = new Map<string, OutboxJobItem>();

  constructor(options: AdminServiceOptions) {
    this.#authRepo = options.authRepo;
    this.#roleRepo = options.roleRepo;
    this.#brandRepo = options.brandRepo;
    this.#configRepo = options.configRepo;
    this.#tenantRepo = options.tenantRepo;
    this.#auditRepo = options.auditRepo;
    this.#masterKey = options.masterKey;
    this.#sessionTtlSec = options.sessionTtlSec ?? 86400; // 24 hours
  }

  /**
   * Step 1 of Super User Login: Authenticate email + password and assert ADMINISTRATOR permission.
   */
  async authenticate(email: string, password: string): Promise<{ mfaTicket: string }> {
    const normalized = normalizeEmail(email);
    const tenantCtx = createTenantContext(createTenantId("default_tenant"));

    const user = await this.#authRepo.findUserByEmail(tenantCtx, normalized);
    if (user?.status !== "active" || !user.passwordHash) {
      throw new UnauthorizedError("Invalid email or password.", { code: "INVALID_CREDENTIALS" });
    }

    const isPasswordValid = await verifyPassword(user.passwordHash, password);
    if (!isPasswordValid) {
      throw new UnauthorizedError("Invalid email or password.", { code: "INVALID_CREDENTIALS" });
    }

    // Verify user holds ADMINISTRATOR bit
    const roles = await this.#roleRepo.getMemberRoles(user.tenantId, user.id, tenantCtx);
    const isSuperAdmin = roles.some((role) => {
      const mask =
        typeof role.permissions === "bigint" ? role.permissions : BigInt(role.permissions);
      return hasBit(mask, ADMINISTRATOR_BIT);
    });

    if (!isSuperAdmin) {
      throw new ForbiddenError("Access denied. Super User privileges required.", {
        code: "FORBIDDEN_NOT_SUPERUSER",
      });
    }

    // Issue short-lived MFA ticket (5 minutes TTL)
    const mfaTicket = generateSecureToken(32);
    this.#pendingMfa.set(mfaTicket, {
      userId: user.id,
      email: user.email,
      tenantId: user.tenantId,
      expiresAtMs: Date.now() + 5 * 60 * 1000,
    });

    return { mfaTicket };
  }

  /**
   * Step 2 of Super User Login: Verify 6-digit TOTP code and mint AdminSession.
   */
  async verifyMfa(mfaTicket: string, totpCode: string): Promise<AdminSession> {
    const pending = this.#pendingMfa.get(mfaTicket);
    if (!pending || pending.expiresAtMs < Date.now()) {
      this.#pendingMfa.delete(mfaTicket);
      throw new UnauthorizedError("MFA ticket is invalid or expired. Please sign in again.", {
        code: "INVALID_MFA_TICKET",
      });
    }

    const tenantCtx = createTenantContext(pending.tenantId);
    const user = await this.#authRepo.findUserById(tenantCtx, pending.userId);
    if (!user?.totpSecretEncrypted) {
      throw new UnauthorizedError("User or TOTP secret not found.", { code: "MFA_NOT_CONFIGURED" });
    }

    const secret = decryptEnvelope(user.totpSecretEncrypted, this.#masterKey).toString("utf8");
    const isTotpValid = verifyTotp(totpCode.trim(), secret);
    if (!isTotpValid) {
      throw new BadRequestError("Invalid TOTP verification code.", {
        code: "INVALID_TOTP_CODE",
      });
    }

    // Consume pending ticket
    this.#pendingMfa.delete(mfaTicket);

    const now = Date.now();
    const session: AdminSession = {
      id: generateUuidV7(),
      userId: user.id,
      email: user.email,
      tenantId: user.tenantId,
      csrfToken: generateSecureToken(32),
      expiresAt: new Date(now + this.#sessionTtlSec * 1000).toISOString(),
      createdAt: new Date(now).toISOString(),
    };

    this.#sessions.set(session.id, session);
    return session;
  }

  /**
   * Validates an active admin session and asserts ongoing super user privileges.
   */
  async validateSession(sessionId: string): Promise<{ session: AdminSession; user: User } | null> {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      return null;
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      this.#sessions.delete(sessionId);
      return null;
    }

    const tenantCtx = createTenantContext(session.tenantId);
    const user = await this.#authRepo.findUserById(tenantCtx, session.userId);
    if (user?.status !== "active") {
      this.#sessions.delete(sessionId);
      return null;
    }

    // Assert user still retains ADMINISTRATOR bit
    const roles = await this.#roleRepo.getMemberRoles(user.tenantId, user.id, tenantCtx);
    const isSuperAdmin = roles.some((role) => {
      const mask =
        typeof role.permissions === "bigint" ? role.permissions : BigInt(role.permissions);
      return hasBit(mask, ADMINISTRATOR_BIT);
    });

    if (!isSuperAdmin) {
      this.#sessions.delete(sessionId);
      return null;
    }

    return { session, user };
  }

  /**
   * Invalidates and removes an admin session (logout).
   */
  async invalidateSession(sessionId: string): Promise<void> {
    this.#sessions.delete(sessionId);
  }

  injectSessionForTesting(session: AdminSession): void {
    this.#sessions.set(session.id, session);
  }

  // --- Sub-Panel Queries & Mutations ---

  async getDashboardViewModel(): Promise<DashboardViewModel> {
    const tenantCtx = createTenantContext(createTenantId("default_tenant"));

    let tenantCount = 1;
    if (this.#tenantRepo) {
      const defaultT = await this.#tenantRepo.findById(tenantCtx.tenantId, tenantCtx);
      if (defaultT) {
        tenantCount = 1;
      }
    }

    const roles = await this.#roleRepo.listRoles(tenantCtx);
    const roleCount = roles.length;

    let auditEventCount = 0;
    if (this.#auditRepo) {
      const audits = await this.#auditRepo.query({ limit: 100 });
      auditEventCount = audits.length;
    }

    return {
      uptimeSec: process.uptime(),
      nodeVersion: process.version,
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      tenantCount,
      userCount: 2, // At least super user and members
      roleCount,
      auditEventCount,
      dbHealthy: true,
    };
  }

  async getBrand(): Promise<BrandConfig> {
    const brand = await this.#brandRepo.get();
    return brand ?? DEFAULT_BRAND_CONFIG;
  }

  async updateBrand(updates: Partial<BrandConfig>): Promise<BrandConfig> {
    return await this.#brandRepo.update(updates);
  }

  async getAuthConfig(): Promise<AuthConfigViewModel> {
    const defaultFlags: AuthFlagItem[] = [
      {
        key: "auth.emailPasswordEnabled",
        enabled: true,
        description: "Allow Email and Password authentication",
      },
      { key: "auth.oauthEnabled", enabled: true, description: "Allow OAuth2 / OIDC social login" },
      {
        key: "auth.mfaRequiredForSuperAdmins",
        enabled: true,
        description: "Enforce mandatory TOTP 2FA on Super Users",
      },
    ];

    const defaultSecrets: AuthSecretItem[] = [
      {
        key: "auth.jwtPrivateKey",
        maskedValue: "[ENCRYPTED_SECRET]",
        description: "Ed25519 JWT Signing Private Key",
      },
      {
        key: "auth.oauth.googleClientSecret",
        maskedValue: "[ENCRYPTED_SECRET]",
        description: "Google OAuth2 Client Secret",
      },
      {
        key: "auth.oauth.githubClientSecret",
        maskedValue: "[ENCRYPTED_SECRET]",
        description: "GitHub OAuth2 Client Secret",
      },
    ];

    return {
      flags: defaultFlags,
      secrets: defaultSecrets,
    };
  }

  async toggleAuthFlag(key: string, enabled: boolean): Promise<void> {
    if (this.#configRepo) {
      await this.#configRepo.set({
        key,
        valueEncrypted: String(enabled),
        isSecret: false,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async setSecret(key: string, value: string, _description?: string): Promise<void> {
    if (this.#configRepo) {
      const encrypted = encryptEnvelope(value, this.#masterKey);
      await this.#configRepo.set({
        key,
        valueEncrypted: encrypted,
        isSecret: true,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async getRbac(): Promise<RbacViewModel> {
    const tenantCtx = createTenantContext(createTenantId("default_tenant"));
    const roles = await this.#roleRepo.listRoles(tenantCtx);
    return {
      roles,
      allowCustomRoles: this.#allowCustomRoles,
    };
  }

  async toggleCustomRoles(allow: boolean): Promise<void> {
    this.#allowCustomRoles = allow;
  }

  async getTenants(): Promise<TenantsViewModel> {
    const tenantCtx = createTenantContext(createTenantId("default_tenant"));
    if (this.#tenantRepo) {
      const defaultTenant = await this.#tenantRepo.findById(tenantCtx.tenantId, tenantCtx);
      if (defaultTenant) {
        return { tenants: [defaultTenant] };
      }
    }
    return {
      tenants: [
        {
          id: tenantCtx.tenantId,
          name: "Default Organization",
          slug: "default",
          plan: "enterprise",
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };
  }

  async updateTenantStatus(tenantId: string, status: TenantStatus): Promise<void> {
    const tId = createTenantId(tenantId);
    const tenantCtx = createTenantContext(tId);
    if (this.#tenantRepo) {
      await this.#tenantRepo.update(tId, { status }, tenantCtx);
    }
  }

  async updateTenantPlan(tenantId: string, plan: TenantPlan): Promise<void> {
    const tId = createTenantId(tenantId);
    const tenantCtx = createTenantContext(tId);
    if (this.#tenantRepo) {
      await this.#tenantRepo.update(tId, { plan }, tenantCtx);
    }
  }

  async getBilling(): Promise<BillingViewModel> {
    return {
      isStub: true,
      subscriptions: [
        {
          id: "sub_mock_1",
          customerId: "cus_default_1",
          planId: "pro_annual",
          status: "active",
          currentPeriodEnd: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
        },
      ],
      invoices: [
        {
          id: "inv_mock_1",
          customerId: "cus_default_1",
          amount: 4900,
          currency: "usd",
          status: "paid",
          createdAt: new Date().toISOString(),
        },
      ],
    };
  }

  async simulateBilling(eventType: string, customerId: string): Promise<void> {
    // Registers a simulated audit event for test verification
    const tenantCtx = createTenantContext(createTenantId("default_tenant"));
    if (this.#auditRepo) {
      await this.#auditRepo.record({
        id: generateUuidV7(),
        tenantId: tenantCtx.tenantId,
        actorId: generateUuidV7(),
        actorType: "system",
        action: `billing.simulated.${eventType}`,
        resourceType: "billing",
        resourceId: customerId,
        payloadDiff: { eventType, customerId, timestamp: new Date().toISOString() },
        createdAt: new Date().toISOString(),
      });
    }
  }

  async getDevInspector(): Promise<DevInspectorViewModel> {
    let auditLogs: readonly AuditLogEntry[] = [];
    if (this.#auditRepo) {
      auditLogs = await this.#auditRepo.query({ limit: 50 });
    }

    return {
      auditLogs,
      outboxJobs: Array.from(this.#simulatedJobs.values()),
      caughtEmails: [
        {
          id: "email_dev_1",
          to: "user@example.com",
          subject: "Verify Your Email Address",
          sentAt: new Date().toISOString(),
          html: "<p>Welcome to Plinth! Your verification code is <strong>123456</strong>.</p>",
        },
      ],
    };
  }

  addSimulatedJob(job: OutboxJobItem): void {
    this.#simulatedJobs.set(job.id, job);
  }

  async retryOutboxJob(jobId: string): Promise<boolean> {
    const job = this.#simulatedJobs.get(jobId);
    if (job) {
      this.#simulatedJobs.set(jobId, {
        ...job,
        status: "pending",
        retryCount: job.retryCount + 1,
        lastError: undefined,
      });
      return true;
    }
    return false;
  }
}
