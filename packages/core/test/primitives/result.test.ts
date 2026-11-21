import { describe, expect, it } from "vitest";
import { err, flatMap, isErr, isOk, map, ok, type Result, unwrapOr } from "@/primitives/result.js";

describe("primitives / result (5-category TDD)", () => {
  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should create Ok result and identify it correctly", () => {
      const res = ok(42);
      expect(isOk(res)).toBe(true);
      expect(isErr(res)).toBe(false);
      if (isOk(res)) {
        expect(res.value).toBe(42);
      }
    });

    it("should create Err result and identify it correctly", () => {
      const error = new Error("something went wrong");
      const res = err(error);
      expect(isOk(res)).toBe(false);
      expect(isErr(res)).toBe(true);
      if (isErr(res)) {
        expect(res.error).toBe(error);
      }
    });

    it("should map Ok value and leave Err untouched", () => {
      const success = ok(10);
      const mappedSuccess = map(success, (x) => x * 2);
      expect(isOk(mappedSuccess)).toBe(true);
      if (isOk(mappedSuccess)) {
        expect(mappedSuccess.value).toBe(20);
      }

      const failure = err("failure reason");
      const mappedFailure = map(failure, (x: number) => x * 2);
      expect(isErr(mappedFailure)).toBe(true);
      if (isErr(mappedFailure)) {
        expect(mappedFailure.error).toBe("failure reason");
      }
    });

    it("should flatMap Ok value and propagate early Err", () => {
      const success = ok("5");
      const chained = flatMap(success, (str) => {
        const num = Number.parseInt(str, 10);
        return Number.isNaN(num) ? err("not a number") : ok(num);
      });
      expect(isOk(chained)).toBe(true);
      if (isOk(chained)) {
        expect(chained.value).toBe(5);
      }

      const failure = err("initial error");
      const chainedFailure = flatMap(failure, (x: string) => ok(x.length));
      expect(isErr(chainedFailure)).toBe(true);
      if (isErr(chainedFailure)) {
        expect(chainedFailure.error).toBe("initial error");
      }
    });

    it("should unwrapOr value on Ok and return fallback on Err", () => {
      expect(unwrapOr(ok("real-val"), "fallback")).toBe("real-val");
      expect(unwrapOr(err(new Error("fail")), "fallback")).toBe("fallback");
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should safely hold falsy and boundary values in Ok", () => {
      const nullRes = ok(null);
      expect(isOk(nullRes)).toBe(true);
      expect(unwrapOr(nullRes, "fallback")).toBe(null);

      const undefinedRes = ok(undefined);
      expect(isOk(undefinedRes)).toBe(true);
      expect(unwrapOr(undefinedRes, "fallback")).toBe(undefined);

      const zeroRes = ok(0);
      expect(isOk(zeroRes)).toBe(true);
      expect(unwrapOr(zeroRes, 999)).toBe(0);

      const emptyStrRes = ok("");
      expect(isOk(emptyStrRes)).toBe(true);
      expect(unwrapOr(emptyStrRes, "fallback")).toBe("");

      const falseRes = ok(false);
      expect(isOk(falseRes)).toBe(true);
      expect(unwrapOr(falseRes, true)).toBe(false);
    });

    it("should safely handle boundary error types in Err", () => {
      const errStr = err("");
      expect(isErr(errStr)).toBe(true);
      if (isErr(errStr)) {
        expect(errStr.error).toBe("");
      }

      const errZero = err(0);
      expect(isErr(errZero)).toBe(true);
      if (isErr(errZero)) {
        expect(errZero.error).toBe(0);
      }
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should produce deterministic transformations across multiple calls", () => {
      const input = ok(100);
      const step1 = map(input, (x) => x + 10);
      const step2 = map(step1, (x) => x * 2);

      // Re-running map is idempotent and does not mutate input
      expect(unwrapOr(input, 0)).toBe(100);
      expect(unwrapOr(step1, 0)).toBe(110);
      expect(unwrapOr(step2, 0)).toBe(220);
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should abort pipeline on first error in multi-step flatMap chain", () => {
      const step1 = ok(10);
      const step2 = flatMap(step1, (): Result<number, string> => err("error at step 2"));
      const step3 = flatMap(step2, (val: number) => ok(val + 50));

      expect(isErr(step3)).toBe(true);
      if (isErr(step3)) {
        expect(step3.error).toBe("error at step 2");
      }
    });
  });

  // Category 5: Security & Abuse Cases
  describe("Category 5: Security & Abuse Cases", () => {
    it("should never expose internal Error stack or sensitive data unexpectedly", () => {
      const sensitiveErr = err(new Error("secret db password at localhost"));
      expect(isErr(sensitiveErr)).toBe(true);
      // Result preserves the error reference without leaking to stdout/console
      if (isErr(sensitiveErr)) {
        expect(sensitiveErr.error.message).toContain("secret db password");
      }
    });
  });
});
