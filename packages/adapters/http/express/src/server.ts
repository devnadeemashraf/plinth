import type { Server } from "node:http";
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
import cors from "cors";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
  Router,
} from "express";

export interface ExpressHttpAdapterOptions {
  readonly isProduction?: boolean | undefined;
  readonly logger?: LoggerPort | undefined;
  readonly openApiInfo?: Partial<OpenApiInfo> | undefined;
  readonly corsOrigins?: string[] | boolean | undefined;
  readonly securityHeaders?: SecurityHeaderOptions | boolean | undefined;
  readonly rateLimiter?: InMemoryRateLimiter | undefined;
  readonly idempotencyManager?: InMemoryIdempotencyManager | undefined;
  readonly tenantResolver?: TenantResolverOptions | undefined;
}

export class ExpressHttpAdapter implements HttpServerPort {
  readonly #app: Express;
  readonly #router: Router;
  readonly #contracts: RouteContract[] = [];
  readonly #isProduction: boolean;
  readonly #openApiInfo?: Partial<OpenApiInfo> | undefined;
  readonly #rateLimiter?: InMemoryRateLimiter | undefined;
  readonly #idempotencyManager?: InMemoryIdempotencyManager | undefined;
  readonly #tenantResolver?: TenantResolverOptions | undefined;
  #server?: Server | undefined;
  #closed = false;

  constructor(options?: ExpressHttpAdapterOptions) {
    this.#isProduction = options?.isProduction ?? false;
    this.#openApiInfo = options?.openApiInfo;
    this.#rateLimiter = options?.rateLimiter;
    this.#idempotencyManager = options?.idempotencyManager;
    this.#tenantResolver = options?.tenantResolver;

    this.#app = express();
    this.#router = Router();

    this.#setupPlugins(options);
    this.#setupSecurityHeaders(options?.securityHeaders);
    this.#setupRateLimiter();

    // Mount the dynamic router for user contracts
    this.#app.use(this.#router);

    this.#setupDocumentationRoutes();
    this.#setupErrorHandlers();
  }

  #setupPlugins(options?: ExpressHttpAdapterOptions): void {
    const isProduction = options?.isProduction ?? false;
    const corsOrigin = options?.corsOrigins ?? !isProduction;

