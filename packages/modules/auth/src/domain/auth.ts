import type { TenantId, UserId } from "@plinth/core";
import { z } from "zod";

export interface User {
  readonly id: UserId;
  readonly tenantId: TenantId;
  readonly email: string;
  readonly username?: string | undefined;
  readonly emailVerified: boolean;
  readonly passwordHash?: string | undefined;
  readonly totpSecretEncrypted?: string | undefined;
  readonly totpEnabled: boolean;
  readonly status: "active" | "suspended" | "pending_verification";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Session {
  readonly id: string; // UUIDv7
  readonly userId: UserId;
  readonly tenantId: TenantId;
  readonly sessionTokenHash: string; // SHA-256
  readonly ipAddress?: string | undefined;
  readonly userAgent?: string | undefined;
  readonly expiresAt: string; // ISO 8601 UTC
  readonly createdAt: string;
}

export interface RefreshToken {
  readonly id: string; // UUIDv7
  readonly userId: UserId;
  readonly tenantId: TenantId;
  readonly tokenHash: string; // SHA-256
  readonly familyId: string; // UUIDv7
  readonly isRotated: boolean;
  readonly expiresAt: string;
  readonly createdAt: string;
}

export interface OAuthAccount {
  readonly id: string; // UUIDv7
  readonly userId: UserId;
  readonly tenantId: TenantId;
  readonly provider: string;
  readonly providerUserId: string;
  readonly providerEmail?: string | undefined;
  readonly emailVerified: boolean;
  readonly createdAt: string;
}

export const registerSchema = z
  .object({
    email: z.string().email().max(255),
    password: z.string().min(8).max(128),
    username: z
      .string()
      .min(3)
      .max(50)
      .regex(/^[a-zA-Z0-9_-]+$/)
      .optional(),
  })
  .strict();

export type RegisterDto = z.infer<typeof registerSchema>;

export const loginSchema = z
  .object({
    identifier: z.string().min(1).max(255),
    password: z.string().min(1).max(128),
  })
  .strict();

export type LoginDto = z.infer<typeof loginSchema>;

export const loginTotpSchema = z
  .object({
    mfaTicket: z.string().min(1),
    totpCode: z
      .string()
      .length(6)
      .regex(/^\d{6}$/),
  })
  .strict();

export type LoginTotpDto = z.infer<typeof loginTotpSchema>;

export const refreshTokensSchema = z
  .object({
    refreshToken: z.string().min(1),
  })
  .strict();

export type RefreshTokensDto = z.infer<typeof refreshTokensSchema>;

export const oauthCallbackSchema = z
  .object({
    code: z.string().min(1),
    state: z.string().min(1),
    codeVerifier: z.string().min(1),
    redirectUri: z.string().url(),
  })
  .strict();

export type OAuthCallbackDto = z.infer<typeof oauthCallbackSchema>;
