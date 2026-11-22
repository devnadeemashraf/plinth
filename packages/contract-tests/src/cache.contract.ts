import type { CachePort } from "@plinth/core";
import { describe, expect, it } from "vitest";

export interface CacheContractSuiteOptions {
  readonly adapterName: string;
  readonly createAdapter: () => Promise<CachePort> | CachePort;
  readonly cleanup?: () => Promise<void> | void;
}

export function runCacheContractTests(suiteOptions: CacheContractSuiteOptions): void {
  const { adapterName, createAdapter, cleanup } = suiteOptions;

  describe(`${adapterName} - Cache Adapter Contract Tests`, () => {
    describe("1. Basic CRUD & Type Preservation", () => {
      it("should set and get strings, numbers, booleans, and complex objects", async () => {
        const cache = await createAdapter();
        await cache.clear();

        // 1. String
        await cache.set("k-str", "hello-world");
        expect(await cache.get<string>("k-str")).toBe("hello-world");

        // 2. Number
        await cache.set("k-num", 42.5);
        expect(await cache.get<number>("k-num")).toBe(42.5);

        // 3. Boolean
        await cache.set("k-bool", true);
        expect(await cache.get<boolean>("k-bool")).toBe(true);

        // 4. Complex Nested Object
        const payload = {
          user: { id: "usr-1", name: "Alice" },
          roles: ["admin", "editor"],
          active: true,
        };
        await cache.set("k-obj", payload);
        expect(await cache.get<typeof payload>("k-obj")).toEqual(payload);

        // 5. Missing key returns null
        expect(await cache.get("k-nonexistent")).toBeNull();

        if (cleanup) await cleanup();
      });

      it("should support has, delete, and clear operations", async () => {
        const cache = await createAdapter();
        await cache.clear();

        await cache.set("item-a", "A");
        await cache.set("item-b", "B");

        expect(await cache.has("item-a")).toBe(true);
        expect(await cache.has("item-c")).toBe(false);

        // Delete existing key
        const deleted = await cache.delete("item-a");
        expect(deleted).toBe(true);
        expect(await cache.has("item-a")).toBe(false);
        expect(await cache.get("item-a")).toBeNull();

        // Delete non-existent key returns false
        expect(await cache.delete("item-a")).toBe(false);

        // Clear removes all
        await cache.clear();
        expect(await cache.has("item-b")).toBe(false);

        if (cleanup) await cleanup();
      });
    });

    describe("2. TTL Expiration", () => {
      it("should expire items when TTL elapses", async () => {
        const cache = await createAdapter();
        await cache.clear();

        // Set with 1-second TTL
        await cache.set("expiring-key", "temporary", 1);
        expect(await cache.get("expiring-key")).toBe("temporary");

        // Wait 1.1s for expiration
        await new Promise((resolve) => setTimeout(resolve, 1100));

        expect(await cache.get("expiring-key")).toBeNull();
        expect(await cache.has("expiring-key")).toBe(false);

        if (cleanup) await cleanup();
      });
    });

    describe("3. Key Namespace Independence & Overwrites", () => {
      it("should overwrite existing values and isolate namespaced keys", async () => {
        const cache = await createAdapter();
        await cache.clear();

        await cache.set("tenant:1:profile", { name: "Tenant 1" });
        await cache.set("tenant:2:profile", { name: "Tenant 2" });

        expect(await cache.get("tenant:1:profile")).toEqual({ name: "Tenant 1" });
        expect(await cache.get("tenant:2:profile")).toEqual({ name: "Tenant 2" });

        // Overwrite
        await cache.set("tenant:1:profile", { name: "Tenant 1 Updated" });
        expect(await cache.get("tenant:1:profile")).toEqual({ name: "Tenant 1 Updated" });
        expect(await cache.get("tenant:2:profile")).toEqual({ name: "Tenant 2" });

        if (cleanup) await cleanup();
      });
    });

    describe("4. Edge Cases & Special Characters", () => {
      it("should handle keys with special characters and large payloads", async () => {
        const cache = await createAdapter();
        await cache.clear();

        const complexKey = "plinth:session:jwt:abc_123-xyz.test/sub#hash";
        const largeObject = {
          data: "x".repeat(10_000),
          count: 1000,
        };

        await cache.set(complexKey, largeObject);
        const retrieved = await cache.get<typeof largeObject>(complexKey);
        expect(retrieved).toEqual(largeObject);

        if (cleanup) await cleanup();
      });
    });
  });
}
