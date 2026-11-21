import { defineRoute } from "@plinth/core";
import { z } from "zod";
import {
  loginSchema,
  loginTotpSchema,
  refreshTokensSchema,
  registerSchema,
} from "../domain/auth.js";

const userResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  email: z.string(),
  username: z.string().optional(),
  emailVerified: z.boolean(),
  totpEnabled: z.boolean(),
  status: z.enum(["active", "suspended", "pending_verification"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const authResponseSchema = z.object({
  user: userResponseSchema,
  sessionToken: z.string().optional(),
  csrfToken: z.string().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  mfaRequired: z.boolean().optional(),
  mfaTicket: z.string().optional(),
});

export const refreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
});

export const registerRouteContract = defineRoute({
  method: "POST",
  path: "/api/v1/auth/register",
  summary: "Register new user account with email and password",
  tags: ["Auth"],
  bodySchema: registerSchema,
  responseSchemas: {
    201: authResponseSchema,
  },
});

export const loginRouteContract = defineRoute({
  method: "POST",
  path: "/api/v1/auth/login",
  summary: "Log in with email or username and password",
  tags: ["Auth"],
  bodySchema: loginSchema,
  responseSchemas: {
    200: authResponseSchema,
  },
});

export const loginTotpRouteContract = defineRoute({
  method: "POST",
  path: "/api/v1/auth/login/totp",
  summary: "Complete MFA login with TOTP code and MFA ticket",
  tags: ["Auth"],
  bodySchema: loginTotpSchema,
  responseSchemas: {
    200: authResponseSchema,
  },
});

export const refreshRouteContract = defineRoute({
  method: "POST",
  path: "/api/v1/auth/refresh",
  summary: "Rotate refresh token and issue new JWT access token",
  tags: ["Auth"],
  bodySchema: refreshTokensSchema,
  responseSchemas: {
    200: refreshResponseSchema,
  },
});

export const logoutRouteContract = defineRoute({
  method: "POST",
  path: "/api/v1/auth/logout",
  summary: "Log out by revoking session or refresh token family",
  tags: ["Auth"],
  responseSchemas: {
    204: z.undefined(),
  },
});

export const meRouteContract = defineRoute({
  method: "GET",
  path: "/api/v1/auth/me",
  summary: "Get current authenticated user profile",
  tags: ["Auth"],
  responseSchemas: {
    200: userResponseSchema,
  },
});
