import { MemoryCacheAdapter } from "@plinth/adapter-cache-memory";
import { describe, expect, it } from "vitest";

describe("MemoryCacheAdapter - Specific Features", () => {
  it("should enforce LRU eviction when maxEntries is exceeded", async () => {
    const cache = new MemoryCacheAdapter({ maxEntries: 3 });

    await cache.set("k1", "v1");
    await cache.set("k2", "v2");
    await cache.set("k3", "v3");

    // Access k1 to make k2 the least recently used
    await cache.get("k1");

    // Insert 4th item, triggering eviction of k2
    await cache.set("k4", "v4");

    expect(await cache.get("k1")).toBe("v1");
    expect(await cache.get("k2")).toBeNull(); // Evicted!
    expect(await cache.get("k3")).toBe("v3");
    expect(await cache.get("k4")).toBe("v4");
  });

  it("should apply default TTL when specified in options", async () => {
    const cache = new MemoryCacheAdapter({ defaultTtlSeconds: 1 });

    await cache.set("auto-expiring", "value");
    expect(await cache.get("auto-expiring")).toBe("value");

    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(await cache.get("auto-expiring")).toBeNull();
  });

  it("should return accurate stats and ping healthy", async () => {
    const cache = new MemoryCacheAdapter({ maxEntries: 10 });
    expect(await cache.ping()).toBe(true);

    await cache.set("item1", "val1");
    await cache.set("item2", "val2");

    const stats = cache.getStats();
    expect(stats.size).toBe(2);
    expect(stats.max).toBe(10);
  });
});
