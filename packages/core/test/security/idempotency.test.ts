import { describe, expect, it } from "vitest";
import { computeRequestHash, InMemoryIdempotencyManager } from "@/security/idempotency.js";

describe("security / InMemoryIdempotencyManager (5-category TDD)", () => {
  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should accept new key, mark completed, and replay identical response on duplicate", () => {
      const manager = new InMemoryIdempotencyManager({ ttlMs: 60_000 });
      const hash = computeRequestHash("POST", "/api/v1/charge", { amount: 5000 });

      // 1. Initial request begins
      const beginResult = manager.begin("idem_key_1", hash, "tenant_a");
      expect(beginResult.state).toBe("new");

      // 2. Server processes and completes
      manager.complete(
        "idem_key_1",
        {
          statusCode: 201,
          headers: { "Content-Type": "application/json" },
          body: { id: "ch_123", status: "succeeded" },
        },
        "tenant_a",
      );

      // 3. Duplicate request arrives with identical hash
      const retryResult = manager.begin("idem_key_1", hash, "tenant_a");
      expect(retryResult.state).toBe("replayed");
      if (retryResult.state === "replayed") {
        expect(retryResult.response.statusCode).toBe(201);
        expect(retryResult.response.body).toEqual({ id: "ch_123", status: "succeeded" });
      }
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should produce deterministic hashes regardless of object key insertion order", () => {
      const hash1 = computeRequestHash("POST", "/api/v1/pay", {
        b: 2,
        a: 1,
        nested: { y: 20, x: 10 },
      });
      const hash2 = computeRequestHash("POST", "/api/v1/pay", {
        a: 1,
        b: 2,
        nested: { x: 10, y: 20 },
      });

      expect(hash1).toBe(hash2);
    });

    it("should handle null, empty, and undefined bodies gracefully", () => {
      const h1 = computeRequestHash("GET", "/api/v1/status", null);
      const h2 = computeRequestHash("GET", "/api/v1/status", undefined);
      expect(typeof h1).toBe("string");
      expect(h1.length).toBe(64); // SHA-256 hex
      expect(h1).toBe(h2);
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should return conflict on concurrent in-flight requests with the same key", () => {
      const manager = new InMemoryIdempotencyManager({ ttlMs: 60_000 });
      const hash = computeRequestHash("POST", "/api/v1/transfer", { amount: 100 });

      // Request 1 starts processing
      const first = manager.begin("idem_concurrent_1", hash, "tenant_a");
      expect(first.state).toBe("new");

      // Request 2 arrives before Request 1 calls complete()
      const second = manager.begin("idem_concurrent_1", hash, "tenant_a");
      expect(second.state).toBe("conflict");
      if (second.state === "conflict") {
        expect(second.reason).toBe("concurrent");
      }
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should expire records after TTL elapses and allow re-registration as new", async () => {
      const manager = new InMemoryIdempotencyManager({ ttlMs: 40 });
      const hash = computeRequestHash("POST", "/api/v1/action", { do: true });

      manager.begin("idem_temp", hash, "tenant_a");
      manager.complete("idem_temp", { statusCode: 200, body: { done: true } });

      // Wait past TTL
      await new Promise((r) => setTimeout(r, 60));

      const afterTtl = manager.begin("idem_temp", hash, "tenant_a");
      expect(afterTtl.state).toBe("new");
    });

    it("should release pending lock when cancel() is called so retries are permitted", () => {
      const manager = new InMemoryIdempotencyManager({ ttlMs: 60_000 });
      const hash = computeRequestHash("POST", "/api/v1/charge", { amount: 50 });

      // Request begins
      const r1 = manager.begin("failed_key", hash, "tenant_a");
      expect(r1.state).toBe("new");

      // Handler throws -> cancel() is called
      manager.cancel("failed_key", "tenant_a");

      // Client retries with same key -> must be accepted as "new"
      const r2 = manager.begin("failed_key", hash, "tenant_a");
      expect(r2.state).toBe("new");
    });
  });

  // Category 5: Security & Abuse Cases (Payload Mismatch & Cross-Tenant Isolation)
  describe("Category 5: Security & Abuse Cases", () => {
    it("should return conflict on payload mismatch when same key is reused with different data", () => {
      const manager = new InMemoryIdempotencyManager({ ttlMs: 60_000 });
      const hashOriginal = computeRequestHash("POST", "/api/v1/order", { items: [1] });
      const hashTampered = computeRequestHash("POST", "/api/v1/order", { items: [999] });

      manager.begin("idem_key_tamper", hashOriginal, "tenant_a");
      manager.complete("idem_key_tamper", { statusCode: 200, body: { ok: true } }, "tenant_a");

      const tampered = manager.begin("idem_key_tamper", hashTampered, "tenant_a");
      expect(tampered.state).toBe("conflict");
      if (tampered.state === "conflict") {
        expect(tampered.reason).toBe("mismatch");
      }
    });

    it("should strictly isolate idempotency keys across different tenants", () => {
      const manager = new InMemoryIdempotencyManager({ ttlMs: 60_000 });
      const hash = computeRequestHash("POST", "/api/v1/item", { name: "Test" });

      // Tenant A uses key "shared_key_name"
      manager.begin("shared_key_name", hash, "tenant_a");
      manager.complete("shared_key_name", { statusCode: 200, body: { tenant: "A" } }, "tenant_a");

      // Tenant B uses same key "shared_key_name"
      const tenantBResult = manager.begin("shared_key_name", hash, "tenant_b");
      expect(tenantBResult.state).toBe("new"); // Must NOT conflict or leak Tenant A's result
    });

    it("should enforce maxEntries cap to prevent memory exhaustion", () => {
      const manager = new InMemoryIdempotencyManager({
        ttlMs: 60_000,
        maxEntries: 15,
      });

      for (let i = 0; i < 40; i++) {
        const hash = computeRequestHash("POST", `/api/${i}`);
        manager.begin(`key_${i}`, hash);
      }

      expect(manager.size).toBeLessThanOrEqual(15);
    });
  });
});
