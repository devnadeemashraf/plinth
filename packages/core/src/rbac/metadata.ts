import { z } from "zod";
import { ValidationError } from "@/errors/app-error.js";
import { err, ok, type Result } from "@/primitives/result.js";

export const MAX_ROLE_METADATA_BYTES = 4096;

const NO_XSS_REGEX = /^(?!.*(?:<[^>]+>|javascript:|<\/?script\b)).*$/is;

export const roleMetadataSchema = z
  .strictObject({
    colorHex: z
      .string()
      .regex(
        /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
        "Invalid colorHex format (must be 3 or 6 hex digits)",
      )
      .optional(),
    badgeLabel: z
      .string()
      .trim()
      .max(32, "badgeLabel exceeds 32 characters")
      .regex(NO_XSS_REGEX, "badgeLabel contains forbidden HTML or script characters")
      .optional(),
    icon: z
      .string()
      .trim()
      .max(64, "icon exceeds 64 characters")
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "icon must only contain alphanumeric characters, underscores, and hyphens",
      )
      .optional(),
    description: z
      .string()
      .trim()
      .max(256, "description exceeds 256 characters")
      .regex(NO_XSS_REGEX, "description contains forbidden HTML or script characters")
      .optional(),
    custom: z
      .record(z.string().max(64), z.union([z.string().max(512), z.number(), z.boolean(), z.null()]))
      .optional(),
  })
  .refine(
    (data) => {
      const serialized = JSON.stringify(data);
      return new TextEncoder().encode(serialized).length <= MAX_ROLE_METADATA_BYTES;
    },
    {
      message: `Role metadata exceeds ${MAX_ROLE_METADATA_BYTES} bytes (4 KB limit)`,
    },
  );

export type RoleMetadata = z.infer<typeof roleMetadataSchema>;

/**
 * Validates role metadata against strict schema bounds and 4 KB size limit.
 */
export function validateRoleMetadata(input: unknown): Result<RoleMetadata, ValidationError> {
  const parseResult = roleMetadataSchema.safeParse(input);
  if (!parseResult.success) {
    const details = parseResult.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
      rule: issue.code,
    }));
    return err(
      new ValidationError(parseResult.error.issues[0]?.message ?? "Invalid role metadata", {
        errors: details,
      }),
    );
  }
  return ok(parseResult.data);
}
