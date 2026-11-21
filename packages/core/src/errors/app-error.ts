export interface ValidationErrorDetail {
  readonly field?: string;
  readonly message: string;
  readonly code?: string;
}

export interface AppErrorOptions {
  readonly code?: string | undefined;
  readonly title?: string | undefined;
  readonly detail?: string | undefined;
  readonly type?: string | undefined;
  readonly instance?: string | undefined;
  readonly isOperational?: boolean | undefined;
  readonly cause?: unknown;
  readonly errors?: ReadonlyArray<ValidationErrorDetail> | undefined;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly title: string;
  readonly detail: string;
  readonly type: string;
  readonly instance?: string | undefined;
  readonly isOperational: boolean;
  readonly errors?: ReadonlyArray<ValidationErrorDetail> | undefined;

  constructor(statusCode: number, message: string, options?: AppErrorOptions) {
    super(message, { cause: options?.cause });
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = options?.code ?? "INTERNAL_ERROR";
    this.title = options?.title ?? "Internal Error";
    this.detail = options?.detail ?? message;
    this.type = options?.type ?? "about:blank";
    this.instance = options?.instance;
    this.isOperational = options?.isOperational ?? true;
    this.errors = options?.errors;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad Request", options?: AppErrorOptions) {
    super(400, message, {
      code: "BAD_REQUEST",
      title: "Bad Request",
      detail: message,
      ...options,
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(
    message = "Authentication is required to access this resource",
    options?: AppErrorOptions,
  ) {
    super(401, message, {
      code: "UNAUTHORIZED",
      title: "Unauthorized",
      detail: message,
      ...options,
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = "You do not have permission to perform this action",
    options?: AppErrorOptions,
  ) {
    super(403, message, {
      code: "FORBIDDEN",
      title: "Forbidden",
      detail: message,
      ...options,
    });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested resource was not found", options?: AppErrorOptions) {
    super(404, message, {
      code: "NOT_FOUND",
      title: "Not Found",
      detail: message,
      ...options,
    });
  }
}

export class ConflictError extends AppError {
  constructor(
    message = "A conflict occurred with the current state of the resource",
    options?: AppErrorOptions,
  ) {
    super(409, message, {
      code: "CONFLICT",
      title: "Conflict",
      detail: message,
      ...options,
    });
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed on request", options?: AppErrorOptions) {
    super(422, message, {
      code: "VALIDATION_ERROR",
      title: "Unprocessable Content",
      detail: message,
      ...options,
    });
  }
}

export class RateLimitExceededError extends AppError {
  constructor(message = "Too many requests. Please slow down.", options?: AppErrorOptions) {
    super(429, message, {
      code: "RATE_LIMIT_EXCEEDED",
      title: "Too Many Requests",
      detail: message,
      ...options,
    });
  }
}

export class InternalServerError extends AppError {
  constructor(message = "An internal server error occurred", options?: AppErrorOptions) {
    super(500, message, {
      code: "INTERNAL_SERVER_ERROR",
      title: "Internal Server Error",
      detail: message,
      isOperational: false,
      ...options,
    });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "The service is temporarily unavailable", options?: AppErrorOptions) {
    super(503, message, {
      code: "SERVICE_UNAVAILABLE",
      title: "Service Unavailable",
      detail: message,
      ...options,
    });
  }
}
