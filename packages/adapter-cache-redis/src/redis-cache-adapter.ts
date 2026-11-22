import { CacheCircuitBreaker, type CacheCircuitBreakerOptions, type CachePort } from "@plinth/core";
import { Redis, type RedisOptions } from "ioredis";

export interface RedisCacheAdapterOptions {
  /**
   * Existing Redis client instance (e.g. for testing or shared pool).
   */
  readonly client?: Redis | undefined;

  /**
   * Redis connection URL (e.g. "redis://127.0.0.1:6379").
   */
  readonly url?: string | undefined;

  /**
   * Additional connection options passed to ioredis.
   */
  readonly options?: RedisOptions | undefined;

  /**
   * Key namespace prefix to prevent collision.
   * @default "plinth:"
   */
  readonly keyPrefix?: string | undefined;

  /**
   * Default time-to-live in seconds if not provided in set().
   */
  readonly defaultTtlSeconds?: number | undefined;

  /**
   * Whether to fail-open (return null on get, no-op on write) when Redis fails.
   * @default true
   */
  readonly failOpen?: boolean | undefined;

  /**
   * Circuit breaker configuration options.
   */
  readonly circuitBreaker?: CacheCircuitBreakerOptions | undefined;

  /**
   * Optional local fallback cache (e.g. MemoryCacheAdapter) used when Redis trips OPEN.
   */
  readonly fallbackCache?: CachePort | undefined;
}

export class RedisCacheAdapter implements CachePort {
  private readonly client: Redis;
  private readonly keyPrefix: string;
  private readonly defaultTtlSeconds?: number | undefined;
  private readonly circuitBreaker: CacheCircuitBreaker;
  private readonly fallbackCache?: CachePort | undefined;
  private readonly ownsClient: boolean;

  constructor(options: RedisCacheAdapterOptions = {}) {
    this.keyPrefix = options.keyPrefix ?? "plinth:";
    this.defaultTtlSeconds = options.defaultTtlSeconds;
    this.fallbackCache = options.fallbackCache;

    const failOpen = options.failOpen !== false;
    this.circuitBreaker = new CacheCircuitBreaker({
      failureThreshold: options.circuitBreaker?.failureThreshold ?? 3,
      recoveryTimeMs: options.circuitBreaker?.recoveryTimeMs ?? 5000,
      halfOpenSuccessThreshold: options.circuitBreaker?.halfOpenSuccessThreshold ?? 2,
      failOpen,
      ...(options.circuitBreaker?.onStateChange
        ? { onStateChange: options.circuitBreaker.onStateChange }
        : {}),
    });

    if (options.client) {
      this.client = options.client;
      this.ownsClient = false;
    } else if (options.url) {
      this.client = new Redis(options.url, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        ...options.options,
      });
      this.ownsClient = true;
    } else {
      this.client = new Redis({
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        ...options.options,
      });
      this.ownsClient = true;
    }

    // Prevent unhandled error event crashes in Node.js runtime and record failure in circuit breaker
    this.client.on("error", (_err: unknown) => {
      this.circuitBreaker.recordFailure();
    });
  }

  public getCircuitBreaker(): CacheCircuitBreaker {
    return this.circuitBreaker;
  }

  public getClient(): Redis {
    return this.client;
  }

  private prefixedKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  public async get<T = unknown>(key: string): Promise<T | null> {
    return this.circuitBreaker.execute(
      async () => {
        const fullKey = this.prefixedKey(key);
        const raw = await this.client.get(fullKey);
        if (raw === null || raw === undefined) {
          return null;
        }
        try {
          return JSON.parse(raw) as T;
        } catch {
          return raw as unknown as T;
        }
      },
      async () => {
        if (this.fallbackCache) {
          return this.fallbackCache.get<T>(key);
        }
        return null;
      },
    );
  }

  public async set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const effectiveTtl = ttlSeconds ?? this.defaultTtlSeconds;

    await this.circuitBreaker.execute(
      async () => {
        const fullKey = this.prefixedKey(key);
        const serialized = JSON.stringify(value);

        if (effectiveTtl !== undefined && effectiveTtl > 0) {
          await this.client.set(fullKey, serialized, "EX", effectiveTtl);
        } else {
          await this.client.set(fullKey, serialized);
        }
      },
      async () => {
        if (this.fallbackCache) {
          await this.fallbackCache.set(key, value, ttlSeconds);
        }
      },
    );
  }

  public async delete(key: string): Promise<boolean> {
    return this.circuitBreaker.execute(
      async () => {
        const fullKey = this.prefixedKey(key);
        const count = await this.client.del(fullKey);
        return count > 0;
      },
      async () => {
        if (this.fallbackCache) {
          return this.fallbackCache.delete(key);
        }
        return false;
      },
    );
  }

  public async clear(): Promise<void> {
    await this.circuitBreaker.execute(
      async () => {
        const pattern = `${this.keyPrefix}*`;
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
      },
      async () => {
        if (this.fallbackCache) {
          await this.fallbackCache.clear();
        }
      },
    );
  }

  public async has(key: string): Promise<boolean> {
    return this.circuitBreaker.execute(
      async () => {
        const fullKey = this.prefixedKey(key);
        const exists = await this.client.exists(fullKey);
        return exists > 0;
      },
      async () => {
        if (this.fallbackCache) {
          return this.fallbackCache.has(key);
        }
        return false;
      },
    );
  }

  public async ping(): Promise<boolean> {
    try {
      const pong = await this.client.ping();
      return pong === "PONG";
    } catch {
      return false;
    }
  }

  public async close(): Promise<void> {
    if (this.ownsClient) {
      await this.client.quit().catch(() => {
        this.client.disconnect();
      });
    }
  }
}
