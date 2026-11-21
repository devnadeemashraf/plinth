import { AppError, type ValidationErrorDetail } from "@/errors/app-error.js";

export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance?: string | undefined;
  readonly code?: string | undefined;
  readonly traceId?: string | undefined;
  readonly errors?: ReadonlyArray<ValidationErrorDetail> | undefined;
  readonly stack?: string | undefined;
}

export interface ToProblemDetailsOptions {
  readonly traceId?: string | undefined;
  readonly instance?: string | undefined;
  readonly isProduction?: boolean | undefined;
}

// Bounded URI credential regex: protocol <= 32, credentials <= 256 to eliminate polynomial ReDoS
const URI_CREDENTIAL_REGEX =
  /([a-zA-Z][a-zA-Z0-9+.-]{0,32}:\/\/)(?:[^\s/]{1,256})@([a-zA-Z0-9_.-]+(?::\d{1,5})?(?:\/|\b|\?))/g;

export function scrubCredentials(text: string): string {
  if (!text) {
    return text;
  }
  return text.replace(
    URI_CREDENTIAL_REGEX,
    (_match, proto, host) => `${proto}[REDACTED]:[REDACTED]@${host}`,
  );
}

function sanitizeValidationErrors(
  errors?: ReadonlyArray<ValidationErrorDetail> | undefined,
): ReadonlyArray<ValidationErrorDetail> | undefined {
  if (!errors) {
    return undefined;
  }
  return errors.map((err) => ({
    ...err,
    message: scrubCredentials(err.message),
  }));
}

export function toProblemDetails(
  error: unknown,
  options?: ToProblemDetailsOptions,
): ProblemDetails {
  const isProd = options?.isProduction ?? false;
  const traceId = options?.traceId;
  const instance = options?.instance;

  if (error instanceof AppError) {
    const sanitizedErrors = sanitizeValidationErrors(error.errors);
    return {
      type: error.type,
      title: error.title,
      status: error.statusCode,
      detail: scrubCredentials(error.detail),
      ...(instance || error.instance ? { instance: instance ?? error.instance } : {}),
      code: error.code,
      ...(traceId ? { traceId } : {}),
      ...(sanitizedErrors ? { errors: sanitizedErrors } : {}),
      ...(!isProd && error.stack ? { stack: error.stack } : {}),
    };
  }

  if (error instanceof Error) {
    if (isProd) {
      return {
        type: "about:blank",
        title: "Internal Server Error",
        status: 500,
        detail: "An unexpected internal server error occurred.",
        ...(instance ? { instance } : {}),
        code: "INTERNAL_SERVER_ERROR",
        ...(traceId ? { traceId } : {}),
      };
    }

    return {
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
      detail: scrubCredentials(error.message),
      ...(instance ? { instance } : {}),
      code: "INTERNAL_SERVER_ERROR",
      ...(traceId ? { traceId } : {}),
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }

  const detail = isProd
    ? "An unexpected internal server error occurred."
    : typeof error === "string"
      ? scrubCredentials(error)
      : error &&
          typeof error === "object" &&
          "message" in error &&
          typeof error.message === "string"
        ? scrubCredentials(error.message)
        : "An unexpected error occurred.";

  return {
    type: "about:blank",
    title: "Internal Server Error",
    status: 500,
    detail,
    ...(instance ? { instance } : {}),
    code: "INTERNAL_SERVER_ERROR",
    ...(traceId ? { traceId } : {}),
  };
}
