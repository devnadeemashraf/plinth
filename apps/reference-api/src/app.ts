import { StubBillingAdapter } from "@plinth/adapter-billing-stub";
import { SqliteDatabaseAdapter } from "@plinth/adapter-db-sqlite";
import { FastifyHttpAdapter } from "@plinth/adapter-http-fastify";
import {
  type ActorRankContext,
  ADMINISTRATOR_BIT,
  type BillingProvider,
  createRoleId,
  DefaultLifecycleManager,
  defineRoute,
  fromCanonicalHex,
  generateEd25519KeyPair,
  InMemoryIdempotencyManager,
  InMemoryRateLimiter,
  type RouteContract,
  requireTenantContext,
  ServiceUnavailableError,
  toCanonicalHex,
  type UserId,
} from "@plinth/core";
import { AdminController, AdminService, createAdminRoutes } from "@plinth/modules-admin";
import { AuditService, DbAuditLogRepository } from "@plinth/modules-audit";
import {
  AuthService,
  DbAuthRepository,
  type LoginDto,
  type LoginTotpDto,
  loginRouteContract,
  loginTotpRouteContract,
  logoutRouteContract,
  meRouteContract,
  type RefreshTokensDto,
  type RegisterDto,
  refreshRouteContract,
  registerRouteContract,
} from "@plinth/modules-auth";
import {
  BillingService,
  billingWebhookRouteContract,
  type CreateCheckoutDto,
  cancelSubscriptionRouteContract,
  createCheckoutRouteContract,
  DbBillingRepository,
  getEntitlementsRouteContract,
  getSubscriptionRouteContract,
  listInvoicesRouteContract,
  type Plan,
} from "@plinth/modules-billing";
import {
  BrandService,
  DbBrandRepository,
  getBrandRouteContract,
  type UpdateBrandDto,
  updateBrandRouteContract,
} from "@plinth/modules-brand";
import { ConfigStore, DbConfigStoreRepository } from "@plinth/modules-config-store";
import {
  assignRoleRouteContract,
  type CreateRoleDto,
  createRoleRouteContract,
  DbRoleRepository,
  deleteRoleRouteContract,
  evaluatePermissionsRouteContract,
  getRoleRouteContract,
  listRolesRouteContract,
  RbacService,
  type Role,
  removeRoleRouteContract,
  type UpdateRoleDto,
  updateRoleRouteContract,
} from "@plinth/modules-rbac";
import {
  createTenantRouteContract,
  DbTenantRepository,
  getTenantRouteContract,
  TenantService,
  updateTenantRouteContract,
} from "@plinth/modules-tenants";
import { z } from "zod";

export const livenessRouteContract: RouteContract = defineRoute({
  method: "GET",
  path: "/health/live",
  summary: "Liveness probe",
  description:
    "Kubernetes/container liveness probe (zero I/O). Returns 200 OK if process is running.",
  tags: ["Health"],
  isPublic: true,
  responseSchemas: {
    200: z.object({
      status: z.literal("ok"),
    }),
  },
});

export const readinessRouteContract: RouteContract = defineRoute({
  method: "GET",
  path: "/health/ready",
  summary: "Readiness probe",
  description:
    "Kubernetes/container readiness probe. Verifies database connectivity within a bounded 2s timeout.",
  tags: ["Health"],
  isPublic: true,
  responseSchemas: {
    200: z.object({
      status: z.literal("ready"),
    }),
  },
});

export interface BuildAppOptions {
  readonly isProduction?: boolean | undefined;
  readonly sqliteFilename?: string | undefined;
  readonly port?: number | undefined;
  readonly host?: string | undefined;
  readonly tenantMode?: "single" | "multi" | undefined;
  readonly masterKey?: Buffer | Uint8Array | undefined;
  readonly jwtPrivateKeyPem?: string | undefined;
  readonly jwtPublicKeyPem?: string | undefined;
  readonly adminMountPath?: string | undefined;
  readonly adminAllowedCidrs?: readonly string[] | undefined;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const isProduction = options.isProduction ?? false;
  const port = options.port ?? 3000;
  const host = options.host ?? "0.0.0.0";
  const sqliteFilename = options.sqliteFilename ?? ":memory:";
  const tenantMode = options.tenantMode ?? "single";

