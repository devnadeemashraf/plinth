import { describe, expect, it } from "vitest";
import { InMemoryRateLimiter } from "@/security/rate-limiter.js";

describe("security / InMemoryRateLimiter (5-category TDD)", () => {
  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should allow requests under the limit and compute remaining quota", () => {
      const limiter = new InMemoryRateLimiter({
        windowMs: 60_000,
        maxRequests: 10,
      });

      const res1 = limiter.consume("user_1");
      expect(res1.allowed).toBe(true);
      expect(res1.limit).toBe(10);
      expect(res1.remaining).toBe(9);
      expect(res1.resetSeconds).toBeGreaterThan(0);
      expect(res1.resetSeconds).toBeLessThanOrEqual(60);

      const res2 = limiter.consume("user_1");
      expect(res2.allowed).toBe(true);
      expect(res2.remaining).toBe(8);
    });

    it("should allow independent tracking across distinct keys", () => {
      const limiter = new InMemoryRateLimiter({
        windowMs: 60_000,
        maxRequests: 5,
      });

      limiter.consume("user_a");
      limiter.consume("user_a");
      const resA = limiter.consume("user_a");
      expect(resA.remaining).toBe(2);

      const resB = limiter.consume("user_b");
      expect(resB.remaining).toBe(4);
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should block request when quota is exhausted and report retryAfterSeconds", () => {
      const limiter = new InMemoryRateLimiter({
        windowMs: 10_000,
        maxRequests: 2,
      });

      expect(limiter.consume("client_1").allowed).toBe(true);
      expect(limiter.consume("client_1").allowed).toBe(true);

      const blocked = limiter.consume("client_1");
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(10);
    });

    it("should support custom cost consumption", () => {
      const limiter = new InMemoryRateLimiter({
        windowMs: 60_000,
        maxRequests: 10,
      });

      const res = limiter.consume("batch_worker", 5);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(5);

      const blocked = limiter.consume("batch_worker", 6);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(5); // Not deducted on denial
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should enforce exact capacity under simulated concurrent bursts", async () => {
      const limiter = new InMemoryRateLimiter({
        windowMs: 60_000,
        maxRequests: 5,
      });

      const results = await Promise.all(
        Array.from({ length: 15 }, () => Promise.resolve(limiter.consume("burst_ip"))),
      );

      const allowedCount = results.filter((r) => r.allowed).length;
      const blockedCount = results.filter((r) => !r.allowed).length;

      expect(allowedCount).toBe(5);
      expect(blockedCount).toBe(10);
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should reset quota after window duration elapses", async () => {
      const limiter = new InMemoryRateLimiter({
        windowMs: 50, // Short window for testing
        maxRequests: 1,
      });

      expect(limiter.consume("temp_user").allowed).toBe(true);
      expect(limiter.consume("temp_user").allowed).toBe(false);

      // Wait for window to elapse
      await new Promise((r) => setTimeout(r, 60));

      const refreshed = limiter.consume("temp_user");
      expect(refreshed.allowed).toBe(true);
      expect(refreshed.remaining).toBe(0);
    });

    it("should support manual key reset", () => {
      const limiter = new InMemoryRateLimiter({
        windowMs: 60_000,
        maxRequests: 1,
      });

      limiter.consume("locked_user");
      expect(limiter.consume("locked_user").allowed).toBe(false);

      limiter.reset("locked_user");
      expect(limiter.consume("locked_user").allowed).toBe(true);
    });
  });

  // Category 5: Security & Abuse Cases (Memory Bounding Defense)
  describe("Category 5: Security & Abuse Cases", () => {
    it("should enforce hard maxEntries cap to prevent memory exhaustion from unique key floods", () => {
      const limiter = new InMemoryRateLimiter({
        windowMs: 60_000,
        maxRequests: 10,
        maxEntries: 20, // Max 20 unique keys
      });

      // Flood with 50 unique keys
      for (let i = 0; i < 50; i++) {
        limiter.consume(`flooder_ip_${i}`);
      }

      // Memory tracking size must be bounded by maxEntries
      expect(limiter.size).toBeLessThanOrEqual(20);
    });
  });
});
