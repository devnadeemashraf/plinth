import cors from "@fastify/cors";
import {
  AppError,
  BadRequestError,
  generateOpenApiSpec,
  type HttpRequest,
  type HttpRouteHandler,
  type HttpServerPort,
  type LoggerPort,
  NotFoundError,
  type OpenApiInfo,
  type RouteContract,
  toProblemDetails,
  validateRequestInput,
} from "@plinth/core";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";

export interface FastifyHttpAdapterOptions {
  readonly isProduction?: boolean | undefined;
  readonly logger?: LoggerPort | undefined;
  readonly openApiInfo?: Partial<OpenApiInfo> | undefined;
  readonly corsOrigins?: string[] | boolean | undefined;
}

export class FastifyHttpAdapter implements HttpServerPort {
  readonly #app: FastifyInstance;
  readonly #contracts: RouteContract[] = [];
  readonly #isProduction: boolean;
  readonly #openApiInfo?: Partial<OpenApiInfo> | undefined;

  constructor(options?: FastifyHttpAdapterOptions) {
    this.#isProduction = options?.isProduction ?? false;
    this.#openApiInfo = options?.openApiInfo;

    this.#app = Fastify({
      logger: false,
      bodyLimit: 1048576,
    });

    this.#setupPlugins(options);
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
      return reply.type("text/html").send(html);
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

      const res = await handler(req);

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
