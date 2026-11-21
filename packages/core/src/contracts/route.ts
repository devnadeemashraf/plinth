import type { z } from "zod";
import { ValidationError, type ValidationErrorDetail } from "@/errors/app-error.js";
import type { HttpMethod } from "@/ports/http.js";
import { err, ok, type Result } from "@/primitives/result.js";

export interface RouteContract {
  readonly method: HttpMethod;
  readonly path: string;
  readonly summary?: string | undefined;
  readonly description?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly isPublic?: boolean | undefined;
  readonly paramsSchema?: z.ZodTypeAny | undefined;
  readonly querySchema?: z.ZodTypeAny | undefined;
  readonly headersSchema?: z.ZodTypeAny | undefined;
  readonly bodySchema?: z.ZodTypeAny | undefined;
  readonly responseSchemas?: Record<number, z.ZodTypeAny> | undefined;
}

export function defineRoute(contract: RouteContract): RouteContract {
  return Object.freeze(contract);
}

export interface ValidatedRequest {
  readonly params?: unknown;
  readonly query?: unknown;
  readonly headers?: unknown;
  readonly body?: unknown;
}

export function validateRequestInput(
  contract: RouteContract,
  input: { params?: unknown; query?: unknown; headers?: unknown; body?: unknown },
): Result<ValidatedRequest, ValidationError> {
  const issues: ValidationErrorDetail[] = [];

  let parsedParams = input.params;
  if (contract.paramsSchema) {
    const res = contract.paramsSchema.safeParse(input.params ?? {});
    if (res.success) {
      parsedParams = res.data;
    } else {
      for (const issue of res.error.issues) {
        issues.push({
          field: `params.${issue.path.join(".")}`,
          message: issue.message,
          code: issue.code,
        });
      }
    }
  }

  let parsedQuery = input.query;
  if (contract.querySchema) {
    const res = contract.querySchema.safeParse(input.query ?? {});
    if (res.success) {
      parsedQuery = res.data;
    } else {
      for (const issue of res.error.issues) {
        issues.push({
          field: `query.${issue.path.join(".")}`,
          message: issue.message,
          code: issue.code,
        });
      }
    }
  }

  let parsedHeaders = input.headers;
  if (contract.headersSchema) {
    const res = contract.headersSchema.safeParse(input.headers ?? {});
    if (res.success) {
      parsedHeaders = res.data;
    } else {
      for (const issue of res.error.issues) {
        issues.push({
          field: `headers.${issue.path.join(".")}`,
          message: issue.message,
          code: issue.code,
        });
      }
    }
  }

  let parsedBody = input.body;
  if (contract.bodySchema) {
    const res = contract.bodySchema.safeParse(input.body ?? {});
    if (res.success) {
      parsedBody = res.data;
    } else {
      for (const issue of res.error.issues) {
        issues.push({
          field: `body.${issue.path.join(".")}`,
          message: issue.message,
          code: issue.code,
        });
      }
    }
  }

  if (issues.length > 0) {
    return err(
      new ValidationError("Validation failed on request", {
        errors: issues,
      }),
    );
  }

  return ok({
    params: parsedParams,
    query: parsedQuery,
    headers: parsedHeaders,
    body: parsedBody,
  });
}
