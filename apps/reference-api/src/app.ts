import { SqliteDatabaseAdapter } from "@plinth/adapter-db-sqlite";
import { FastifyHttpAdapter } from "@plinth/adapter-http-fastify";
import {
  type ActorRankContext,
  ADMINISTRATOR_BIT,
  createRoleId,
  DefaultLifecycleManager,
  defineRoute,
  fromCanonicalHex,
  InMemoryIdempotencyManager,
  InMemoryRateLimiter,
  type RouteContract,
  requireTenantContext,
  ServiceUnavailableError,
  toCanonicalHex,
  type UserId,
} from "@plinth/core";
import {
  BrandService,
  DbBrandRepository,
  getBrandRouteContract,
  type UpdateBrandDto,
  updateBrandRouteContract,
} from "@plinth/modules-brand";
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
}

export async function buildApp(options: BuildAppOptions = {}) {
  const isProduction = options.isProduction ?? false;
  const port = options.port ?? 3000;
  const host = options.host ?? "0.0.0.0";
  const sqliteFilename = options.sqliteFilename ?? ":memory:";
  const tenantMode = options.tenantMode ?? "single";

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
    async start() {
      return server.listen(port, host);
    },
    async close() {
      await lifecycle.triggerShutdown();
    },
  };
}
