/** A stable, documented failure: `code` is the public identifier, `status` the HTTP status. */
export interface ErrorDefinition<Code extends string = string> {
  readonly code: Code;
  readonly status: number;
  readonly title: string;
}

type ErrorSpecs = Readonly<Record<string, { readonly status: number; readonly title: string }>>;

export type ErrorDefinitions<Specs extends ErrorSpecs> = {
  readonly [Code in keyof Specs & string]: ErrorDefinition<Code>;
};

/** Builds a module's error catalogue; each key becomes the definition's `code`. */
export function defineErrors<const Specs extends ErrorSpecs>(
  specs: Specs,
): ErrorDefinitions<Specs> {
  const definitions: Record<string, ErrorDefinition> = {};
  for (const [code, { status, title }] of Object.entries(specs)) {
    if (!Number.isInteger(status) || status < 400 || status > 599) {
      throw new RangeError(`Error definition ${code} has status ${status}; use 400–599`);
    }
    definitions[code] = Object.freeze({ code, status, title });
  }
  return Object.freeze(definitions) as ErrorDefinitions<Specs>;
}

export interface AppErrorOptions {
  /** Shown to the client as `detail` for 4xx only; defaults to the definition's title. */
  readonly message?: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
}

/** The only error thrown for expected failures. */
export class AppError extends Error {
  override readonly name = "AppError";
  readonly definition: ErrorDefinition;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(definition: ErrorDefinition, options: AppErrorOptions = {}) {
    super(
      options.message ?? definition.title,
      "cause" in options ? { cause: options.cause } : undefined,
    );
    this.definition = definition;
    this.details = options.details;
  }
}

export const platformErrors = defineErrors({
  VALIDATION_FAILED: { status: 400, title: "Validation failed" },
  UNAUTHENTICATED: { status: 401, title: "Authentication required" },
  FORBIDDEN: { status: 403, title: "Forbidden" },
  NOT_FOUND: { status: 404, title: "Not found" },
  CONFLICT: { status: 409, title: "Conflict" },
  PAYLOAD_TOO_LARGE: { status: 413, title: "Payload too large" },
  RATE_LIMITED: { status: 429, title: "Too many requests" },
  INTERNAL: { status: 500, title: "Internal error" },
  UNAVAILABLE: { status: 503, title: "Service unavailable" },
});
