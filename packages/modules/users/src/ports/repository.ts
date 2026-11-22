import type { TenantContext } from "@plinth/core";
import type { UserProfile } from "../domain/user-profile.js";

export interface UserRepositoryPort {
  getById(ctx: TenantContext, userId: string): Promise<UserProfile | null>;
  getByUsername(ctx: TenantContext, username: string): Promise<UserProfile | null>;
  save(ctx: TenantContext, profile: UserProfile): Promise<UserProfile>;
  update(ctx: TenantContext, userId: string, patch: Partial<UserProfile>): Promise<UserProfile>;
  anonymize(ctx: TenantContext, userId: string, anonymizedEmail: string): Promise<void>;
}
