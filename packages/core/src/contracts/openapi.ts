import { z } from "zod";
import type { RouteContract } from "@/contracts/route.js";

export interface OpenApiInfo {
  readonly title: string;
  readonly version: string;
  readonly description?: string | undefined;
}

export interface OpenApiParameter {
  readonly name: string;
  readonly in: "path" | "query" | "header" | "cookie";
  readonly required?: boolean | undefined;
  readonly description?: string | undefined;
  readonly schema: unknown;
}

export interface OpenApiOperation {
  readonly summary?: string | undefined;
  readonly description?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly parameters?: readonly OpenApiParameter[] | undefined;
  readonly requestBody?:
    | {
        readonly required?: boolean | undefined;
        readonly content: Record<string, { readonly schema: unknown }>;
      }
    | undefined;
  readonly responses: Record<
    string,
    {
      readonly description: string;
      readonly content?: Record<string, { readonly schema: unknown }> | undefined;
    }
  >;
}

export interface OpenApiPathItem {
  get?: OpenApiOperation | undefined;
  post?: OpenApiOperation | undefined;
  put?: OpenApiOperation | undefined;
  patch?: OpenApiOperation | undefined;
  delete?: OpenApiOperation | undefined;
  options?: OpenApiOperation | undefined;
  head?: OpenApiOperation | undefined;
}

export interface OpenApiDocument {
  readonly openapi: "3.1.0";
  readonly info: OpenApiInfo;
  readonly paths: Record<string, OpenApiPathItem>;
  readonly components?:
    | {
        readonly schemas?: Record<string, unknown> | undefined;
      }
    | undefined;
}

const PROBLEM_DETAILS_SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", format: "uri", default: "about:blank" },
    title: { type: "string" },
    status: { type: "integer" },
    detail: { type: "string" },
    instance: { type: "string", format: "uri-reference" },
    code: { type: "string" },
    traceId: { type: "string" },
    errors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string" },
          message: { type: "string" },
          code: { type: "string" },
        },
        required: ["message"],
      },
    },
  },
  required: ["type", "title", "status", "detail"],
};

function expressPathToOpenApiPath(path: string): string {
  return path.replace(/:([a-zA-Z0-9_]+)/g, "{$1}");
}

function extractParametersFromSchema(
  schema: z.ZodTypeAny | undefined,
  location: "path" | "query" | "header",
): OpenApiParameter[] {
  if (!schema) {
    return [];
  }

  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  const properties = (jsonSchema["properties"] as Record<string, Record<string, unknown>>) ?? {};
  const requiredList = Array.isArray(jsonSchema["required"])
    ? (jsonSchema["required"] as string[])
    : [];

  const params: OpenApiParameter[] = [];
  for (const [key, propSchema] of Object.entries(properties)) {
    params.push({
      name: key,
      in: location,
      required: location === "path" ? true : requiredList.includes(key),
      description:
        typeof propSchema["description"] === "string" ? propSchema["description"] : undefined,
      schema: propSchema,
    });
  }

  return params;
}

export function generateOpenApiSpec(
  contracts: readonly RouteContract[],
  info?: Partial<OpenApiInfo>,
): OpenApiDocument {
  const openApiDocInfo: OpenApiInfo = {
    title: info?.title ?? "Plinth Application API",
    version: info?.version ?? "1.0.0",
    description: info?.description ?? "API specifications generated from Plinth RouteContracts",
  };

  const paths: Record<string, OpenApiPathItem> = {};

  for (const contract of contracts) {
    const openApiPath = expressPathToOpenApiPath(contract.path);
    const existingPathItem = paths[openApiPath] ?? {};

    const parameters: OpenApiParameter[] = [
      ...extractParametersFromSchema(contract.paramsSchema, "path"),
      ...extractParametersFromSchema(contract.querySchema, "query"),
      ...extractParametersFromSchema(contract.headersSchema, "header"),
    ];

    const responses: Record<
      string,
      { description: string; content?: Record<string, { schema: unknown }> }
    > = {};

    if (contract.responseSchemas) {
      for (const [statusCodeStr, schema] of Object.entries(contract.responseSchemas)) {
        if (statusCodeStr === "204" || schema instanceof z.ZodUndefined) {
          responses[statusCodeStr] = {
            description: `No content for status ${statusCodeStr}`,
          };
          continue;
        }

        responses[statusCodeStr] = {
          description: `Response for status ${statusCodeStr}`,
          content: {
            "application/json": {
              schema: z.toJSONSchema(schema),
            },
          },
        };
      }
    }

    // Automatically inject RFC 9457 error responses if not defined
    if (!responses["422"]) {
      responses["422"] = {
        description: "RFC 9457 Validation Error",
        content: {
          "application/problem+json": {
            schema: { $ref: "#/components/schemas/ProblemDetails" },
          },
        },
      };
    }
    if (!responses["500"]) {
      responses["500"] = {
        description: "RFC 9457 Internal Server Error",
        content: {
          "application/problem+json": {
            schema: { $ref: "#/components/schemas/ProblemDetails" },
          },
        },
      };
    }

    let requestBody: OpenApiOperation["requestBody"];
    if (contract.bodySchema) {
      requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: z.toJSONSchema(contract.bodySchema),
          },
        },
      };
    }

    const operation: OpenApiOperation = {
      summary: contract.summary,
      description: contract.description,
      tags: contract.tags ? [...contract.tags] : undefined,
      parameters: parameters.length > 0 ? parameters : undefined,
      requestBody,
      responses,
    };

    const methodKey = contract.method.toLowerCase() as keyof OpenApiPathItem;
    existingPathItem[methodKey] = operation;
    paths[openApiPath] = existingPathItem;
  }

  return {
    openapi: "3.1.0",
    info: openApiDocInfo,
    paths,
    components: {
      schemas: {
        ProblemDetails: PROBLEM_DETAILS_SCHEMA,
      },
    },
  };
}
