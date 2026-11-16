import { describe, expect, it } from "vitest";
import { AppError, platformErrors } from "../errors.ts";
import { toProblem } from "../problem.ts";

const context = { requestId: "req-1", instance: "/v1/things" };

describe("toProblem", () => {
  it('[P0-01 #7] `toProblem(new AppError(platformErrors.CONFLICT, { message: "Key taken" }))` → status 409, code CONFLICT, detail "Key taken", type `urn:plinth:error:CONFLICT`', () => {
    const problem = toProblem(
      new AppError(platformErrors.CONFLICT, { message: "Key taken" }),
      context,
    );
    expect(problem.status).toBe(409);
    expect(problem.code).toBe("CONFLICT");
    expect(problem.detail).toBe("Key taken");
    expect(problem.type).toBe("urn:plinth:error:CONFLICT");
    expect(problem.title).toBe("Conflict");
    expect(problem.requestId).toBe("req-1");
    expect(problem.instance).toBe("/v1/things");
    expect(problem).not.toHaveProperty("errors");
  });

  it('[P0-01 #8] `toProblem(new Error("password=hunter2"))` → status 500, code INTERNAL, detail "Internal error"', () => {
    const problem = toProblem(new Error("password=hunter2"), context);
    expect(problem.status).toBe(500);
    expect(problem.code).toBe("INTERNAL");
    expect(problem.detail).toBe("Internal error");
    expect(JSON.stringify(problem)).not.toContain("hunter2");
  });

  it("uses the title as detail for a 4xx AppError without a message", () => {
    expect(toProblem(new AppError(platformErrors.NOT_FOUND), context).detail).toBe("Not found");
  });

  it("never exposes the message of a 5xx AppError", () => {
    const error = new AppError(platformErrors.UNAVAILABLE, { message: "db host down" });
    expect(toProblem(error, context).detail).toBe("Service unavailable");
  });

  it("copies field errors from details.errors", () => {
    const errors = [{ path: "body.name", message: "Required" }];
    const error = new AppError(platformErrors.VALIDATION_FAILED, { details: { errors } });
    expect(toProblem(error, context).errors).toEqual(errors);
  });
});
