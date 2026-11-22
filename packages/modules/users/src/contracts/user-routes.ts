import { defineRoute } from "@plinth/core";
import { z } from "zod";
import { updateProfileSchema } from "../domain/user-profile.js";

const userProfileResponseSchema = z.strictObject({
  id: z.string(),
  tenantId: z.string(),
  email: z.string(),
  displayName: z.string(),
  username: z.string().optional(),
  avatarUrl: z.string().optional(),
  locale: z.string(),
  timezone: z.string(),
  bio: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const getMeRoute = defineRoute({
  method: "GET",
  path: "/api/v1/users/me",
  summary: "Get current authenticated user profile",
  description: "Returns the current authenticated user's profile and preferences",
  responseSchemas: {
    200: userProfileResponseSchema,
  },
});

export const updateMeRoute = defineRoute({
  method: "PATCH",
  path: "/api/v1/users/me",
  summary: "Update current authenticated user profile",
  description:
    "Updates profile fields such as displayName, username, bio, locale, timezone, and metadata",
  bodySchema: updateProfileSchema,
  responseSchemas: {
    200: userProfileResponseSchema,
  },
});

export const deleteAvatarRoute = defineRoute({
  method: "DELETE",
  path: "/api/v1/users/me/avatar",
  summary: "Delete current user avatar",
  description: "Removes avatar from storage and clears avatarUrl on profile",
  responseSchemas: {
    200: z.strictObject({
      success: z.boolean(),
    }),
  },
});
