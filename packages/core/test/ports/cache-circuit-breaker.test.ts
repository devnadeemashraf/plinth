import { describe, expect, it, vi } from "vitest";
import { CacheCircuitBreaker, type CircuitBreakerState } from "@/ports/cache.js";

describe("CacheCircuitBreaker - 5-Category Test Matrix", () => {
  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should start in CLOSED state and execute function successfully", async () => {
      const breaker = new CacheCircuitBreaker();
      expect(breaker.getState()).toBe("CLOSED");
      expect(breaker.isAvailable()).toBe(true);

      const result = await breaker.execute(
        async () => "val-123",
        () => "fallback",
      );
      expect(result).toBe("val-123");
      expect(breaker.getState()).toBe("CLOSED");
    });

    it("should reset consecutive failures on a successful execution", async () => {
      const breaker = new CacheCircuitBreaker({ failureThreshold: 3 });

      // Record 2 failures (not tripping yet)
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe("CLOSED");

      // Now record success
      breaker.recordSuccess();
      expect(breaker.getState()).toBe("CLOSED");

      // 2 more failures should still not trip because counter was reset
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe("CLOSED");
    });
  });

  // Category 2: Boundary & State Transitions
  describe("Category 2: Boundary & State Transitions", () => {
    it("should trip to OPEN exactly when failureThreshold is reached", async () => {
      const transitions: Array<{ from: CircuitBreakerState; to: CircuitBreakerState }> = [];
      const breaker = new CacheCircuitBreaker({
        failureThreshold: 3,
        recoveryTimeMs: 100,
        onStateChange: (from, to) => transitions.push({ from, to }),
      });

      breaker.recordFailure();
      expect(breaker.getState()).toBe("CLOSED");
      breaker.recordFailure();
      expect(breaker.getState()).toBe("CLOSED");
      breaker.recordFailure();
      expect(breaker.getState()).toBe("OPEN");
      expect(breaker.isAvailable()).toBe(false);

      expect(transitions).toEqual([{ from: "CLOSED", to: "OPEN" }]);
    });

    it("should transition from OPEN to HALF_OPEN after recoveryTimeMs elapses", async () => {
      vi.useFakeTimers();
      try {
        const breaker = new CacheCircuitBreaker({
          failureThreshold: 2,
          recoveryTimeMs: 500,
        });

        breaker.recordFailure();
        breaker.recordFailure();
        expect(breaker.getState()).toBe("OPEN");

        // Advance timer partially
        vi.advanceTimersByTime(300);
        expect(breaker.getState()).toBe("OPEN");

        // Advance timer past recoveryTimeMs
        vi.advanceTimersByTime(250);
        expect(breaker.getState()).toBe("HALF_OPEN");
        expect(breaker.isAvailable()).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("should transition from HALF_OPEN to CLOSED after consecutive successes", async () => {
      vi.useFakeTimers();
      try {
        const breaker = new CacheCircuitBreaker({
          failureThreshold: 2,
          recoveryTimeMs: 500,
          halfOpenSuccessThreshold: 2,
        });

        breaker.recordFailure();
        breaker.recordFailure();
        expect(breaker.getState()).toBe("OPEN");

        vi.advanceTimersByTime(500);
        expect(breaker.getState()).toBe("HALF_OPEN");

        breaker.recordSuccess();
        expect(breaker.getState()).toBe("HALF_OPEN"); // Needs 2 successes

        breaker.recordSuccess();
        expect(breaker.getState()).toBe("CLOSED"); // Now reset to CLOSED
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // Category 3: Concurrency & Ordering
  describe("Category 3: Concurrency & Ordering", () => {
    it("should handle multiple concurrent calls while tripping open", async () => {
      const breaker = new CacheCircuitBreaker({ failureThreshold: 3 });

      const executions = Array.from({ length: 5 }, async (_, i) => {
        return breaker.execute(
          async () => {
            if (i < 3) {
              throw new Error(`Failed call ${i}`);
            }
            return `success-${i}`;
          },
          () => `fallback-${i}`,
        );
      });

      const results = await Promise.all(executions);
      // All failed calls return fallback in fail-open mode
      expect(results[0]).toBe("fallback-0");
      expect(results[1]).toBe("fallback-1");
      expect(results[2]).toBe("fallback-2");
      expect(breaker.getState()).toBe("OPEN");
    });
  });

  // Category 4: Fault Injection & Fail-Open Semantics
  describe("Category 4: Fault Injection & Fail-Open Semantics", () => {
    it("should return fallback without throwing when fn throws in fail-open mode", async () => {
      const breaker = new CacheCircuitBreaker({ failOpen: true });
      const result = await breaker.execute(
        async () => {
          throw new Error("Redis ECONNREFUSED");
        },
        () => "cached-fallback",
      );

      expect(result).toBe("cached-fallback");
    });

    it("should return fallback when circuit breaker is already OPEN in fail-open mode", async () => {
      const breaker = new CacheCircuitBreaker({ failureThreshold: 1, failOpen: true });
      breaker.recordFailure();
      expect(breaker.getState()).toBe("OPEN");

      const result = await breaker.execute(
        async () => "val",
        () => "fallback-open",
      );
      expect(result).toBe("fallback-open");
    });

    it("should throw error if failOpen is explicitly disabled", async () => {
      const breaker = new CacheCircuitBreaker({ failOpen: false, failureThreshold: 1 });

      await expect(
        breaker.execute(
          async () => {
            throw new Error("Redis ECONNREFUSED");
          },
          () => "fallback",
        ),
      ).rejects.toThrow("Redis ECONNREFUSED");

      // Next call while OPEN also throws
      await expect(
        breaker.execute(
          async () => "val",
          () => "fallback",
        ),
      ).rejects.toThrow("Cache circuit breaker is OPEN");
    });

    it("should immediately re-trip to OPEN if a failure occurs while HALF_OPEN", async () => {
      vi.useFakeTimers();
      try {
        const breaker = new CacheCircuitBreaker({
          failureThreshold: 2,
          recoveryTimeMs: 1000,
        });

        breaker.recordFailure();
        breaker.recordFailure();
        expect(breaker.getState()).toBe("OPEN");

        vi.advanceTimersByTime(1000);
        expect(breaker.getState()).toBe("HALF_OPEN");

        breaker.recordFailure();
        expect(breaker.getState()).toBe("OPEN");
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // Category 5: Security & Invariant Enforcement
  describe("Category 5: Security & Invariant Enforcement", () => {
    it("should invoke onStateChange callback with accurate previous and next states", async () => {
      const log: string[] = [];
      const breaker = new CacheCircuitBreaker({
        failureThreshold: 1,
        onStateChange: (from, to) => {
          log.push(`${from}->${to}`);
        },
      });

      breaker.recordFailure();
      expect(log).toEqual(["CLOSED->OPEN"]);
    });
  });
});
