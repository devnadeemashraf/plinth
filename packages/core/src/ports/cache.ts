/**
 * Cache Port & Circuit Breaker Contracts
 *
 * Defines the Hexagonal Cache Port and resilient Circuit Breaker behavior
 * supporting both in-memory and distributed (Redis) stores with fail-open semantics.
 */

export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly size: number;
}

export interface CachePort {
  /**
   * Retrieves an item from the cache.
   * Returns `null` if the item is not found, expired, or if the cache is tripped in fail-open mode.
   */
  get<T = unknown>(key: string): Promise<T | null>;

  /**
   * Sets an item in the cache with an optional time-to-live in seconds.
   */
  set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void>;

  /**
   * Deletes an item from the cache.
   * Returns `true` if an item was removed, `false` otherwise.
   */
  delete(key: string): Promise<boolean>;

  /**
   * Clears all items in the cache namespace.
   */
  clear(): Promise<void>;

  /**
   * Checks whether a non-expired key exists in the cache.
   */
  has(key: string): Promise<boolean>;

  /**
   * Optional health check / ping to verify connectivity.
   */
  ping?(): Promise<boolean>;
}

export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CacheCircuitBreakerOptions {
  /**
   * Number of consecutive errors required to trip the circuit breaker OPEN.
   * @default 5
   */
  readonly failureThreshold?: number;

  /**
   * Cooldown time in milliseconds before transitioning from OPEN to HALF_OPEN.
   * @default 10000
   */
  readonly recoveryTimeMs?: number;

  /**
   * Number of successful probe calls in HALF_OPEN to reset the circuit to CLOSED.
   * @default 2
   */
  readonly halfOpenSuccessThreshold?: number;

  /**
   * Whether to fail-open (return null on get, no-op on write) when circuit is OPEN or errors occur.
   * @default true
   */
  readonly failOpen?: number | boolean;

  /**
   * Optional callback invoked when the circuit breaker state changes.
   */
  readonly onStateChange?:
    | ((from: CircuitBreakerState, to: CircuitBreakerState) => void)
    | undefined;
}

/**
 * Resilient Circuit Breaker for distributed caches.
 * Prevents cascading outages when Redis or network connections fail.
 */
export class CacheCircuitBreaker {
  private state: CircuitBreakerState = "CLOSED";
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private lastFailureTime = 0;

  private readonly failureThreshold: number;
  private readonly recoveryTimeMs: number;
  private readonly halfOpenSuccessThreshold: number;
  private readonly failOpen: boolean;
  private readonly onStateChange?:
    | ((from: CircuitBreakerState, to: CircuitBreakerState) => void)
    | undefined;

  constructor(options: CacheCircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.recoveryTimeMs = options.recoveryTimeMs ?? 10_000;
    this.halfOpenSuccessThreshold = options.halfOpenSuccessThreshold ?? 2;
    this.failOpen = options.failOpen !== false;
    this.onStateChange = options.onStateChange;
  }

  public getState(): CircuitBreakerState {
    if (this.state === "OPEN") {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.recoveryTimeMs) {
        this.transitionTo("HALF_OPEN");
      }
    }
    return this.state;
  }

  public isAvailable(): boolean {
    const currentState = this.getState();
    return currentState === "CLOSED" || currentState === "HALF_OPEN";
  }

  public recordSuccess(): void {
    if (this.state === "HALF_OPEN") {
      this.consecutiveSuccesses += 1;
      if (this.consecutiveSuccesses >= this.halfOpenSuccessThreshold) {
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;
        this.transitionTo("CLOSED");
      }
    } else if (this.state === "CLOSED") {
      this.consecutiveFailures = 0;
    }
  }

  public recordFailure(): void {
    this.lastFailureTime = Date.now();
    this.consecutiveFailures += 1;
    this.consecutiveSuccesses = 0;

    if (this.state === "HALF_OPEN" || this.consecutiveFailures >= this.failureThreshold) {
      this.transitionTo("OPEN");
    }
  }

  public async execute<T>(fn: () => Promise<T>, fallback: () => Promise<T> | T): Promise<T> {
    if (!this.isAvailable()) {
      if (this.failOpen) {
        return fallback();
      }
      throw new Error("Cache circuit breaker is OPEN");
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure();
      if (this.failOpen) {
        return fallback();
      }
      throw err;
    }
  }

  private transitionTo(nextState: CircuitBreakerState): void {
    const previous = this.state;
    if (previous !== nextState) {
      this.state = nextState;
      if (this.onStateChange) {
        this.onStateChange(previous, nextState);
      }
    }
  }
}
