import { AppError, platformErrors } from "./errors.ts";

export interface ProblemFieldError {
  readonly path: string;
  readonly message: string;
}

/** RFC 9457 problem details body, extended with `code`, `requestId` and field `errors`. */
export interface Problem {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly code: string;
  readonly requestId: string;
  readonly errors?: readonly ProblemFieldError[];
}

export interface ProblemContext {
  readonly requestId: string;
  readonly instance: string;
}

const isFieldError = (value: unknown): value is ProblemFieldError =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Record<string, unknown>)["path"] === "string" &&
  typeof (value as Record<string, unknown>)["message"] === "string";

function fieldErrors(details: AppError["details"]): readonly ProblemFieldError[] | undefined {
  const errors = details?.["errors"];
  if (!Array.isArray(errors) || !errors.every(isFieldError)) {
    return undefined;
  }
  return errors.map(({ path, message }) => ({ path, message }));
}

/** Maps any thrown value to a problem body. Anything but an `AppError` becomes INTERNAL. */
export function toProblem(error: unknown, context: ProblemContext): Problem {
  const appError = error instanceof AppError ? error : new AppError(platformErrors.INTERNAL);
  const { code, status, title } = appError.definition;
  const errors = fieldErrors(appError.details);
  return {
    type: `urn:plinth:error:${code}`,
    title,
    status,
    detail: status >= 500 ? title : appError.message,
    instance: context.instance,
    code,
    requestId: context.requestId,
    ...(errors ? { errors } : {}),
  };
}
