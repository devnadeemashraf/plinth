import type { TenantContext, UserId } from "@plinth/core";
import type { OAuthAccount, RefreshToken, Session, User } from "../domain/auth.js";
import type { AuthRepositoryPort } from "../ports/repository.js";

export class InMemoryAuthRepository implements AuthRepositoryPort {
  readonly #users = new Map<string, User>();
  readonly #sessions = new Map<string, Session>();
  readonly #refreshTokens = new Map<string, RefreshToken>();
  readonly #oauthAccounts = new Map<string, OAuthAccount>();

  #userKey(tenantId: string, id: string): string {
    return `${tenantId}:${id}`;
  }

  async findUserById(tenantContext: TenantContext, id: UserId): Promise<User | null> {
    const user = this.#users.get(this.#userKey(tenantContext.tenantId, id));
    return user ?? null;
  }

  async findUserByEmail(tenantContext: TenantContext, email: string): Promise<User | null> {
    const normalized = email.toLowerCase().trim();
    for (const u of this.#users.values()) {
      if (u.tenantId === tenantContext.tenantId && u.email.toLowerCase().trim() === normalized) {
        return u;
      }
    }
    return null;
  }

  async findUserByUsername(tenantContext: TenantContext, username: string): Promise<User | null> {
    const normalized = username.toLowerCase().trim();
    for (const u of this.#users.values()) {
      if (
        u.tenantId === tenantContext.tenantId &&
        u.username?.toLowerCase().trim() === normalized
      ) {
        return u;
      }
    }
    return null;
  }

  async createUser(tenantContext: TenantContext, user: User): Promise<void> {
    this.#users.set(this.#userKey(tenantContext.tenantId, user.id), user);
  }

  async updateUser(tenantContext: TenantContext, user: User): Promise<void> {
    this.#users.set(this.#userKey(tenantContext.tenantId, user.id), user);
  }

  async createSession(session: Session): Promise<void> {
    this.#sessions.set(session.sessionTokenHash, session);
  }

  async findSessionByTokenHash(tokenHash: string): Promise<Session | null> {
    return this.#sessions.get(tokenHash) ?? null;
  }

  async deleteSession(tokenHash: string): Promise<boolean> {
    return this.#sessions.delete(tokenHash);
  }

  async deleteSessionsByUserId(userId: UserId): Promise<void> {
    for (const [hash, sess] of this.#sessions.entries()) {
      if (sess.userId === userId) {
        this.#sessions.delete(hash);
      }
    }
  }

  async createRefreshToken(token: RefreshToken): Promise<void> {
    this.#refreshTokens.set(token.tokenHash, token);
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.#refreshTokens.get(tokenHash) ?? null;
  }

  async markRefreshTokenRotated(id: string): Promise<void> {
    for (const [hash, tok] of this.#refreshTokens.entries()) {
      if (tok.id === id) {
        this.#refreshTokens.set(hash, { ...tok, isRotated: true });
        break;
      }
    }
  }

  async revokeRefreshTokenFamily(familyId: string): Promise<void> {
    for (const [hash, tok] of this.#refreshTokens.entries()) {
      if (tok.familyId === familyId) {
        this.#refreshTokens.delete(hash);
      }
    }
  }

  async findOAuthAccount(provider: string, providerUserId: string): Promise<OAuthAccount | null> {
    const key = `${provider}:${providerUserId}`;
    return this.#oauthAccounts.get(key) ?? null;
  }

  async createOAuthAccount(account: OAuthAccount): Promise<void> {
    const key = `${account.provider}:${account.providerUserId}`;
    this.#oauthAccounts.set(key, account);
  }
}
