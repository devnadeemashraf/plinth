import { describe, expect, it } from "vitest";
import { createInMemoryTracer, type TracingPort } from "@/observability/tracing.js";

describe("observability / TracingPort & context propagation (5-category TDD)", () => {
  const tracer: TracingPort = createInMemoryTracer();

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should generate and return W3C compliant traceId (32 hex) and spanId (16 hex)", () => {
      const ctx = tracer.getTraceContext();
      expect(ctx.traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(ctx.spanId).toMatch(/^[0-9a-f]{16}$/);
    });

    it("should execute withSpan and propagate span context to inner operations", async () => {
      let innerTraceId = "";
      let innerSpanId = "";

      const result = await tracer.withSpan("order.checkout", async (span) => {
        span.setAttribute("order.amount", 2500);
        const ctx = tracer.getTraceContext();
        innerTraceId = ctx.traceId;
        innerSpanId = ctx.spanId;
        return "checkout-complete";
      });

      expect(result).toBe("checkout-complete");
      expect(innerTraceId).toMatch(/^[0-9a-f]{32}$/);
      expect(innerSpanId).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should allow empty span names and handle undefined attributes gracefully", async () => {
      await tracer.withSpan("", async (span) => {
        span.setAttribute("", "ignored-empty-key");
        span.setAttribute("empty_val", undefined as unknown as string);
        expect(span.getAttributes()[""]).toBeUndefined();
      });
      // Should complete without error
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should maintain isolated trace IDs across concurrent async workflows", async () => {
      const runWorkflow = async (id: string) => {
        return tracer.withSpan(`workflow-${id}`, async () => {
          await new Promise((r) => setTimeout(r, 5));
          return tracer.getTraceContext().traceId;
        });
      };

      const [traceA, traceB] = await Promise.all([runWorkflow("A"), runWorkflow("B")]);
      expect(traceA).not.toBe(traceB);
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should record error status and rethrow when inner function fails", async () => {
      const expectedError = new Error("Downstream service timeout");

      await expect(
        tracer.withSpan("faulty.operation", async () => {
          throw expectedError;
        }),
      ).rejects.toThrow("Downstream service timeout");
    });
  });

  // Category 5: Security & Abuse Cases
  describe("Category 5: Security & Abuse Cases", () => {
    it("should redact sensitive attribute keys from span metadata", async () => {
      await tracer.withSpan("secure.span", async (span) => {
        span.setAttribute("password", "super-secret");
        span.setAttribute("authorization", "Bearer token-123");
        span.setAttribute("user.id", "usr_123");

        const attrs = span.getAttributes();
        expect(attrs["password"]).toBe("[REDACTED]");
        expect(attrs["authorization"]).toBe("[REDACTED]");
        expect(attrs["user.id"]).toBe("usr_123");
      });
    });
  });
});
