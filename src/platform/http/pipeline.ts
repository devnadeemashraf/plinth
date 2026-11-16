import type { AwilixContainer } from "awilix";
import type { ZodError, ZodType } from "zod";
import type { Config } from "#platform/config/schema.ts";
import { createRequestScope } from "#platform/di/container.ts";
import type { Cradle } from "#platform/di/cradle.ts";
import { AppError, platformErrors } from "#platform/kernel/errors.ts";
import type { HttpResult, RouteDefinition } from "#platform/kernel/http.ts";
import type { IdGenerator } from "#platform/kernel/ports/id-generator.ts";
import type { Logger } from "#platform/kernel/ports/logger.ts";
import { type ProblemFieldError, toProblem } from "#platform/kernel/problem.ts";

/** A request as the adapter hands it over; framework objects never pass this point. */
export interface NeutralRequest {
  readonly method: string;
  /** The concrete path, used as the problem `instance`. */
  readonly path: string;
  /** Lower-cased names; repeated headers joined with ", ". */
  readonly headers: Readonly<Record<string, string>>;
  readonly params: Readonly<Record<string, string>>;
  readonly query: unknown;
  readonly body: unknown;
  readonly ip: string;
  /** Set by the adapter when the body could not be read (malformed, too large). */
  readonly bodyError?: AppError;
}

export interface NeutralResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: unknown;
}

export interface PipelineDeps {
  readonly config: Pick<Config, "NODE_ENV" | "CORS_ORIGINS">;
  readonly logger: Logger;
  readonly idGenerator: IdGenerator;
  readonly container: AwilixContainer<Cradle>;
}

/** A route as the pipeline sees it: platform routes may carry settings modules cannot. */
export interface PipelineRoute extends RouteDefinition {
  /** Replaces the default Content-Security-Policy; only platform pages (API docs) set it. */
  readonly contentSecurityPolicy?: string;
}

export interface Pipeline {
  handle(request: NeutralRequest, route: PipelineRoute): Promise<NeutralResponse>;
}

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;
const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE";
const ALLOWED_HEADERS = "authorization, content-type, idempotency-key, x-request-id";

/** Answers every request that matches no route (any path, or a known path with another method). */
export const notFoundRoute: RouteDefinition = {
  method: "GET",
  path: "(unmatched)",
  summary: "Unmatched route",
  description: "Fallback for requests that match no registered route.",
  tags: [],
  auth: "public",
  request: {},
  responses: {},
  errors: [platformErrors.NOT_FOUND],
  handler: () => Promise.reject(new AppError(platformErrors.NOT_FOUND)),
};

const DEFAULT_CSP = "default-src 'none'; frame-ancestors 'none'";

function securityHeaders(production: boolean, csp: string | undefined): Record<string, string> {
  return {
    "content-security-policy": csp ?? DEFAULT_CSP,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cross-origin-resource-policy": "same-origin",
    "x-frame-options": "DENY",
    ...(production ? { "strict-transport-security": "max-age=31536000; includeSubDomains" } : {}),
  };
}

function corsHeaders(
  origin: string | undefined,
  allowed: readonly string[],
): Record<string, string> {
  if (origin === undefined || !allowed.includes(origin)) {
    return { vary: "origin" };
  }
  return {
    vary: "origin",
    "access-control-allow-origin": origin,
    "access-control-expose-headers": "x-request-id",
  };
}

function preflight(origin: string | undefined, allowed: readonly string[]): HttpResult {
  if (origin === undefined || !allowed.includes(origin)) {
    return { status: 204 };
  }
  return {
    status: 204,
    headers: {
      "access-control-allow-methods": ALLOWED_METHODS,
      "access-control-allow-headers": ALLOWED_HEADERS,
      "access-control-max-age": "600",
    },
  };
}

function fieldErrors(location: string, error: ZodError): ProblemFieldError[] {
  return error.issues.flatMap((issue) => {
    const base = [location, ...issue.path.map(String)];
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => ({
        path: [...base, key].join("."),
        message: "Unknown field",
      }));
    }
    return [{ path: base.join("."), message: issue.message }];
  });
}

interface ValidInput {
  params: unknown;
  query: unknown;
  body: unknown;
}

function validateInput(route: RouteDefinition, request: NeutralRequest): ValidInput {
  const input: ValidInput = { params: {}, query: {}, body: undefined };
  const errors: ProblemFieldError[] = [];
  for (const part of ["params", "query", "body"] as const) {
    const schema: ZodType | undefined = route.request[part];
    if (schema === undefined) {
      continue;
    }
    const result = schema.safeParse(request[part]);
    if (result.success) {
      input[part] = result.data;
    } else {
      errors.push(...fieldErrors(part, result.error));
    }
  }
  if (errors.length > 0) {
    throw new AppError(platformErrors.VALIDATION_FAILED, { details: { errors } });
  }
  return input;
}

function checkResponse(route: RouteDefinition, result: HttpResult): void {
  const outcome = route.responses[result.status]?.schema.safeParse(result.body);
  if (outcome?.success !== true) {
    throw new AppError(platformErrors.INTERNAL, {
      message: `Response ${result.status} does not match ${route.method} ${route.path}`,
      cause: outcome?.error,
    });
  }
}

/** The framework-neutral request pipeline (SPEC §3.5). */
export function createPipeline(deps: PipelineDeps): Pipeline {
  const production = deps.config.NODE_ENV === "production";

  async function run(
    request: NeutralRequest,
    route: RouteDefinition,
    requestId: string,
    logger: Logger,
  ): Promise<HttpResult> {
    if (request.method === "OPTIONS") {
      return preflight(request.headers["origin"], deps.config.CORS_ORIGINS);
    }
    if (request.bodyError) {
      throw request.bodyError;
    }
    const input = validateInput(route, request);
    const result = await route.handler({
      requestId,
      logger,
      container: createRequestScope(deps.container, { logger }),
      ...input,
      headers: request.headers,
      ip: request.ip,
    });
    if (!production) {
      checkResponse(route, result);
    }
    return result;
  }

  return {
    async handle(request, route) {
      const started = performance.now();
      const incoming = request.headers["x-request-id"];
      const requestId =
        incoming !== undefined && REQUEST_ID.test(incoming) ? incoming : deps.idGenerator.next();
      const logger = deps.logger.child({ requestId });

      let result: HttpResult;
      try {
        result = await run(request, route, requestId, logger);
      } catch (error) {
        const problem = toProblem(error, { requestId, instance: request.path });
        if (problem.status >= 500) {
          logger.error({ err: error, route: route.path }, "request failed");
        }
        result = {
          status: problem.status,
          body: problem,
          headers: { "content-type": "application/problem+json" },
        };
      }

      const response: NeutralResponse = {
        status: result.status,
        headers: {
          ...(result.body === undefined ? {} : { "content-type": "application/json" }),
          ...result.headers,
          ...corsHeaders(request.headers["origin"], deps.config.CORS_ORIGINS),
          ...securityHeaders(production, route.contentSecurityPolicy),
          "x-request-id": requestId,
        },
        ...(result.body === undefined ? {} : { body: result.body }),
      };
      logger.info(
        {
          method: request.method,
          route: route.path,
          status: response.status,
          durationMs: Math.round(performance.now() - started),
        },
        "request",
      );
      return response;
    },
  };
}

/** Throws at boot for route settings whose enforcement does not exist yet. */
export function assertSupported(route: RouteDefinition): void {
  if (route.rateLimit !== undefined || route.idempotent !== undefined || route.auth !== "public") {
    throw new Error(`Not supported until E01/E03: ${route.method} ${route.path}`);
  }
}
