import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineRoute, type RouteContract, validateRequestInput } from "@/contracts/route.js";
import { isOk } from "@/primitives/result.js";

describe("contracts / RouteContract & request validation (5-category TDD)", () => {
  const sampleContract: RouteContract = defineRoute({
    method: "POST",
    path: "/api/v1/items/:id",
    summary: "Create or update item",
    description: "Endpoint to create or update an item with strict validation",
    tags: ["Items"],
    paramsSchema: z.strictObject({
      id: z.string().min(1),
    }),
    querySchema: z.strictObject({
      dryRun: z.enum(["true", "false"]).optional(),
    }),
    headersSchema: z.object({
      "x-client-id": z.string().optional(),
    }),
    bodySchema: z.strictObject({
      name: z.string().min(2).max(50),
      quantity: z.number().int().positive(),
    }),
    responseSchemas: {
      200: z.strictObject({
        success: z.boolean(),
        id: z.string(),
      }),
    },
  });

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should validate and parse valid params, query, and body", () => {
      const result = validateRequestInput(sampleContract, {
        params: { id: "item_123" },
        query: { dryRun: "true" },
        headers: { "x-client-id": "client_abc" },
        body: { name: "Widget", quantity: 5 },
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.params).toEqual({ id: "item_123" });
        expect(result.value.query).toEqual({ dryRun: "true" });
        expect(result.value.body).toEqual({ name: "Widget", quantity: 5 });
      }
    });

    it("should accept optional fields when omitted", () => {
      const result = validateRequestInput(sampleContract, {
        params: { id: "item_456" },
        body: { name: "Gadget", quantity: 1 },
      });

      expect(isOk(result)).toBe(true);
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should reject empty params or empty body", () => {
      const result = validateRequestInput(sampleContract, {
        params: { id: "" },
        body: {},
      });

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.statusCode).toBe(422);
        expect(result.error.errors).toBeDefined();
        expect(result.error.errors?.length).toBeGreaterThan(0);
      }
    });

    it("should reject extraneous unknown fields on strict schemas", () => {
      const result = validateRequestInput(sampleContract, {
        params: { id: "item_123" },
        body: {
          name: "Valid Name",
          quantity: 2,
          hackedField: "injected", // Should be rejected by strictObject
        },
      });

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
      }
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should produce deterministic validation results across multiple invocations", () => {
      const payload = {
        params: { id: "item_repeat" },
        body: { name: "Deterministic", quantity: 10 },
      };

      const res1 = validateRequestInput(sampleContract, payload);
      const res2 = validateRequestInput(sampleContract, payload);

      expect(isOk(res1)).toBe(true);
      expect(isOk(res2)).toBe(true);
      if (isOk(res1) && isOk(res2)) {
        expect(res1.value).toEqual(res2.value);
      }
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should handle null or non-object inputs gracefully without crashing", () => {
      const resNull = validateRequestInput(sampleContract, {
        params: null,
        body: null,
      });

      expect(isOk(resNull)).toBe(false);
      if (!isOk(resNull)) {
        expect(resNull.error.statusCode).toBe(422);
      }
    });
  });

  // Category 5: Security & Abuse Cases
  describe("Category 5: Security & Abuse Cases", () => {
    it("should prevent prototype pollution in request body validation", () => {
      const pollutedBody = JSON.parse('{"name":"Safe","quantity":1,"__proto__":{"polluted":true}}');
      const result = validateRequestInput(sampleContract, {
        params: { id: "item_clean" },
        body: pollutedBody,
      });

      // Strict schema rejects prototype pollution attempt as an unrecognized property
      expect(result.ok).toBe(false);
      // Verify global prototype was not mutated
      expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    });
  });
});
