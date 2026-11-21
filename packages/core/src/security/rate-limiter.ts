export interface RateLimiterOptions {
  readonly windowMs: number;
  readonly maxRequests: number;
  readonly maxEntries?: number | undefined;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly resetSeconds: number;
  readonly retryAfterSeconds: number;
}

interface RateLimitEntry {
  timestamps: number[];
  lastAccessed: number;
}

export class InMemoryRateLimiter {
  readonly #windowMs: number;
  readonly #maxRequests: number;
  readonly #maxEntries: number;
  readonly #entries = new Map<string, RateLimitEntry>();

  constructor(options: RateLimiterOptions) {
    this.#windowMs = options.windowMs;
    this.#maxRequests = options.maxRequests;
    this.#maxEntries = options.maxEntries ?? 10_000;
  }

  get size(): number {
    return this.#entries.size;
  }

  consume(key: string, cost = 1): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.#windowMs;
    const effectiveCost = Math.max(1, cost);

    let entry = this.#entries.get(key);

    if (!entry) {
      this.#evictIfFull();
      entry = { timestamps: [], lastAccessed: now };
      this.#entries.set(key, entry);
    }

    entry.lastAccessed = now;

    // Remove timestamps that have fallen out of the active window
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

    const currentUsage = entry.timestamps.length;
    const canAccept = currentUsage + effectiveCost <= this.#maxRequests;

    const earliestTimestamp = entry.timestamps[0] ?? now;
    const timeUntilResetMs = Math.max(0, earliestTimestamp + this.#windowMs - now);
    const resetSeconds = Math.ceil(timeUntilResetMs / 1000) || Math.ceil(this.#windowMs / 1000);

    if (canAccept) {
      for (let i = 0; i < effectiveCost; i++) {
        entry.timestamps.push(now);
      }

      return {
        allowed: true,
        limit: this.#maxRequests,
        remaining: Math.max(0, this.#maxRequests - (currentUsage + effectiveCost)),
        resetSeconds,
        retryAfterSeconds: 0,
      };
    }

    const retryAfterMs = Math.max(1000, earliestTimestamp + this.#windowMs - now);
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

    return {
      allowed: false,
      limit: this.#maxRequests,
      remaining: Math.max(0, this.#maxRequests - currentUsage),
      resetSeconds,
      retryAfterSeconds,
    };
  }

  reset(key: string): void {
    this.#entries.delete(key);
  }

  #evictIfFull(): void {
    if (this.#entries.size < this.#maxEntries) {
      return;
    }

    const now = Date.now();
    const windowStart = now - this.#windowMs;

    // 1. Batch-purge all expired entries
    for (const [key, entry] of this.#entries.entries()) {
      if (entry.lastAccessed < windowStart) {
        this.#entries.delete(key);
      }
    }

    if (this.#entries.size < this.#maxEntries) {
      return;
    }

    // 2. If still full, evict oldest accessed entry
    let oldestKey: string | null = null;
    let oldestTime = Number.POSITIVE_INFINITY;

    for (const [key, entry] of this.#entries.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.#entries.delete(oldestKey);
    }
  }
}
