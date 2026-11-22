import {
  type AnalyticsPort,
  ConflictError,
  NotFoundError,
  type StoragePort,
  type TenantContext,
  validateAndCleanAvatar,
} from "@plinth/core";
import {
  type UpdateProfileInput,
  type UserProfile,
  validateProfileMetadata,
} from "../domain/user-profile.js";
import type { UserRepositoryPort } from "../ports/repository.js";

export interface UserServiceDependencies {
  readonly repository: UserRepositoryPort;
  readonly storage: StoragePort;
  readonly analytics?: AnalyticsPort | undefined;
}

export class UserService {
  private readonly repository: UserRepositoryPort;
  private readonly storage: StoragePort;
  private readonly analytics?: AnalyticsPort | undefined;

  constructor(deps: UserServiceDependencies) {
    this.repository = deps.repository;
    this.storage = deps.storage;
    this.analytics = deps.analytics;
  }

  async getProfile(ctx: TenantContext, userId: string): Promise<UserProfile> {
    const profile = await this.repository.getById(ctx, userId);
    if (!profile) {
      throw new NotFoundError(`User profile for '${userId}' not found`);
    }
    return profile;
  }

  async updateProfile(
    ctx: TenantContext,
    userId: string,
    input: UpdateProfileInput,
  ): Promise<UserProfile> {
    const existing = await this.repository.getById(ctx, userId);
    if (!existing) {
      throw new NotFoundError(`User profile for '${userId}' not found`);
    }

    if (input.metadata) {
      validateProfileMetadata(input.metadata);
    }

    if (input.username && input.username !== existing.username) {
      const collision = await this.repository.getByUsername(ctx, input.username);
      if (collision && collision.id !== userId) {
        throw new ConflictError(`Username '${input.username}' is already taken`);
      }
    }

    const updated = await this.repository.update(ctx, userId, {
      displayName: input.displayName ?? existing.displayName,
      username: input.username !== undefined ? input.username : existing.username,
      locale: input.locale ?? existing.locale,
      timezone: input.timezone ?? existing.timezone,
      bio: input.bio !== undefined ? input.bio : existing.bio,
      metadata: input.metadata !== undefined ? input.metadata : existing.metadata,
    });

    if (this.analytics) {
      await this.analytics.track({
        name: "user.profile_updated",
        tenantId: ctx.tenantId,
        userId,
        requiredConsent: "analytics",
      });
    }

    return updated;
  }

  async uploadAvatar(
    ctx: TenantContext,
    userId: string,
    rawBuffer: Buffer,
  ): Promise<{ avatarUrl: string }> {
    const profile = await this.getProfile(ctx, userId);

    // 1. Inspect, validate boundaries, and losslessly strip EXIF metadata
    const clean = validateAndCleanAvatar(rawBuffer);

    // 2. Generate randomized non-traversable storage key
    const key = `avatars/${ctx.tenantId}/${userId}-${Date.now()}.${clean.format}`;

    // 3. Store cleaned avatar in Storage Port
    const putResult = await this.storage.putObject({
      key,
      body: clean.buffer,
      contentType: clean.contentType,
      isPublic: true,
      metadata: {
        userId,
        tenantId: ctx.tenantId,
        width: clean.width.toString(),
        height: clean.height.toString(),
      },
    });

    const newAvatarUrl = putResult.url ?? `storage://${key}`;

    // 4. Update user profile with new avatar URL
    await this.repository.update(ctx, userId, {
      avatarUrl: newAvatarUrl,
    });

    // 5. Try cleaning up previous avatar if it was managed locally
    if (profile.avatarUrl?.startsWith("storage://")) {
      const oldKey = profile.avatarUrl.replace("storage://", "");
      try {
        await this.storage.deleteObject({ key: oldKey });
      } catch {
        // Ignored
      }
    }

    if (this.analytics) {
      await this.analytics.track({
        name: "user.avatar_uploaded",
        tenantId: ctx.tenantId,
        userId,
        requiredConsent: "analytics",
      });
    }

    return { avatarUrl: newAvatarUrl };
  }

  async deleteAvatar(ctx: TenantContext, userId: string): Promise<void> {
    const profile = await this.getProfile(ctx, userId);

    if (profile.avatarUrl) {
      if (profile.avatarUrl.startsWith("storage://")) {
        const key = profile.avatarUrl.replace("storage://", "");
        try {
          await this.storage.deleteObject({ key });
        } catch {
          // Ignored
        }
      }

      await this.repository.update(ctx, userId, {
        avatarUrl: undefined,
      });
    }
  }
}
