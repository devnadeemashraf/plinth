import { z } from "zod";
import {
  createDocument,
  type oas31,
  type ZodObjectInput,
  type ZodOpenApiOperationObject,
  type ZodOpenApiPathsObject,
  type ZodOpenApiResponsesObject,
} from "zod-openapi";
import type { ErrorDefinition } from "#platform/kernel/errors.ts";
import type { RouteDefinition } from "#platform/kernel/http.ts";

/** The RFC 9457 body every error response carries (see `#platform/kernel/problem.ts`). */
const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.int(),
  detail: z.string(),
  instance: z.string(),
  code: z.string(),
  requestId: z.string(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

const PROBLEM_REF = { $ref: "#/components/schemas/ProblemDetails" };

/** `GET /v1/plans/{key}` → `get_v1_plans_key`. */
export function operationId(method: string, path: string): string {
  return `${method}_${path}`
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_|_$/g, "");
}

function responses(route: RouteDefinition): ZodOpenApiResponsesObject {
  const result: ZodOpenApiResponsesObject = {};
  for (const [status, response] of Object.entries(route.responses)) {
    result[status as `2${string}`] = {
      description: response.description,
      content: { "application/json": { schema: response.schema, example: response.example } },
    };
  }
  const errorsByStatus = new Map<number, ErrorDefinition[]>();
  for (const error of route.errors) {
    errorsByStatus.set(error.status, [...(errorsByStatus.get(error.status) ?? []), error]);
  }
  for (const [status, errors] of errorsByStatus) {
    const key = String(status) as `4${string}`;
    result[key] ??= {
      description: errors.map((error) => error.title).join("; "),
      content: { "application/problem+json": { schema: PROBLEM_REF } },
    };
  }
  return result;
}

function operation(route: RouteDefinition): ZodOpenApiOperationObject {
  const { params, query, body } = route.request;
  return {
    operationId: operationId(route.method, route.path),
    summary: route.summary,
    description: route.description,
    tags: route.tags,
    ...(params || query
      ? {
          requestParams: {
            ...(params ? { path: params as ZodObjectInput } : {}),
            ...(query ? { query: query as ZodObjectInput } : {}),
          },
        }
      : {}),
    ...(body
      ? { requestBody: { required: true, content: { "application/json": { schema: body } } } }
      : {}),
    responses: responses(route),
  };
}

/** The OpenAPI 3.1 document for `routes`; the same routes always give the same document. */
export function buildDocument(
  routes: readonly RouteDefinition[],
  version: string,
): oas31.OpenAPIObject {
  const paths: ZodOpenApiPathsObject = {};
  for (const route of routes) {
    const method = route.method.toLowerCase() as Lowercase<RouteDefinition["method"]>;
    paths[route.path] = { ...paths[route.path], [method]: operation(route) };
  }
  return createDocument({
    openapi: "3.1.0",
    info: { title: "Plinth API", version },
    servers: [{ url: "/" }],
    paths,
    components: { schemas: { ProblemDetails: problemDetailsSchema } },
  }) as oas31.OpenAPIObject;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** JSON with keys sorted at every depth, 2-space indent and a trailing newline. */
export function serializeDocument(document: unknown): string {
  return `${JSON.stringify(sortKeys(document), null, 2)}\n`;
}
