import type { AppConfig } from "@/config/schema.js";
import { envSchema } from "@/config/schema.js";

const SENSITIVE_KEYS = new Set(["MASTER_ENCRYPTION_KEY", "DATABASE_URL"]);

export interface SanitizedConfigIssue {
  readonly path: string;
  readonly message: string;
}

export class ConfigValidationError extends Error {
  public readonly issues: readonly SanitizedConfigIssue[];

  constructor(issues: readonly SanitizedConfigIssue[]) {
    const formatted = issues.map((i) => `  - ${i.path}: ${i.message}`).join("\n");
    super(`Configuration validation failed:\n${formatted}`);
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
}

function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  // Freeze properties first
  for (const key of Object.keys(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === "object" && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }

  return Object.freeze(obj) as Readonly<T>;
}

/**
 * Loads, validates, and deeply freezes application configuration.
 * Strictly redacts raw secrets in validation error messages.
 */
export function loadConfig(rawEnv: Record<string, unknown> = process.env): Readonly<AppConfig> {
  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const sanitizedIssues: SanitizedConfigIssue[] = result.error.issues.map((issue) => {
      const path = issue.path.join(".") || "env";
      let message = issue.message;

      // Ensure no raw secret leaks if Zod error contains input values
      for (const sensitiveKey of SENSITIVE_KEYS) {
        if (path.includes(sensitiveKey)) {
          // Strip any potential echoed secret strings from the message
          message = message.replace(
            /(?:got\s+['"][^'"]+['"]|input\s+['"][^'"]+['"])/gi,
            "got [REDACTED]",
          );
        }
      }

      // Scrub embedded database/service credentials in URLs from messages
      message = message.replace(/:\/\/[^:]+:([^@]+)@/g, "://[REDACTED]:[REDACTED]@");

      return {
        path,
        message,
      };
    });

    throw new ConfigValidationError(sanitizedIssues);
  }

  return deepFreeze(result.data);
}
