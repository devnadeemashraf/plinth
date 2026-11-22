import { assertTenantContext, type TenantContext } from "@plinth/core";
import type { UserProfile } from "../domain/user-profile.js";
import type { UserRepositoryPort } from "../ports/repository.js";

export class InMemoryUserRepository implements UserRepositoryPort {
  private readonly profiles = new Map<string, UserProfile>();

  private makeKey(ctx: TenantContext, userId: string): string {
    assertTenantContext(ctx);
    return `${ctx.tenantId}:${userId}`;
  }

  async getById(ctx: TenantContext, userId: string): Promise<UserProfile | null> {
    const key = this.makeKey(ctx, userId);
    return this.profiles.get(key) ?? null;
  }

  async getByUsername(ctx: TenantContext, username: string): Promise<UserProfile | null> {
    assertTenantContext(ctx);
    const target = username.toLowerCase();
    for (const [key, profile] of this.profiles.entries()) {
      if (key.startsWith(`${ctx.tenantId}:`) && profile.username?.toLowerCase() === target) {
        return profile;
      }
    }
    return null;
  }

  async save(ctx: TenantContext, profile: UserProfile): Promise<UserProfile> {
    const key = this.makeKey(ctx, profile.id);
    this.profiles.set(key, profile);
    return profile;
  }

  async update(
    ctx: TenantContext,
    userId: string,
    patch: Partial<UserProfile>,
  ): Promise<UserProfile> {
    const key = this.makeKey(ctx, userId);
    const existing = this.profiles.get(key);
    if (!existing) {
      throw new Error(`User '${userId}' not found`);
    }

    const updated: UserProfile = {
      ...existing,
      ...patch,
      id: existing.id,
      tenantId: existing.tenantId,
      updatedAt: new Date(),
    };

    this.profiles.set(key, updated);
    return updated;
  }

  async anonymize(ctx: TenantContext, userId: string, anonymizedEmail: string): Promise<void> {
    const key = this.makeKey(ctx, userId);
    const existing = this.profiles.get(key);
    if (!existing) {
      return;
    }

    const anonymized: UserProfile = {
      ...existing,
      displayName: "Anonymized User",
      email: anonymizedEmail,
      username: undefined,
      avatarUrl: undefined,
      bio: undefined,
      metadata: undefined,
      updatedAt: new Date(),
    };

    this.profiles.set(key, anonymized);
  }

  clear(): void {
    this.profiles.clear();
  }
}
