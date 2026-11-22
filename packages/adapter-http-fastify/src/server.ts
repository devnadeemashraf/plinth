import cors from "@fastify/cors";
import {
  AppError,
  BadRequestError,
  ConflictError,
  computeRequestHash,
  createTenantId,
  DEFAULT_TENANT_CONTEXT,
  generateOpenApiSpec,
  getSecurityHeaders,
  type HttpRequest,
  type HttpResponse,
  type HttpRouteHandler,
  type HttpServerPort,
  type InMemoryIdempotencyManager,
  type InMemoryRateLimiter,
  type LoggerPort,
  NotFoundError,
  type OpenApiInfo,
  RateLimitExceededError,
  type RouteContract,
  resolveTenantFromRequest,
  runWithTenantContext,
  type SecurityHeaderOptions,
  type TenantContext,
  type TenantResolverOptions,
  toProblemDetails,
  validateRequestInput,
} from "@plinth/core";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";

export interface FastifyHttpAdapterOptions {
  readonly isProduction?: boolean | undefined;
  readonly logger?: LoggerPort | undefined;
  readonly openApiInfo?: Partial<OpenApiInfo> | undefined;
  readonly corsOrigins?: string[] | boolean | undefined;
  readonly securityHeaders?: SecurityHeaderOptions | boolean | undefined;
  readonly rateLimiter?: InMemoryRateLimiter | undefined;
  readonly idempotencyManager?: InMemoryIdempotencyManager | undefined;
  readonly tenantResolver?: TenantResolverOptions | undefined;
}

export class FastifyHttpAdapter implements HttpServerPort {
  readonly #app: FastifyInstance;
  readonly #contracts: RouteContract[] = [];
  readonly #isProduction: boolean;
  readonly #openApiInfo?: Partial<OpenApiInfo> | undefined;
  readonly #rateLimiter?: InMemoryRateLimiter | undefined;
  readonly #idempotencyManager?: InMemoryIdempotencyManager | undefined;
  readonly #tenantResolver?: TenantResolverOptions | undefined;

