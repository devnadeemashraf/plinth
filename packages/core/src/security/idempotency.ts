import { createHash } from "node:crypto";

export interface IdempotencyOptions {
  readonly ttlMs?: number | undefined;
  readonly maxEntries?: number | undefined;
}

export interface IdempotencyResponse {
  readonly statusCode: number;
  readonly headers?: Record<string, string | number> | undefined;
  readonly body?: unknown;
}

export type IdempotencyBeginResult =
  | { readonly state: "new" }
  | { readonly state: "replayed"; readonly response: IdempotencyResponse }
  | { readonly state: "conflict"; readonly reason: "concurrent" | "mismatch" };

interface IdempotencyRecord {
  readonly key: string;
  readonly tenantId: string;
  readonly requestHash: string;
  status: "pending" | "completed";
  response?: IdempotencyResponse | undefined;
  readonly createdAt: number;
  readonly expiresAt: number;
}

/**
 * Deterministically serialize any object with sorted keys so identical payloads
 * produce identical SHA-256 hashes regardless of key insertion order.
 */
function canonicalizeJson(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value !== "object") {
    return JSON.stringify(value) ?? "";
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? "null" : canonicalizeJson(item))).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const sortedKeys = Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort();
  const pairs = sortedKeys.map((k) => `${JSON.stringify(k)}:${canonicalizeJson(record[k])}`);
  return `{${pairs.join(",")}}`;
}

export function computeRequestHash(method: string, path: string, body?: unknown): string {
  const normMethod = method.toUpperCase();
  const normPath = path.toLowerCase();
  const canonBody = body === null || body === undefined ? "" : canonicalizeJson(body);

  return createHash("sha256").update(`${normMethod}:${normPath}:${canonBody}`).digest("hex");
}

export class InMemoryIdempotencyManager {
  readonly #ttlMs: number;
  readonly #maxEntries: number;
  readonly #records = new Map<string, IdempotencyRecord>();

  constructor(options?: IdempotencyOptions) {
    this.#ttlMs = options?.ttlMs ?? 86_400_000; // 24 hours default
    this.#maxEntries = options?.maxEntries ?? 10_000;
  }

  get size(): number {
    return this.#records.size;
  }

  #getScopedKey(key: string, tenantId?: string): string {
    return `${tenantId ?? "global"}:${key}`;
  }

  begin(
    key: string,
    requestHash: string,
    tenantId?: string,
    customTtlMs?: number,
  ): IdempotencyBeginResult {
    const scopedKey = this.#getScopedKey(key, tenantId);
    const now = Date.now();
    const existing = this.#records.get(scopedKey);

    if (existing) {
      // Check if existing record has expired
      if (now > existing.expiresAt) {
        this.#records.delete(scopedKey);
      } else if (existing.status === "pending") {
        return {
          state: "conflict",
          reason: "concurrent",
        };
      } else if (existing.status === "completed") {
        if (existing.requestHash !== requestHash) {
          return {
            state: "conflict",
            reason: "mismatch",
          };
        }
        return {
          state: "replayed",
          response: existing.response ?? { statusCode: 200 },
        };
      }
    }

    this.#evictIfFull();

    const ttl = customTtlMs ?? this.#ttlMs;
    const record: IdempotencyRecord = {
      key,
      tenantId: tenantId ?? "global",
      requestHash,
      status: "pending",
      createdAt: now,
      expiresAt: now + ttl,
    };

    this.#records.set(scopedKey, record);
    return { state: "new" };
  }

  complete(key: string, response: IdempotencyResponse, tenantId?: string): void {
    const scopedKey = this.#getScopedKey(key, tenantId);
    const existing = this.#records.get(scopedKey);

    if (existing) {
      existing.status = "completed";
      existing.response = response;
    }
  }

  cancel(key: string, tenantId?: string): void {
    const scopedKey = this.#getScopedKey(key, tenantId);
    const existing = this.#records.get(scopedKey);

    if (existing && existing.status === "pending") {
      this.#records.delete(scopedKey);
    }
  }

  #evictIfFull(): void {
    if (this.#records.size < this.#maxEntries) {
      return;
    }

    const now = Date.now();
    // 1. Evict any expired records first
    for (const [key, record] of this.#records.entries()) {
      if (now > record.expiresAt) {
        this.#records.delete(key);
      }
    }

    if (this.#records.size < this.#maxEntries) {
      return;
    }

    // 2. Evict the oldest created record
    let oldestKey: string | null = null;
    let oldestCreatedAt = Number.POSITIVE_INFINITY;

    for (const [key, record] of this.#records.entries()) {
      if (record.createdAt < oldestCreatedAt) {
        oldestCreatedAt = record.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.#records.delete(oldestKey);
    }
  }
}