  const masterKey =
    options.masterKey ?? Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 17 + 23) % 256));
  const keyPair =
    options.jwtPrivateKeyPem && options.jwtPublicKeyPem
      ? { privateKeyPem: options.jwtPrivateKeyPem, publicKeyPem: options.jwtPublicKeyPem }
      : generateEd25519KeyPair();

  // 1. Database adapter
  const db = new SqliteDatabaseAdapter({
    filename: sqliteFilename,
  });

  // 2. Brand domain & repository
  const brandRepo = new DbBrandRepository(db);
  await brandRepo.initSchema();
  const brandService = new BrandService(brandRepo);

  // 3. Tenants domain & repository
  const tenantRepo = new DbTenantRepository(db);
  await tenantRepo.initSchema();
  const tenantService = new TenantService(tenantRepo);

  // 4. RBAC domain & repository
  const roleRepo = new DbRoleRepository(db);
  await roleRepo.initSchema();
  const rbacService = new RbacService(roleRepo);

  // 5. Config Store module
  const configRepo = new DbConfigStoreRepository(db);
  await configRepo.initializeSchema();
  const configStore = new ConfigStore({
    repository: configRepo,
    masterKey,
    fallbacks: {
      "auth.emailPasswordEnabled": "true",
      "auth.oauthEnabled": "true",
    },
  });

  // 6. Audit module
  const auditRepo = new DbAuditLogRepository(db);
  await auditRepo.initializeSchema();
  const auditService = new AuditService({ repository: auditRepo });

  // 7. Auth module
  const authRepo = new DbAuthRepository(db);
  await authRepo.initializeSchema();
  const authService = new AuthService({
    repository: authRepo,
    configStore,
    auditService,
    masterKey,
    jwtPrivateKeyPem: keyPair.privateKeyPem,
    jwtPublicKeyPem: keyPair.publicKeyPem,
    jwtIssuer: "https://auth.plinth.dev",
    jwtAudience: "plinth-api",
  });

  // 8. Billing module & Stub Adapter
  const billingRepo = new DbBillingRepository(db);
  await billingRepo.initSchema();
  const stubBillingAdapter = new StubBillingAdapter();
  const referencePlans: Plan[] = [
    {
      id: "plan_starter",
      name: "Starter",
      description: "Starter tier for small teams",
      priceMinorUnits: 2900,
      currency: "USD",
      billingInterval: "month",
      features: ["basic_api", "community_support"],
      entitlements: {
        maxUsers: 5,
        maxStorageGb: 10,
        advancedAudit: false,
      },
    },
    {
      id: "plan_pro",
      name: "Pro",
      description: "Pro enterprise tier for growing teams",
      priceMinorUnits: 9900,
      currency: "USD",
      billingInterval: "month",
      features: ["unlimited_api", "priority_support", "advanced_audit"],
      entitlements: {
        maxUsers: 100,
        maxStorageGb: 100,
        advancedAudit: true,
      },
    },
  ];
  const billingService = new BillingService({
    billingPort: stubBillingAdapter,
    repository: billingRepo,
    plans: referencePlans,
    webhookSecret: "whsec_reference_api_webhook_secret_32",
  });

  function serializeRole(role: Role) {
    return {
      id: role.id,
      tenantId: role.tenantId,
      name: role.name,
      permissionsHex: toCanonicalHex(role.permissions),
      position: role.position,
      isSystem: role.isSystem,
      ...(role.metadata ? { metadata: role.metadata } : {}),
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  function extractActor(headers: Record<string, unknown>): ActorRankContext {
    const userId = (headers["x-user-id"] as string) ?? "admin_root";
    const highestPosition =
      headers["x-actor-position"] !== undefined ? Number(headers["x-actor-position"]) : 100;
    const permissionsHeader = headers["x-actor-permissions"] as string | undefined;
    const parsedMask = permissionsHeader ? fromCanonicalHex(permissionsHeader) : null;
    const effectivePermissions = parsedMask?.ok ? parsedMask.value : ADMINISTRATOR_BIT;

    return {
      userId,
      highestPosition,
      effectivePermissions,
    };
  }

  // 5. HTTP Server adapter with rate limiter, idempotency, security headers & tenancy
  const server = new FastifyHttpAdapter({
    isProduction,
    rateLimiter: new InMemoryRateLimiter({ windowMs: 60_000, maxRequests: 1000 }),
    idempotencyManager: new InMemoryIdempotencyManager({ ttlMs: 86_400_000 }),
    tenantResolver: {
      mode: tenantMode,
      strategy: "header",
      headerName: "x-tenant-id",
    },
    openApiInfo: {
      title: "Plinth Reference API",
      version: "1.0.0",
      description: "Production hexagonal reference API with OpenAPI 3.1 & Scalar docs",
    },
  });

  // 5. Register Routes
  server.registerRoute(livenessRouteContract, async () => {
    return {
      statusCode: 200,
      body: { status: "ok" },
    };
  });

  server.registerRoute(readinessRouteContract, async () => {
    if (lifecycle.isShuttingDown()) {
      throw new ServiceUnavailableError("Server is shutting down");
    }
    const isAlive = await db.ping(2000);
    if (!isAlive) {
      throw new ServiceUnavailableError("Database is not ready or connection lost");
    }
    return {
      statusCode: 200,
      body: { status: "ready" },
    };
  });

  server.registerRoute(getBrandRouteContract, async () => {
    const brand = await brandService.getBrand();
    return {
      statusCode: 200,
      body: brand,
    };
  });

  server.registerRoute(updateBrandRouteContract, async (req) => {
    const updated = await brandService.updateBrand(req.body as UpdateBrandDto);
    return {
      statusCode: 200,
      body: updated,
    };
  });

  server.registerRoute(getTenantRouteContract, async (req) => {
    const slug = (req.params as { slug: string }).slug;
    const ctx = requireTenantContext();
    const tenant = await tenantService.getTenantBySlug(slug, ctx);
    return {
      statusCode: 200,
      body: tenant,
    };
  });

  server.registerRoute(createTenantRouteContract, async (req) => {
    const ctx = requireTenantContext();
    const created = await tenantService.createTenant(req.body, ctx);
    return {
      statusCode: 201,
      body: created,
    };
  });

  server.registerRoute(updateTenantRouteContract, async (req) => {
    const slug = (req.params as { slug: string }).slug;
    const ctx = requireTenantContext();
    const updated = await tenantService.updateTenant(slug, req.body, ctx);
    return {
      statusCode: 200,
      body: updated,
    };
  });

  // RBAC Routes
  server.registerRoute(createRoleRouteContract, async (req) => {
    const ctx = requireTenantContext();
    const actor = extractActor(req.headers);
    const role = await rbacService.createRole(req.body as CreateRoleDto, actor, ctx);
    return {
      statusCode: 201,
      body: serializeRole(role),
    };
  });

  server.registerRoute(getRoleRouteContract, async (req) => {
    const ctx = requireTenantContext();
    const roleId = createRoleId((req.params as { roleId: string }).roleId);
    const role = await rbacService.getRole(roleId, ctx);
    return {
      statusCode: 200,
      body: serializeRole(role),
    };
  });

  server.registerRoute(updateRoleRouteContract, async (req) => {
    const ctx = requireTenantContext();
    const actor = extractActor(req.headers);
    const roleId = createRoleId((req.params as { roleId: string }).roleId);
    const role = await rbacService.updateRole(roleId, req.body as UpdateRoleDto, actor, ctx);
    return {
      statusCode: 200,
      body: serializeRole(role),
    };
  });

  server.registerRoute(deleteRoleRouteContract, async (req) => {
    const ctx = requireTenantContext();
    const actor = extractActor(req.headers);
    const roleId = createRoleId((req.params as { roleId: string }).roleId);
    await rbacService.deleteRole(roleId, actor, ctx);
    return {
      statusCode: 204,
      body: undefined,
    };
  });

  server.registerRoute(listRolesRouteContract, async () => {
    const ctx = requireTenantContext();
    const roles = await rbacService.listRoles(ctx);
    return {
      statusCode: 200,
      body: roles.map(serializeRole),
    };
  });

  server.registerRoute(assignRoleRouteContract, async (req) => {
    const ctx = requireTenantContext();
    const actor = extractActor(req.headers);
    const memberId = (req.params as { memberId: string }).memberId as UserId;
    const roleId = createRoleId((req.body as { roleId: string }).roleId);
    await rbacService.assignRoleToMember(memberId, roleId, actor, ctx);
    return {
      statusCode: 200,
      body: { assigned: true },
    };
  });

  server.registerRoute(removeRoleRouteContract, async (req) => {
    const ctx = requireTenantContext();
    const actor = extractActor(req.headers);
    const memberId = (req.params as { memberId: string }).memberId as UserId;
    const roleId = createRoleId((req.params as { roleId: string }).roleId);
    await rbacService.removeRoleFromMember(memberId, roleId, actor, ctx);
    return {
      statusCode: 204,
      body: undefined,
    };
  });

  server.registerRoute(evaluatePermissionsRouteContract, async (req) => {
    const ctx = requireTenantContext();
    const body = req.body as { memberId: string; scopeIds?: string[] };
    const memberId = body.memberId as UserId;
    const result = await rbacService.evaluateMemberPermissions(memberId, body.scopeIds ?? [], ctx);
    return {
      statusCode: 200,
      body: {
        memberId,
        effectiveMaskHex: result.effectiveMaskHex,
        permissions: result.permissions,
      },
    };
  });

  // Auth Routes
  server.registerRoute(registerRouteContract, async (req) => {
    const ctx = requireTenantContext();
    const res = await authService.register(ctx, req.body as RegisterDto, {
      ipAddress: req.headers["x-forwarded-for"] as string | undefined,
      userAgent: req.headers["user-agent"] as string | undefined,
    });
    return {
      statusCode: 201,
      body: res,
    };
  });

  server.registerRoute(loginRouteContract, async (req) => {
    const ctx = requireTenantContext();
    const res = await authService.login(ctx, req.body as LoginDto, {
      ipAddress: req.headers["x-forwarded-for"] as string | undefined,
      userAgent: req.headers["user-agent"] as string | undefined,
    });
    return {
      statusCode: 200,
      body: res,
    };
  });

  server.registerRoute(loginTotpRouteContract, async (req) => {
    const ctx = requireTenantContext();
    const res = await authService.loginWithTotp(ctx, req.body as LoginTotpDto, {
      ipAddress: req.headers["x-forwarded-for"] as string | undefined,
      userAgent: req.headers["user-agent"] as string | undefined,
    });
    return {
      statusCode: 200,
      body: res,
    };
  });

  server.registerRoute(refreshRouteContract, async (req) => {
    const res = await authService.refreshTokens(req.body as RefreshTokensDto, {
      ipAddress: req.headers["x-forwarded-for"] as string | undefined,
      userAgent: req.headers["user-agent"] as string | undefined,
    });
    return {
      statusCode: 200,
      body: res,
    };
  });

  server.registerRoute(logoutRouteContract, async (req) => {
    const body = req.body as { sessionToken?: string; refreshToken?: string } | undefined;
    await authService.logout({
      sessionToken: body?.sessionToken,
      refreshToken: body?.refreshToken,
    });
    return {
      statusCode: 204,
      body: undefined,
    };
  });

  server.registerRoute(meRouteContract, async (req) => {
    const ctx = requireTenantContext();
    const userId = req.headers["x-user-id"] as string | undefined;
    if (!userId) {
      throw new ServiceUnavailableError("Authentication required: x-user-id header is missing.");
    }
    const user = await authRepo.findUserById(ctx, userId as UserId);
    if (!user) {
      throw new ServiceUnavailableError("User not found.");
    }
    return {
      statusCode: 200,
      body: user,
    };
  });

  // Billing Routes
  server.registerRoute(createCheckoutRouteContract, async (req) => {
    const ctx = requireTenantContext();
    const res = await billingService.createCheckoutSession(ctx, req.body as CreateCheckoutDto);
    return {
      statusCode: 200,
      body: res,
    };
  });

  server.registerRoute(getSubscriptionRouteContract, async () => {
    const ctx = requireTenantContext();
    const sub = await billingService.getActiveSubscription(ctx);
    return {
      statusCode: 200,
      body: {
        subscription: sub
          ? {
              id: sub.id,
              planId: sub.planId,
              status: sub.status,
              currentPeriodStart: sub.currentPeriodStart.toISOString(),
              currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
              cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
              provider: sub.provider,
            }
          : null,
      },
    };
  });

  server.registerRoute(cancelSubscriptionRouteContract, async (req) => {
    const ctx = requireTenantContext();
    const active = await billingService.getActiveSubscription(ctx);
    if (!active) {
      throw new ServiceUnavailableError("No active subscription to cancel.");
    }
    const body = req.body as { cancelImmediately?: boolean } | undefined;
    const canceled = await billingService.cancelSubscription(
      ctx,
      active.id,
      body?.cancelImmediately,
    );
    return {
      statusCode: 200,
      body: {
        subscription: {
          id: canceled.id,
          status: canceled.status,
          cancelAtPeriodEnd: canceled.cancelAtPeriodEnd,
          canceledAt: canceled.canceledAt?.toISOString(),
        },
      },
    };
  });

  server.registerRoute(listInvoicesRouteContract, async (req) => {
    const ctx = requireTenantContext();
    const query = req.query as { limit?: string; cursor?: string } | undefined;
    const limit = query?.limit ? Number.parseInt(query.limit, 10) : undefined;
    const res = await billingService.listInvoices(ctx, { limit, cursor: query?.cursor });
    return {
      statusCode: 200,
      body: {
        items: res.items.map((inv) => ({
          id: inv.id,
          provider: inv.provider,
          providerInvoiceId: inv.providerInvoiceId,
          amountMinorUnits: inv.amountMinorUnits,
          currency: inv.currency,
          status: inv.status,
          taxAmountMinorUnits: inv.taxAmountMinorUnits,
          hsnCode: inv.hsnCode,
          gstRatePercent: inv.gstRatePercent,
          gstin: inv.gstin,
          paidAt: inv.paidAt?.toISOString(),
          pdfUrl: inv.pdfUrl,
        })),
        nextCursor: res.nextCursor,
      },
    };
  });

  server.registerRoute(getEntitlementsRouteContract, async () => {
    const ctx = requireTenantContext();
    const entitlements = await billingService.getEntitlements(ctx);
    return {
      statusCode: 200,
      body: { entitlements },
    };
  });

  server.registerRoute(billingWebhookRouteContract, async (req) => {
    const provider = (req.params as { provider: string }).provider as BillingProvider;
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}), "utf8");
    const res = await billingService.handleWebhook(provider, rawBody, req.headers);
    return {
      statusCode: 200,
      body: res,
    };
  });

  // 6. Zero-Build SSR Admin Panel & Dev/Ops Inspector
  const adminMountPath = options.adminMountPath ?? "/_admin";
  const adminService = new AdminService({
    authRepo,
    roleRepo,
    brandRepo,
    configRepo,
    tenantRepo,
    auditRepo,
    masterKey,
  });

  const adminController = new AdminController({
    service: adminService,
    mountPath: adminMountPath,
    allowedCidrs: options.adminAllowedCidrs ?? [],
    isProduction,
  });

  const adminRoutes = createAdminRoutes(adminMountPath);
  for (const route of Object.values(adminRoutes)) {
    server.registerRoute(route, async (req) => {
      return await adminController.handleRequest(req);
    });
  }

  // 7. Lifecycle Manager
  const lifecycle = new DefaultLifecycleManager();
  lifecycle.onShutdown(
    "http-server",
    async () => {
      await server.close();
    },
    10,
  );
  lifecycle.onShutdown(
    "database",
    async () => {
      await db.close();
    },
    0,
  );

  return {
    server,
    db,
    lifecycle,
    authService,
    configStore,
    auditService,
    billingService,
    stubBillingAdapter,
    adminService,
    adminController,
    authRepo,
    roleRepo,
    tenantRepo,
    brandRepo,
    async start() {
      return server.listen(port, host);
    },
    async close() {
      await lifecycle.triggerShutdown();
    },
  };
}
