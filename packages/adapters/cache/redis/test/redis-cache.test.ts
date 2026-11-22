import { MemoryCacheAdapter } from "@plinth/adapter-cache-memory";
import { RedisCacheAdapter } from "@plinth/adapter-cache-redis";
import type { Redis } from "ioredis";
import RedisMock from "ioredis-mock";
import { describe, expect, it } from "vitest";

describe("RedisCacheAdapter - Resilience & Circuit Breaker", () => {
  it("should fail-open and return null when Redis throws errors", async () => {
    const mockRedis = new RedisMock();
    // Simulate broken Redis by mocking get to reject
    mockRedis.get = async () => {
      throw new Error("Connection lost");
    };

    const cache = new RedisCacheAdapter({
      client: mockRedis as unknown as Redis,
      failOpen: true,
      circuitBreaker: { failureThreshold: 2 },
    });

    // Should return null without crashing
    const result = await cache.get("test-key");
    expect(result).toBeNull();
  });

  it("should fallback to secondary cache when Redis fails", async () => {
    const mockRedis = new RedisMock();
    const fallback = new MemoryCacheAdapter();
    await fallback.set("fallback-key", "fallback-value");

    mockRedis.get = async () => {
      throw new Error("Redis cluster down");
    };

    const cache = new RedisCacheAdapter({
      client: mockRedis as unknown as Redis,
      failOpen: true,
      fallbackCache: fallback,
    });

    const result = await cache.get("fallback-key");
    expect(result).toBe("fallback-value");
  });

  it("should ping healthy mock connection", async () => {
    const mockRedis = new RedisMock();
    const cache = new RedisCacheAdapter({ client: mockRedis as unknown as Redis });
    expect(await cache.ping()).toBe(true);

    mockRedis.ping = async () => {
      throw new Error("Ping timeout");
    };
    expect(await cache.ping()).toBe(false);
  });

  it("should fallback on set, delete, clear, and has when Redis fails", async () => {
    const mockRedis = new RedisMock();
    const fallback = new MemoryCacheAdapter();

    mockRedis.set = async () => {
      throw new Error("Redis down");
    };
    mockRedis.del = async () => {
      throw new Error("Redis down");
    };
    mockRedis.keys = async () => {
      throw new Error("Redis down");
    };
    mockRedis.exists = async () => {
      throw new Error("Redis down");
    };

    const cache = new RedisCacheAdapter({
      client: mockRedis as unknown as Redis,
      failOpen: true,
      fallbackCache: fallback,
    });

    await cache.set("k-fb", "val-fb");
    expect(await fallback.get("k-fb")).toBe("val-fb");

    expect(await cache.has("k-fb")).toBe(true);
    expect(await cache.delete("k-fb")).toBe(true);

    await fallback.set("k-clear", "123");
    await cache.clear();
    expect(await fallback.get("k-clear")).toBeNull();
  });

  it("should parse non-JSON string values gracefully in get", async () => {
    const mockRedis = new RedisMock();
    await mockRedis.set("plinth:raw-str", "raw non-json string");
    const cache = new RedisCacheAdapter({ client: mockRedis as unknown as Redis });

    const val = await cache.get<string>("raw-str");
    expect(val).toBe("raw non-json string");
  });

  it("should expose client and circuit breaker and handle fail-open without fallback", async () => {
    const mockRedis = new RedisMock();
    mockRedis.del = async () => {
      throw new Error("Del failed");
    };
    mockRedis.exists = async () => {
      throw new Error("Exists failed");
    };
    mockRedis.keys = async () => {
      throw new Error("Keys failed");
    };

    const cache = new RedisCacheAdapter({
      client: mockRedis as unknown as Redis,
      failOpen: true,
    });

    expect(cache.getClient()).toBeDefined();
    expect(cache.getCircuitBreaker()).toBeDefined();

    expect(await cache.delete("any-key")).toBe(false);
    expect(await cache.has("any-key")).toBe(false);
    await cache.clear(); // safe no-op
  });

  it("should support url configuration and clean closure", async () => {
    const cache = new RedisCacheAdapter({
      url: "redis://127.0.0.1:6379",
      options: { lazyConnect: true },
    });
    expect(cache.getClient()).toBeDefined();
    await cache.close();
  });

  it("should handle client error events safely without crashing and record failure in circuit breaker", () => {
    const mockRedis = new RedisMock();
    const cache = new RedisCacheAdapter({
      client: mockRedis as unknown as Redis,
      circuitBreaker: { failureThreshold: 1 },
    });

    expect(cache.getCircuitBreaker().getState()).toBe("CLOSED");
    // Emit error on client
    mockRedis.emit("error", new Error("Redis socket dropped"));
    // Circuit breaker records failure and transitions to OPEN
    expect(cache.getCircuitBreaker().getState()).toBe("OPEN");
  });
});
