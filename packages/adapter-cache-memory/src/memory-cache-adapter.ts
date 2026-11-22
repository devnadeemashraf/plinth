import type { CachePort } from "@plinth/core";
import { LRUCache } from "lru-cache";

export interface MemoryCacheAdapterOptions {
  /**
   * Maximum number of items in the cache before evicting least-recently used.
   * @default 5000
   */
  readonly maxEntries?: number | undefined;

  /**
   * Default time-to-live in seconds for entries without an explicit TTL.
   */
  readonly defaultTtlSeconds?: number | undefined;
}

export class MemoryCacheAdapter implements CachePort {
  private readonly lru: LRUCache<string, NonNullable<unknown>>;

  constructor(options: MemoryCacheAdapterOptions = {}) {
    const max = options.maxEntries ?? 5000;
    const ttl =
      options.defaultTtlSeconds !== undefined && options.defaultTtlSeconds > 0
        ? options.defaultTtlSeconds * 1000
        : undefined;

    this.lru = new LRUCache<string, NonNullable<unknown>>({
      max,
      ...(ttl !== undefined ? { ttl } : {}),
      allowStale: false,
      updateAgeOnGet: false,
    });
  }

  public async get<T = unknown>(key: string): Promise<T | null> {
    const value = this.lru.get(key);
    if (value === undefined) {
      return null;
    }
    return value as T;
  }

  public async set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttlMs = ttlSeconds !== undefined && ttlSeconds > 0 ? ttlSeconds * 1000 : undefined;

    this.lru.set(key, (value ?? null) as NonNullable<unknown>, {
      ...(ttlMs !== undefined ? { ttl: ttlMs } : {}),
    });
  }

  public async delete(key: string): Promise<boolean> {
    return this.lru.delete(key);
  }

  public async clear(): Promise<void> {
    this.lru.clear();
  }

  public async has(key: string): Promise<boolean> {
    return this.lru.has(key);
  }

  public async ping(): Promise<boolean> {
    return true;
  }

  public getStats(): { size: number; max: number } {
    return {
      size: this.lru.size,
      max: this.lru.max,
    };
  }
}