    // 1. CORS
    this.#app.use(
      cors({
        origin: corsOrigin,
        credentials: true,
      }),
    );

    // 2. JSON Body Parser with 1MB Limit and Raw Body Preservation
    this.#app.use(
      express.json({
        limit: 1048576,
        verify: (req: Request, _res: Response, buf: Buffer) => {
          (req as unknown as { rawBody?: Buffer }).rawBody = buf;
        },
      }),
    );
  }

  #setupSecurityHeaders(options?: SecurityHeaderOptions | boolean): void {
    if (options === false) {
      return;
    }

    const headerOpts: SecurityHeaderOptions =
      typeof options === "object" ? options : { isProduction: this.#isProduction };
    const secHeaders = getSecurityHeaders(headerOpts);

    this.#app.use((_req: Request, res: Response, next: NextFunction) => {
      for (const [key, val] of Object.entries(secHeaders)) {
        res.setHeader(key, val);
      }
      next();
    });
  }

  #setupRateLimiter(): void {
    if (!this.#rateLimiter) {
      return;
    }

    const limiter = this.#rateLimiter;
    this.#app.use((req: Request, res: Response, next: NextFunction) => {
      const clientIp = req.ip || "127.0.0.1";
      const result = limiter.consume(clientIp);

      res.setHeader("ratelimit-limit", result.limit);
      res.setHeader("ratelimit-remaining", result.remaining);
      res.setHeader("ratelimit-reset", result.resetSeconds);

      if (!result.allowed) {
        res.setHeader("retry-after", result.retryAfterSeconds);
        throw new RateLimitExceededError(
          `Rate limit exceeded. Try again in ${result.retryAfterSeconds} seconds.`,
          { code: "RATE_LIMIT_EXCEEDED" },
        );
      }

      next();
    });
  }

  #setupDocumentationRoutes(): void {
    // 1. OpenAPI 3.1 JSON Specification
    this.#app.get("/openapi.json", (_req: Request, res: Response) => {
      const spec = generateOpenApiSpec(this.#contracts, this.#openApiInfo);
      res.setHeader("content-type", "application/json");
      res.send(spec);
    });

    // 2. Interactive Scalar API Reference UI
    this.#app.get("/docs", (_req: Request, res: Response) => {
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
      res.setHeader(
        "content-security-policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https://cdn.jsdelivr.net https:; connect-src 'self' https:;",
      );
      res.setHeader("content-type", "text/html");
      res.send(html);
    });
  }

  #setupErrorHandlers(): void {
    // 404 Handler
    this.#app.use((req: Request, res: Response) => {
      const notFound = new NotFoundError(`Route ${req.method} ${req.url} not found`, {
        instance: req.url,
      });
      const problem = toProblemDetails(notFound, {
        isProduction: this.#isProduction,
      });

      res.status(404).setHeader("content-type", "application/problem+json").send(problem);
    });

    // Global Error Middleware
    this.#app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      let errToSerialize: unknown = error;

      if (!(error instanceof AppError)) {
        if (error && typeof error === "object") {
          const sc =
            "status" in error && typeof (error as { status: unknown }).status === "number"
              ? (error as { status: number }).status
              : "statusCode" in error &&
                  typeof (error as { statusCode: unknown }).statusCode === "number"
                ? (error as { statusCode: number }).statusCode
                : undefined;

          const errType = (error as { type?: string }).type;

          if (sc === 400 || errType === "entity.parse.failed") {
            const message =
              "message" in error && typeof error.message === "string"
                ? error.message
                : "Bad Request";
            errToSerialize = new BadRequestError(message);
          } else if (sc === 413 || errType === "entity.too.large") {
            errToSerialize = new AppError(413, "Payload Too Large", {
              code: "PAYLOAD_TOO_LARGE",
              title: "Payload Too Large",
              detail: "Request payload exceeded 1MB bodyLimit",
            });
          } else if (sc && sc >= 400 && sc < 500) {
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

      res
        .status(problem.status)
        .setHeader("content-type", "application/problem+json")
        .send(problem);
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

    this.#router[method](contract.path, async (expressReq: Request, res: Response) => {
      // Validate boundary inputs against Zod schema
      const validation = validateRequestInput(contract, {
        params: expressReq.params,
        query: expressReq.query,
        headers: expressReq.headers,
        body: expressReq.body,
      });

      if (!validation.ok) {
        throw validation.error;
      }

      const rawBuffer = (expressReq as unknown as { rawBody?: Buffer }).rawBody;

      const req: HttpRequest = {
        method: contract.method,
        url: expressReq.originalUrl || expressReq.url,
        path: expressReq.route?.path ?? expressReq.path,
        headers: expressReq.headers,
        params: (expressReq.params as Record<string, string | undefined>) ?? {},
        query: (expressReq.query as Record<string, string | string[] | undefined>) ?? {},
        body: validation.value.body,
        rawBody: rawBuffer,
        ip: expressReq.ip,
        raw: expressReq,
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
        expressReq.headers["idempotency-key"] ?? expressReq.headers["x-idempotency-key"];
      const idemKey = typeof rawIdemKey === "string" ? rawIdemKey.trim() : undefined;
      const isMutating = ["POST", "PUT", "PATCH", "DELETE"].includes(contract.method);

      if (this.#idempotencyManager && idemKey && isMutating) {
        const tenantId = tenantCtx?.tenantId;
        const reqHash = computeRequestHash(contract.method, req.url, validation.value.body);
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
          res.setHeader("idempotency-replayed", "true");
          if (beginResult.response.headers) {
            for (const [k, v] of Object.entries(beginResult.response.headers)) {
              res.setHeader(k, v);
            }
          }
          return res.status(beginResult.response.statusCode).send(beginResult.response.body);
        }

        let response: HttpResponse;
        try {
          response = await executeHandler();
        } catch (err) {
          this.#idempotencyManager.cancel(idemKey, tenantId);
          throw err;
        }

        this.#idempotencyManager.complete(
          idemKey,
          {
            statusCode: response.statusCode,
            headers: response.headers,
            body: response.body,
          },
          tenantId,
        );

        if (response.headers) {
          for (const [key, val] of Object.entries(response.headers)) {
            res.setHeader(key, val);
          }
        }

        return res.status(response.statusCode).send(response.body);
      }

      const result = await executeHandler();

      if (result.headers) {
        for (const [key, val] of Object.entries(result.headers)) {
          res.setHeader(key, val);
        }
      }

      return res.status(result.statusCode).send(result.body);
    });
  }

  async listen(port = 3000, host = "0.0.0.0"): Promise<{ port: number; host: string }> {
    return new Promise<{ port: number; host: string }>((resolve, reject) => {
      try {
        const srv = this.#app.listen(port, host, () => {
          this.#server = srv;
          const address = srv.address();
          const boundPort = typeof address === "object" && address ? address.port : port;
          resolve({ port: boundPort, host });
        });
        srv.on("error", reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  async close(): Promise<void> {
    if (!this.#closed) {
      this.#closed = true;
      if (this.#server) {
        await new Promise<void>((resolve, reject) => {
          this.#server?.close((err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      }
    }
  }

  getUnderlyingApp(): Express {
    return this.#app;
  }
}
