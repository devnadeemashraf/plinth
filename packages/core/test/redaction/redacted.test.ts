import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { isRedacted, redacted } from "@/redaction/redacted.js";

describe("redaction / Redacted<T> (5-category TDD)", () => {
  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should wrap sensitive value and allow explicit unwrap/reveal", () => {
      const secret = "my-super-secret-api-key";
      const wrapped = redacted(secret);

      expect(isRedacted(wrapped)).toBe(true);
      expect(isRedacted(secret)).toBe(false);
      expect(wrapped.reveal()).toBe(secret);
      expect(wrapped.unwrap()).toBe(secret);
    });

    it("should wrap objects and arrays correctly", () => {
      const sensitiveObj = { apiKey: "secret-123", salt: "abc" };
      const wrappedObj = redacted(sensitiveObj);

      expect(isRedacted(wrappedObj)).toBe(true);
      expect(wrappedObj.reveal()).toEqual(sensitiveObj);
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should safely wrap null, undefined, empty string, and zero", () => {
      const rNull = redacted(null);
      expect(rNull.reveal()).toBe(null);
      expect(JSON.stringify(rNull)).toBe('"[REDACTED]"');

      const rUndef = redacted(undefined);
      expect(rUndef.reveal()).toBe(undefined);
      expect(JSON.stringify(rUndef)).toBe('"[REDACTED]"');

      const rEmpty = redacted("");
      expect(rEmpty.reveal()).toBe("");
      expect(JSON.stringify(rEmpty)).toBe('"[REDACTED]"');

      const rZero = redacted(0);
      expect(rZero.reveal()).toBe(0);
      expect(JSON.stringify(rZero)).toBe('"[REDACTED]"');
    });

    it("should return false for isRedacted on non-redacted objects and primitives", () => {
      expect(isRedacted(null)).toBe(false);
      expect(isRedacted(undefined)).toBe(false);
      expect(isRedacted("string")).toBe(false);
      expect(isRedacted(123)).toBe(false);
      expect(isRedacted({ toJSON: () => "[REDACTED]" })).toBe(false);
      expect(isRedacted([])).toBe(false);
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should provide immutable unwrap across multiple calls without mutating the wrapped value", () => {
      const original = { token: "tok_123" };
      const wrapped = redacted(original);

      expect(wrapped.reveal()).toBe(original);
      expect(wrapped.reveal()).toBe(original);
      expect(wrapped.unwrap()).toBe(original);
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should prevent prototype pollution or property mutation on Redacted instance", () => {
      const wrapped = redacted("secret");
      expect(() => {
        // @ts-expect-error - testing immutability
        wrapped.foo = "bar";
      }).toThrow();
    });

    it("should safely handle Redacted inside Error cause without leaking", () => {
      const sensitiveToken = "Bearer secret-token-xyz";
      const err = new Error("Failed upstream call", {
        cause: { token: redacted(sensitiveToken) },
      });

      const serialized = JSON.stringify(err.cause);
      expect(serialized).not.toContain(sensitiveToken);
      expect(serialized).toContain("[REDACTED]");
    });
  });

  // Category 5: Security & Abuse Cases
  describe("Category 5: Security & Abuse Cases", () => {
    it("should NEVER leak raw secret through JSON.stringify", () => {
      const rawSecret = "super-confidential-password-12345";
      const user = {
        id: "usr_018f6f5c8b89",
        email: "user@example.com",
        password: redacted(rawSecret),
      };

      const json = JSON.stringify(user);
      expect(json).not.toContain(rawSecret);
      expect(json).toContain('"password":"[REDACTED]"');
    });

    it("should NEVER leak raw secret through String() or template literals", () => {
      const rawSecret = "super-confidential-password-12345";
      const wrapped = redacted(rawSecret);

      expect(wrapped.toString()).toBe("[REDACTED]");
      expect(wrapped[Symbol.toPrimitive]()).toBe("[REDACTED]");
      expect(wrapped[inspect.custom]()).toBe("[REDACTED]");
      expect(String(wrapped)).toBe("[REDACTED]");
      expect(`${wrapped}`).toBe("[REDACTED]");
      // biome-ignore lint/style/useTemplate: testing implicit string coercion
      expect(wrapped + "").toBe("[REDACTED]");
    });

    it("should NEVER leak raw secret through util.inspect (used by console.log and debuggers)", () => {
      const rawSecret = "super-confidential-password-12345";
      const wrapped = redacted(rawSecret);

      const inspection = inspect(wrapped);
      expect(inspection).not.toContain(rawSecret);
      expect(inspection).toContain("[REDACTED]");

      const containerInspection = inspect({ secret: wrapped });
      expect(containerInspection).not.toContain(rawSecret);
      expect(containerInspection).toContain("[REDACTED]");
    });
  });
});
