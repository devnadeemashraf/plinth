import { SqliteDatabaseAdapter } from "@plinth/adapter-db-sqlite";
import { FastifyHttpAdapter } from "@plinth/adapter-http-fastify";
import {
  DefaultLifecycleManager,
  defineRoute,
  type RouteContract,
  ServiceUnavailableError,
} from "@plinth/core";
import {
  BrandService,
  DbBrandRepository,
  getBrandRouteContract,
  type UpdateBrandDto,
  updateBrandRouteContract,
} from "@plinth/modules-brand";
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
}

export async function buildApp(options: BuildAppOptions = {}) {
  const isProduction = options.isProduction ?? false;
  const port = options.port ?? 3000;
  const host = options.host ?? "0.0.0.0";
  const sqliteFilename = options.sqliteFilename ?? ":memory:";

  // 1. Database adapter
  const db = new SqliteDatabaseAdapter({
    filename: sqliteFilename,
  });

  // 2. Brand domain & repository
  const brandRepo = new DbBrandRepository(db);
  await brandRepo.initSchema();
  const brandService = new BrandService(brandRepo);

  // 3. HTTP Server adapter
  const server = new FastifyHttpAdapter({
    isProduction,
    openApiInfo: {
      title: "Plinth Reference API",
      version: "1.0.0",
      description: "Production hexagonal reference API with OpenAPI 3.1 & Scalar docs",
    },
  });

  // 4. Register Routes
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

  // 5. Lifecycle Manager
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
