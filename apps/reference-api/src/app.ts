import { SqliteDatabaseAdapter } from "@plinth/adapter-db-sqlite";
import { FastifyHttpAdapter } from "@plinth/adapter-http-fastify";
import {
  type ActorRankContext,
  ADMINISTRATOR_BIT,
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

  // 6. Lifecycle Manager
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
    async start() {
      return server.listen(port, host);
    },
    async close() {
      await lifecycle.triggerShutdown();
    },
  };
}
