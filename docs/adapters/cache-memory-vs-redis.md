# Adapter Swap Handbook: In-Memory LRU vs Redis / Valkey

This 1-page guide explains how to swap between `@plinth/adapter-cache-memory` and `@plinth/adapter-cache-redis`.

---

## 1. Architectural Comparison

| Dimension | In-Memory LRU (`adapter-cache-memory`) | Redis / Valkey (`adapter-cache-redis`) |
|---|---|---|
| **Backing Engine** | `lru-cache` v11 in Node process memory | `ioredis` v5 client connecting to Redis / Valkey cluster |
| **Persistence** | Volatile (cleared on process restart) | Persistent (AOF / RDB snapshots) |
| **Cluster Sharing** | Single process only | Shared across all multi-container web instances |
| **Resilience** | Zero network failure modes | Integrated `CacheCircuitBreaker` (fail-open state machine) |

---

## 2. Fail-Open Cache Circuit Breaker
When using `@plinth/adapter-cache-redis`, network timeouts or Redis restarts never crash your web service:
1. `CLOSED` (Normal): Operations pass directly to Redis.
2. `OPEN` (Tripped): Consecutive Redis errors trip the breaker. All cache calls return `undefined` immediately (fail-open), falling back to SQL queries without blocking request threads.
3. `HALF_OPEN` (Probing): Bounded probe queries test if Redis has recovered before re-closing the breaker.

---

## 3. Swap Steps

### To Switch to Redis:
```bash
pnpm add @plinth/adapter-cache-redis
```
In `src/server.ts`:
```typescript
import { RedisCacheAdapter } from "@plinth/adapter-cache-redis";

const cache = new RedisCacheAdapter({
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
  defaultTtlSeconds: 300,
  keyPrefix: "app:",
});
await cache.connect();
```

### Verification:
```bash
pnpm test:cache
```
Both adapters pass 100% of the shared `CachePort` contract tests (CRUD, TTL expiration, namespace prefixing).
