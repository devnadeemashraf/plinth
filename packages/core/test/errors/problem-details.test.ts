import { describe, expect, it } from "vitest";
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  RateLimitExceededError,
  ServiceUnavailableError,
  toProblemDetails,
  UnauthorizedError,
  ValidationError,
} from "@/errors/index.js";

describe("errors / AppError & RFC 9457 Problem Details (5-category TDD)", () => {
  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should instantiate standard AppError subclasses with correct status codes and defaults", () => {
      const baseErr = new AppError(418, "I'm a teapot", { code: "TEAPOT", title: "Teapot" });
      expect(baseErr.statusCode).toBe(418);
      expect(baseErr.code).toBe("TEAPOT");
      expect(baseErr.title).toBe("Teapot");

      const badReq = new BadRequestError("Invalid payload syntax");
      expect(badReq.statusCode).toBe(400);
      expect(badReq.code).toBe("BAD_REQUEST");
      expect(badReq.title).toBe("Bad Request");
      expect(badReq.detail).toBe("Invalid payload syntax");

      const unauth = new UnauthorizedError();
      expect(unauth.statusCode).toBe(401);
      expect(unauth.code).toBe("UNAUTHORIZED");

      const forbidden = new ForbiddenError();
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.code).toBe("FORBIDDEN");

      const notFound = new NotFoundError("User not found");
      expect(notFound.statusCode).toBe(404);
      expect(notFound.code).toBe("NOT_FOUND");
      expect(notFound.detail).toBe("User not found");

      const conflict = new ConflictError("Email already in use");
      expect(conflict.statusCode).toBe(409);
      expect(conflict.code).toBe("CONFLICT");

      const rateLimit = new RateLimitExceededError("Quota exceeded");
      expect(rateLimit.statusCode).toBe(429);
      expect(rateLimit.code).toBe("RATE_LIMIT_EXCEEDED");

      const internal = new InternalServerError();
      expect(internal.statusCode).toBe(500);
      expect(internal.code).toBe("INTERNAL_SERVER_ERROR");
      expect(internal.isOperational).toBe(false);

      const unavail = new ServiceUnavailableError();
      expect(unavail.statusCode).toBe(503);
      expect(unavail.code).toBe("SERVICE_UNAVAILABLE");
    });

    it("should serialize AppError to RFC 9457 Problem Details with all standard and extension fields", () => {
      const err = new NotFoundError("Workspace ws_123 was not found", {
        instance: "/api/v1/workspaces/ws_123",
      });

      const problem = toProblemDetails(err, { traceId: "018f6f5c8b8970008000abcdef123456" });

      expect(problem.type).toBe("about:blank");
      expect(problem.title).toBe("Not Found");
      expect(problem.status).toBe(404);
      expect(problem.detail).toBe("Workspace ws_123 was not found");
      expect(problem.instance).toBe("/api/v1/workspaces/ws_123");
      expect(problem.code).toBe("NOT_FOUND");
      expect(problem.traceId).toBe("018f6f5c8b8970008000abcdef123456");
    });

    it("should include field-level validation errors in ValidationError Problem Details", () => {
      const issues = [
        { field: "email", message: "Invalid email format", code: "invalid_string" },
        { field: "age", message: "Must be at least 18", code: "too_small" },
      ];
      const valErr = new ValidationError("Validation failed on request body", { errors: issues });

      const problem = toProblemDetails(valErr);
      expect(problem.status).toBe(422);
      expect(problem.code).toBe("VALIDATION_ERROR");
      expect(problem.title).toBe("Unprocessable Content");
      expect(problem.errors).toEqual(issues);
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should handle null, undefined, strings, numbers, and plain objects in toProblemDetails", () => {
      const pNull = toProblemDetails(null);
      expect(pNull.status).toBe(500);
      expect(pNull.code).toBe("INTERNAL_SERVER_ERROR");

      const pUndef = toProblemDetails(undefined);
      expect(pUndef.status).toBe(500);

      const pStr = toProblemDetails("raw string failure");
      expect(pStr.status).toBe(500);
      expect(pStr.code).toBe("INTERNAL_SERVER_ERROR");

      const pNum = toProblemDetails(404);
      expect(pNum.status).toBe(500);

      const pObj = toProblemDetails({ message: "custom obj error", code: "CUSTOM_FAIL" });
      expect(pObj.status).toBe(500);
    });

    it("should handle empty message and empty detail strings gracefully", () => {
      const err = new BadRequestError("");
      const problem = toProblemDetails(err);
      expect(problem.status).toBe(400);
      expect(problem.title).toBe("Bad Request");
      expect(problem.detail).toBe("");
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should produce deterministic, idempotent Problem Details output across repeated calls", () => {
      const err = new ConflictError("Tenant name collision");
      const p1 = toProblemDetails(err, { traceId: "trace-1" });
      const p2 = toProblemDetails(err, { traceId: "trace-1" });

      expect(p1).toEqual(p2);
      expect(err.message).toBe("Tenant name collision");
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should preserve error cause chain without throwing on circular cause references", () => {
      const inner: Record<string, unknown> = { message: "DB Deadlock" };
      inner["cycle"] = inner;

      const outer = new InternalServerError("Database operation failed", { cause: inner });
      const problem = toProblemDetails(outer);

      expect(problem.status).toBe(500);
      expect(problem.code).toBe("INTERNAL_SERVER_ERROR");
    });
  });

  // Category 5: Security & Abuse Cases
  describe("Category 5: Security & Abuse Cases", () => {
    it("should NEVER leak stack trace in production mode (isProduction: true)", () => {
      const err = new InternalServerError("Sensitive failure occurred");
      const problem = toProblemDetails(err, { isProduction: true });

      expect(problem.stack).toBeUndefined();
      expect(JSON.stringify(problem)).not.toContain("at describe");
      expect(JSON.stringify(problem)).not.toContain("at it");
    });

    it("should NEVER leak raw error details or SQL connection strings in unhandled 500 errors in production", () => {
      const rawDbError = new Error(
        "FATAL: password authentication failed for user 'postgres' at postgresql://postgres:SuperSecretPassword123@db.prod.internal:5432/core_db",
      );

      const problem = toProblemDetails(rawDbError, { isProduction: true });

      expect(problem.status).toBe(500);
      expect(problem.detail).toBe("An unexpected internal server error occurred.");
      expect(problem.detail).not.toContain("SuperSecretPassword123");
      expect(problem.detail).not.toContain("postgresql://");
      expect(JSON.stringify(problem)).not.toContain("SuperSecretPassword123");
    });

    it("should scrub embedded database URLs and credentials in non-production or AppError details", () => {
      const appErr = new InternalServerError(
        "Failed connecting to postgresql://app_user:s3cr3tP@ss@localhost:5432/mydb",
      );

      const problem = toProblemDetails(appErr, { isProduction: false });

      expect(problem.detail).not.toContain("s3cr3tP@ss");
      expect(problem.detail).toContain("postgresql://[REDACTED]:[REDACTED]@localhost:5432/mydb");
    });

    it("should retain stack and include instance/traceId for unhandled errors in non-production", () => {
      const nativeErr = new Error("Generic failure in worker");
      const problem = toProblemDetails(nativeErr, {
        isProduction: false,
        instance: "/workers/job_1",
        traceId: "trace_xyz",
      });

      expect(problem.status).toBe(500);
      expect(problem.instance).toBe("/workers/job_1");
      expect(problem.traceId).toBe("trace_xyz");
      expect(problem.stack).toBeDefined();
    });

    it("should eliminate ReDoS in URI credential scrubbing on 100,000 character hostile string", () => {
      const malicious = `http://${"a".repeat(100000)}`;
      const start = performance.now();
      const problem = toProblemDetails(new Error(malicious), { isProduction: false });
      const durationMs = performance.now() - start;

      expect(durationMs).toBeLessThan(100);
      expect(problem.detail).toBeDefined();
    });

    it("should scrub credentials inside ValidationError detail issues array", () => {
      const issues = [
        {
          field: "databaseUrl",
          message: "Failed connecting to postgresql://admin:p@ssword999@localhost:5432/db",
          code: "invalid_connection",
        },
      ];
      const valErr = new ValidationError("Invalid config input", { errors: issues });
      const problem = toProblemDetails(valErr);

      expect(problem.errors?.[0]?.message).not.toContain("p@ssword999");
      expect(problem.errors?.[0]?.message).toContain(
        "postgresql://[REDACTED]:[REDACTED]@localhost:5432/db",
      );
    });
  });
});
