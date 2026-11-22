import { AppError } from "@plinth/core";
import { z } from "zod";

export const MAX_PROFILE_METADATA_BYTES = 8 * 1024; // 8 KB hard cap

export interface UserProfile {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly displayName: string;
  readonly username?: string | undefined;
  readonly avatarUrl?: string | undefined;
  readonly locale: string;
  readonly timezone: string;
  readonly bio?: string | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export const updateProfileSchema = z.strictObject({
  displayName: z.string().trim().min(1, "Display name cannot be empty").max(100).optional(),
  username: z
    .string()
    .trim()
    .regex(
      /^[a-zA-Z0-9_-]{3,30}$/,
      "Username must be 3-30 alphanumeric characters, hyphens or underscores",
    )
    .optional(),
  locale: z.string().trim().max(20).optional(),
  timezone: z.string().trim().max(50).optional(),
  bio: z.string().trim().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * Validates that user profile metadata does not exceed the 8 KB serialized bound.
 */
export function validateProfileMetadata(
  metadata?: Readonly<Record<string, unknown>> | undefined,
): void {
  if (!metadata) {
    return;
  }
  const serialized = JSON.stringify(metadata);
  if (Buffer.byteLength(serialized, "utf8") > MAX_PROFILE_METADATA_BYTES) {
    throw new AppError(
      400,
      `Profile metadata exceeds the ${MAX_PROFILE_METADATA_BYTES} byte limit`,
      { code: "METADATA_TOO_LARGE" },
    );
  }
}
