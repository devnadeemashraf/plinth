import { describe, expect, it } from "vitest";
import { AppError, defineErrors, platformErrors } from "../errors.ts";

describe("defineErrors", () => {
  it("adds the code to each definition", () => {
    const errors = defineErrors({ PLAN_NOT_FOUND: { status: 404, title: "Plan not found" } });
    expect(errors.PLAN_NOT_FOUND).toEqual({
      code: "PLAN_NOT_FOUND",
      status: 404,
      title: "Plan not found",
    });
  });

  it("rejects a status outside 400–599", () => {
    expect(() => defineErrors({ OK: { status: 200, title: "Fine" } })).toThrow(RangeError);
    expect(() => defineErrors({ BIG: { status: 600, title: "Big" } })).toThrow(RangeError);
  });
});

describe("AppError", () => {
  it("carries its definition, details and cause", () => {
    const cause = new Error("driver");
    const error = new AppError(platformErrors.CONFLICT, {
      message: "Key taken",
      details: { key: "a" },
      cause,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AppError");
    expect(error.message).toBe("Key taken");
    expect(error.definition.code).toBe("CONFLICT");
    expect(error.details).toEqual({ key: "a" });
    expect(error.cause).toBe(cause);
  });

  it("defaults the message to the definition's title", () => {
    const error = new AppError(platformErrors.FORBIDDEN);
    expect(error.message).toBe("Forbidden");
    expect(error.details).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });
});
