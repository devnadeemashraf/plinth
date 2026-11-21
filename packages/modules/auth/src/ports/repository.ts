import type { TenantContext, UserId } from "@plinth/core";
import type { OAuthAccount, RefreshToken, Session, User } from "../domain/auth.js";

export interface AuthRepositoryPort {
  findUserById(tenantContext: TenantContext, id: UserId): Promise<User | null>;
  findUserByEmail(tenantContext: TenantContext, email: string): Promise<User | null>;
  findUserByUsername(tenantContext: TenantContext, username: string): Promise<User | null>;
  createUser(tenantContext: TenantContext, user: User): Promise<void>;
  updateUser(tenantContext: TenantContext, user: User): Promise<void>;

  createSession(session: Session): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<Session | null>;
  deleteSession(tokenHash: string): Promise<boolean>;
  deleteSessionsByUserId(userId: UserId): Promise<void>;

  createRefreshToken(token: RefreshToken): Promise<void>;
  findRefreshTokenByHash(tokenHash: string): Promise<RefreshToken | null>;
  markRefreshTokenRotated(id: string): Promise<void>;
  revokeRefreshTokenFamily(familyId: string): Promise<void>;

  findOAuthAccount(provider: string, providerUserId: string): Promise<OAuthAccount | null>;
  createOAuthAccount(account: OAuthAccount): Promise<void>;
}
