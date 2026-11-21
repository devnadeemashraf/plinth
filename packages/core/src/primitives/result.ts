/**
 * Functional Result monad for railway-oriented error handling without exceptions.
 */

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export type Result<T, E = Error> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok === true;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.ok === false;
}

export function map<T, E, U>(result: Result<T, E>, fn: (val: T) => U): Result<U, E> {
  if (result.ok) {
    return ok(fn(result.value));
  }
  return result;
}

export function flatMap<T, E1, U, E2 = E1>(
  result: Result<T, E1>,
  fn: (val: T) => Result<U, E2>,
): Result<U, E1 | E2> {
  if (result.ok) {
    return fn(result.value);
  }
  return result;
}

export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  if (result.ok) {
    return result.value;
  }
  return fallback;
}