  constructor(options?: FastifyHttpAdapterOptions) {
    this.#isProduction = options?.isProduction ?? false;
    this.#openApiInfo = options?.openApiInfo;
    this.#rateLimiter = options?.rateLimiter;
    this.#idempotencyManager = options?.idempotencyManager;
    this.#tenantResolver = options?.tenantResolver;

    this.#app = Fastify({
      logger: false,
      bodyLimit: 1048576,
    });

    this.#setupPlugins(options);
    this.#setupSecurityHeaders(options?.securityHeaders);
    this.#setupRateLimiter();
    this.#setupErrorHandlers();
    this.#setupDocumentationRoutes();
  }

  #setupPlugins(options?: FastifyHttpAdapterOptions): void {
    const isProduction = options?.isProduction ?? false;
    const corsOrigin = options?.corsOrigins ?? !isProduction;
    this.#app.register(cors, {
      origin: corsOrigin,
      credentials: true,
    });
  }

  #setupSecurityHeaders(options?: SecurityHeaderOptions | boolean): void {
    if (options === false) {
      return;
    }
    const headerOpts: SecurityHeaderOptions =
      typeof options === "object" ? options : { isProduction: this.#isProduction };
    const secHeaders = getSecurityHeaders(headerOpts);

    this.#app.addHook("onSend", async (_request, reply) => {
      for (const [key, val] of Object.entries(secHeaders)) {
        if (!reply.hasHeader(key)) {
          reply.header(key, val);
        }
      }
    });
  }

  #setupRateLimiter(): void {
    if (!this.#rateLimiter) {
      return;
    }

    const limiter = this.#rateLimiter;
    this.#app.addHook("onRequest", async (req, reply) => {
      const clientIp = req.ip || "127.0.0.1";
      const result = limiter.consume(clientIp);

      reply.header("ratelimit-limit", result.limit);
      reply.header("ratelimit-remaining", result.remaining);
      reply.header("ratelimit-reset", result.resetSeconds);

      if (!result.allowed) {
        reply.header("retry-after", result.retryAfterSeconds);
        throw new RateLimitExceededError(
          `Rate limit exceeded. Try again in ${result.retryAfterSeconds} seconds.`,
          { code: "RATE_LIMIT_EXCEEDED" },
        );
      }
    });
  }

  #setupErrorHandlers(): void {
    this.#app.setErrorHandler((error, _request, reply) => {
      // Handle JSON syntax parsing errors & client errors (4xx) from Fastify
      let errToSerialize: unknown = error;
      if (!(error instanceof AppError)) {
        if (
          error &&
          typeof error === "object" &&
          "statusCode" in error &&
          typeof (error as { statusCode: unknown }).statusCode === "number"
        ) {
          const sc = (error as { statusCode: number }).statusCode;
          if (sc === 400) {
            const message =
              "message" in error && typeof error.message === "string"
                ? error.message
                : "Bad Request";
            errToSerialize = new BadRequestError(message);
          } else if (sc >= 400 && sc < 500) {
            const message =
              "message" in error && typeof error.message === "string"
                ? error.message
                : "Client Error";
            const code =
              "code" in error && typeof error.code === "string" ? error.code : "CLIENT_ERROR";
            errToSerialize = new AppError(sc, message, {
              code,
              title: "Client Error",
              detail: message,
            });
          }
        }
      }

      const problem = toProblemDetails(errToSerialize, {
        isProduction: this.#isProduction,
      });

      reply.status(problem.status).header("content-type", "application/problem+json").send(problem);
    });

    this.#app.setNotFoundHandler((request, reply) => {
      const notFound = new NotFoundError(`Route ${request.method} ${request.url} not found`, {
        instance: request.url,
      });
      const problem = toProblemDetails(notFound, {
        isProduction: this.#isProduction,
      });

      reply.status(404).header("content-type", "application/problem+json").send(problem);
    });
  }

  #setupDocumentationRoutes(): void {
    // 1. OpenAPI 3.1 JSON Specification
    this.#app.get("/openapi.json", async (_req, reply) => {
      const spec = generateOpenApiSpec(this.#contracts, this.#openApiInfo);
      return reply.type("application/json").send(spec);
    });

    // 2. Interactive Scalar API Reference UI
    this.#app.get("/docs", async (_req, reply) => {
      const title = this.#openApiInfo?.title ?? "API Reference";
      const html = `<!doctype html>
<html>
  <head>
    <title>${title} - Scalar API Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script id="api-reference" data-url="/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
      return reply
        .header(
          "content-security-policy",
          "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https://cdn.jsdelivr.net https:; connect-src 'self' https:;",
        )
        .type("text/html")
        .send(html);
    });
  }

  registerRoute(contract: RouteContract, handler: HttpRouteHandler): void {
    this.#contracts.push(contract);

    const method = contract.method.toLowerCase() as
      | "get"
      | "post"
      | "put"
      | "patch"
      | "delete"
      | "options"
      | "head";

    this.#app[method](contract.path, async (fastifyReq: FastifyRequest, reply) => {
      // Validate boundary inputs against Zod schema
      const validation = validateRequestInput(contract, {
        params: fastifyReq.params,
        query: fastifyReq.query,
        headers: fastifyReq.headers,
        body: fastifyReq.body,
      });

      if (!validation.ok) {
        throw validation.error;
      }

      const req: HttpRequest = {
        method: contract.method,
        url: fastifyReq.url,
        path: fastifyReq.routeOptions.url ?? fastifyReq.url,
        headers: fastifyReq.headers,
        params: (fastifyReq.params as Record<string, string | undefined>) ?? {},
        query: (fastifyReq.query as Record<string, string | string[] | undefined>) ?? {},
        body: validation.value.body,
        ip: fastifyReq.ip,
        raw: fastifyReq,
      };

      // Resolve Tenant Context
      let tenantCtx: TenantContext | undefined;
      if (this.#tenantResolver) {
        if (this.#tenantResolver.mode === "single") {
          tenantCtx = DEFAULT_TENANT_CONTEXT;
        } else {
          const resolved = resolveTenantFromRequest(req, this.#tenantResolver);
          if (resolved) {
            tenantCtx = {
              tenantId: createTenantId(resolved.id ?? resolved.slug ?? "default_tenant"),
              slug: resolved.slug ?? "default",
              mode: "multi",
              isDefault: false,
            };
          }
        }
      }

      const executeHandler = () => {
        if (tenantCtx) {
          return runWithTenantContext(tenantCtx, () => handler(req));
        }
        return handler(req);
      };

      // Check Idempotency for mutating methods
      const rawIdemKey =
        fastifyReq.headers["idempotency-key"] ?? fastifyReq.headers["x-idempotency-key"];
      const idemKey = typeof rawIdemKey === "string" ? rawIdemKey.trim() : undefined;
      const isMutating = ["POST", "PUT", "PATCH", "DELETE"].includes(contract.method);

      if (this.#idempotencyManager && idemKey && isMutating) {
        const tenantId = tenantCtx?.tenantId;
        const reqHash = computeRequestHash(contract.method, fastifyReq.url, validation.value.body);
        const beginResult = this.#idempotencyManager.begin(idemKey, reqHash, tenantId);

        if (beginResult.state === "conflict") {
          throw new ConflictError(
            beginResult.reason === "concurrent"
              ? "A request with this Idempotency-Key is currently in-flight"
              : "Idempotency-Key was already used with a different request payload",
            { code: "IDEMPOTENCY_CONFLICT" },
          );
        }

        if (beginResult.state === "replayed") {
          reply.header("idempotency-replayed", "true");
          if (beginResult.response.headers) {
            for (const [k, v] of Object.entries(beginResult.response.headers)) {
              reply.header(k, v);
            }
          }
          return reply.status(beginResult.response.statusCode).send(beginResult.response.body);
        }

        let res: HttpResponse;
        try {
          res = await executeHandler();
        } catch (err) {
          this.#idempotencyManager.cancel(idemKey, tenantId);
          throw err;
        }

        this.#idempotencyManager.complete(
          idemKey,
          {
            statusCode: res.statusCode,
            headers: res.headers,
            body: res.body,
          },
          tenantId,
        );

        if (res.headers) {
          for (const [key, val] of Object.entries(res.headers)) {
            reply.header(key, val);
          }
        }

        return reply.status(res.statusCode).send(res.body);
      }

      const res = await executeHandler();

      if (res.headers) {
        for (const [key, val] of Object.entries(res.headers)) {
          reply.header(key, val);
        }
      }

      return reply.status(res.statusCode).send(res.body);
    });
  }

  async listen(port = 3000, host = "0.0.0.0"): Promise<{ port: number; host: string }> {
    await this.#app.listen({ port, host });
    const address = this.#app.server.address();
    const boundPort = typeof address === "object" && address ? address.port : port;
    return { port: boundPort, host };
  }

  #closed = false;

  async close(): Promise<void> {
    if (!this.#closed) {
      this.#closed = true;
      await this.#app.close();
    }
  }

  getUnderlyingApp(): FastifyInstance {
    return this.#app;
  }
}
