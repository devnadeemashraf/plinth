import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generateOpenApiSpec } from "@/contracts/openapi.js";
import { defineRoute } from "@/contracts/route.js";

describe("contracts / generateOpenApiSpec (5-category TDD)", () => {
  const sampleContract = defineRoute({
    method: "POST",
    path: "/api/v1/items/:id",
    summary: "Update Item",
    description: "Updates an item by ID",
    tags: ["Items"],
    paramsSchema: z.strictObject({
      id: z.string().describe("Item UUID identifier"),
    }),
    querySchema: z.strictObject({
      dryRun: z.enum(["true", "false"]).optional(),
    }),
    bodySchema: z.strictObject({
      name: z.string(),
      count: z.number().int(),
    }),
    responseSchemas: {
      200: z.strictObject({
        id: z.string(),
        updated: z.boolean(),
      }),
    },
  });

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should generate a valid OpenAPI 3.1.0 document from RouteContracts", () => {
      const doc = generateOpenApiSpec([sampleContract], {
        title: "Test API",
        version: "1.0.0",
        description: "Test API documentation",
      });

      expect(doc.openapi).toBe("3.1.0");
      expect(doc.info.title).toBe("Test API");
      expect(doc.info.version).toBe("1.0.0");

      // Verify path conversion: `:id` -> `{id}`
      expect(doc.paths["/api/v1/items/{id}"]).toBeDefined();
      const postOp = doc.paths["/api/v1/items/{id}"]?.post;
      expect(postOp).toBeDefined();
      expect(postOp?.summary).toBe("Update Item");
      expect(postOp?.tags).toEqual(["Items"]);

      // Verify parameters
      expect(postOp?.parameters).toBeDefined();
      const pathParam = postOp?.parameters?.find((p) => p.name === "id" && p.in === "path");
      expect(pathParam).toBeDefined();
      expect(pathParam?.required).toBe(true);

      // Verify request body
      expect(postOp?.requestBody).toBeDefined();
      expect(postOp?.requestBody?.content["application/json"]).toBeDefined();

      // Verify 200 response and standard RFC 9457 error responses
      expect(postOp?.responses["200"]).toBeDefined();
      expect(postOp?.responses["422"]).toBeDefined();
      expect(postOp?.responses["500"]).toBeDefined();
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should handle empty route contracts list and default metadata", () => {
      const doc = generateOpenApiSpec([]);
      expect(doc.openapi).toBe("3.1.0");
      expect(doc.paths).toEqual({});
      expect(doc.info.title).toBeDefined();
    });

    it("should handle routes with no params, query, or body schemas", () => {
      const simpleGet = defineRoute({
        method: "GET",
        path: "/health/live",
        summary: "Liveness Check",
        responseSchemas: {
          200: z.strictObject({ status: z.string() }),
        },
      });

      const doc = generateOpenApiSpec([simpleGet]);
      const getOp = doc.paths["/health/live"]?.get;
      expect(getOp).toBeDefined();
      expect(getOp?.parameters).toBeUndefined();
      expect(getOp?.requestBody).toBeUndefined();
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should produce deterministic, idempotent spec generation", () => {
      const spec1 = generateOpenApiSpec([sampleContract]);
      const spec2 = generateOpenApiSpec([sampleContract]);
      expect(JSON.stringify(spec1)).toBe(JSON.stringify(spec2));
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should normalize duplicate route definitions gracefully", () => {
      const doc = generateOpenApiSpec([sampleContract, sampleContract]);
      expect(Object.keys(doc.paths)).toHaveLength(1);
    });
  });

  // Category 5: Security & Abuse Cases
  describe("Category 5: Security & Abuse Cases", () => {
    it("should define RFC 9457 Problem Details schema in components without leaking internal structures", () => {
      const doc = generateOpenApiSpec([sampleContract]);
      expect(doc.components?.schemas?.["ProblemDetails"]).toBeDefined();
      const problemSchema = doc.components?.schemas?.["ProblemDetails"] as Record<string, unknown>;
      expect(problemSchema["properties"]).toHaveProperty("status");
      expect(problemSchema["properties"]).toHaveProperty("detail");
      expect(problemSchema["properties"]).toHaveProperty("traceId");
    });
  });
});
