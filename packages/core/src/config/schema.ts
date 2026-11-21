import { isIP } from "node:net";
import { z } from "zod";

const KNOWN_PLACEHOLDERS = /^(changeme|secret|default|password|test-key|replace-me)/i;

/**
 * Validates that a string is a 32-byte cryptographic key with >= 16 distinct bytes.
 */
function validateMasterKey(val: string, ctx: z.RefinementCtx): void {
  if (val !== val.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "MASTER_ENCRYPTION_KEY must not have leading or trailing whitespace",
    });
    return;
  }

  if (KNOWN_PLACEHOLDERS.test(val)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "MASTER_ENCRYPTION_KEY must not be a known placeholder pattern",
    });
    return;
  }

  const isHex = /^[0-9a-fA-F]{64}$/.test(val);
  const isBase64 = /^[A-Za-z0-9+/]{43}=?$|^[A-Za-z0-9_-]{43}=?$/.test(val);

  if (!isHex && !isBase64) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "MASTER_ENCRYPTION_KEY must be a valid 64-char hex or 32-byte base64 string",
    });
    return;
  }

  const decoded = isHex ? Buffer.from(val, "hex") : Buffer.from(val, "base64");

  if (decoded.length !== 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `MASTER_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${decoded.length})`,
    });
    return;
  }

  // Key entropy invariant: at least 16 distinct byte values
  const uniqueBytes = new Set(decoded);
  if (uniqueBytes.size < 16) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `MASTER_ENCRYPTION_KEY has insufficient entropy (${uniqueBytes.size}/16 distinct bytes required)`,
    });
  }
}

/**
 * Validates an IPv4 or IPv6 IP address or CIDR notation.
 */
function validateCidr(entry: string): boolean {
  const trimmed = entry.trim();
  if (trimmed.includes("/")) {
    const parts = trimmed.split("/");
    if (parts.length !== 2) {
      return false;
    }
    const ip = parts[0];
    const prefixStr = parts[1];
    if (!ip || !prefixStr) {
      return false;
    }

    if (!/^\d+$/.test(prefixStr)) {
      return false;
    }

    const prefix = Number.parseInt(prefixStr, 10);
    const ipVersion = isIP(ip);

    if (ipVersion === 4) {
      return prefix >= 0 && prefix <= 32;
    }
    if (ipVersion === 6) {
      return prefix >= 0 && prefix <= 128;
    }
    return false;
  }

  return isIP(trimmed) !== 0;
}

export const envSchema = z
  .strictObject({
    NODE_ENV: z.enum(["development", "test", "production"]),
    PORT: z.string().transform((val, ctx) => {
      const parsed = Number(val);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "PORT must be an integer between 1 and 65535",
        });
        return z.NEVER;
      }
      return parsed;
    }),
    DATABASE_URL: z.string().min(1, { error: "DATABASE_URL is required" }),
    MASTER_ENCRYPTION_KEY: z.string().superRefine(validateMasterKey),
    CORS_ALLOWED_ORIGINS: z.string().transform((val) =>
      val
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
    ADMIN_ALLOWED_CIDRS: z
      .string()
      .default("127.0.0.1/32,::1/128")
      .transform((val) =>
        val
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
      ),
  })
  .superRefine((data, ctx) => {
    const isProd = data.NODE_ENV === "production";

    // Validate CORS origins
    for (const origin of data.CORS_ALLOWED_ORIGINS) {
      if (origin === "*") {
        if (isProd) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["CORS_ALLOWED_ORIGINS"],
            message: "Wildcard '*' CORS origin is strictly forbidden in production",
          });
        }
        continue;
      }

      let parsed: URL;
      try {
        parsed = new URL(origin);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CORS_ALLOWED_ORIGINS"],
          message: `Invalid CORS origin URL: '${origin}'`,
        });
        continue;
      }

      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CORS_ALLOWED_ORIGINS"],
          message: `CORS origin must use http: or https: scheme (got '${parsed.protocol}')`,
        });
        continue;
      }

      if (isProd && parsed.protocol !== "https:") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CORS_ALLOWED_ORIGINS"],
          message: `CORS origin must use https: in production (got '${origin}')`,
        });
      }

      // Origin must strictly match parsed.origin (no paths, queries, fragments, or trailing slashes)
      if (parsed.origin !== origin) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CORS_ALLOWED_ORIGINS"],
          message: `CORS origin must be an origin only without path/query/trailing slash (got '${origin}', expected '${parsed.origin}')`,
        });
      }
    }

    // Validate ADMIN_ALLOWED_CIDRS
    for (const cidr of data.ADMIN_ALLOWED_CIDRS) {
      if (!validateCidr(cidr)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ADMIN_ALLOWED_CIDRS"],
          message: `Invalid IP address or CIDR notation: '${cidr}'`,
        });
      }
    }
  });

export type AppConfig = z.infer<typeof envSchema>;
