import { inspect } from "node:util";

const REDACTED_MARKER = "[REDACTED]";
const REDACTED_BRAND = Symbol.for("plinth.core.redacted");

export class Redacted<T> {
  readonly #value: T;
  readonly [REDACTED_BRAND] = true;

  constructor(value: T) {
    this.#value = value;
    Object.freeze(this);
  }

  reveal(): T {
    return this.#value;
  }

  unwrap(): T {
    return this.#value;
  }

  toJSON(): string {
    return REDACTED_MARKER;
  }

  toString(): string {
    return REDACTED_MARKER;
  }

  [Symbol.toPrimitive](): string {
    return REDACTED_MARKER;
  }

  [inspect.custom](): string {
    return REDACTED_MARKER;
  }
}

export function redacted<T>(value: T): Redacted<T> {
  return new Redacted<T>(value);
}

export function isRedacted(value: unknown): value is Redacted<unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  return REDACTED_BRAND in value && (value as Record<symbol, unknown>)[REDACTED_BRAND] === true;
}
