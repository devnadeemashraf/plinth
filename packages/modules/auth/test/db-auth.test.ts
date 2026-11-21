import type { DatabasePort, TenantContext } from "@plinth/core";
import { createTenantId, createUserId } from "@plinth/core";
import type {
  OAuthAccount,
  RefreshToken,
  Session,
  User,
} from "@plinth/modules-auth/domain/auth.js";
import { DbAuthRepository } from "@plinth/modules-auth/infrastructure/db-auth-repository.js";
import { beforeEach, describe, expect, it } from "vitest";

interface DbUserRow {
  id: string;
  tenant_id: string;
  email: string;
  username: string | null;
  email_verified: number;
  password_hash: string | null;
  totp_secret_encrypted: string | null;
  totp_enabled: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface DbSessionRow {
  id: string;
  user_id: string;
  tenant_id: string;
  session_token_hash: string;
  ip_address: string | null;
  user_agent: string | null;
  expires_at: string;
  created_at: string;
}

interface DbRefreshTokenRow {
  id: string;
  user_id: string;
  tenant_id: string;
  token_hash: string;
  family_id: string;
  is_rotated: number;
  expires_at: string;
  created_at: string;
}

interface DbOAuthRow {
  id: string;
  user_id: string;
  tenant_id: string;
  provider: string;
  provider_user_id: string;
  provider_email: string | null;
  email_verified: number;
  created_at: string;
}

class MockAuthDatabasePort implements DatabasePort {
  readonly users = new Map<string, DbUserRow>();
  readonly sessions = new Map<string, DbSessionRow>();
  readonly refreshTokens = new Map<string, DbRefreshTokenRow>();
  readonly oauthAccounts = new Map<string, DbOAuthRow>();

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (
      sql.includes("CREATE TABLE") ||
      sql.includes("CREATE INDEX") ||
      sql.includes("CREATE UNIQUE INDEX")
    ) {
      return [] as T[];
    }

    // User queries
    if (sql.includes("SELECT * FROM auth_users WHERE tenant_id = ? AND id = ?")) {
      const tenantId = params[0] as string;
      const id = params[1] as string;
      const row = Array.from(this.users.values()).find(
        (u) => u.tenant_id === tenantId && u.id === id,
      );
      return (row ? [row] : []) as T[];
    }
    if (sql.includes("SELECT * FROM auth_users WHERE tenant_id = ? AND LOWER(email) = ?")) {
      const tenantId = params[0] as string;
      const email = params[1] as string;
      const row = Array.from(this.users.values()).find(
        (u) => u.tenant_id === tenantId && u.email.toLowerCase() === email.toLowerCase(),
      );
      return (row ? [row] : []) as T[];
    }
    if (sql.includes("SELECT * FROM auth_users WHERE tenant_id = ? AND LOWER(username) = ?")) {
      const tenantId = params[0] as string;
      const username = params[1] as string;
      const row = Array.from(this.users.values()).find(
        (u) => u.tenant_id === tenantId && u.username?.toLowerCase() === username.toLowerCase(),
      );
      return (row ? [row] : []) as T[];
    }
    if (sql.includes("INSERT INTO auth_users")) {
      const row: DbUserRow = {
        id: params[0] as string,
        tenant_id: params[1] as string,
        email: params[2] as string,
        username: (params[3] as string | null) ?? null,
        email_verified: params[4] as number,
        password_hash: (params[5] as string | null) ?? null,
        totp_secret_encrypted: (params[6] as string | null) ?? null,
        totp_enabled: params[7] as number,
        status: params[8] as string,
        created_at: params[9] as string,
        updated_at: params[10] as string,
      };
      this.users.set(row.id, row);
      return [] as T[];
    }
    if (sql.includes("UPDATE auth_users SET")) {
      const email = params[0] as string;
      const username = params[1] as string | null;
      const email_verified = params[2] as number;
      const password_hash = params[3] as string | null;
      const totp_secret_encrypted = params[4] as string | null;
      const totp_enabled = params[5] as number;
      const status = params[6] as string;
      const updated_at = params[7] as string;
      const tenant_id = params[8] as string;
      const id = params[9] as string;
      const existing = this.users.get(id);
      if (existing && existing.tenant_id === tenant_id) {
        this.users.set(id, {
          ...existing,
          email,
          username,
          email_verified,
          password_hash,
          totp_secret_encrypted,
          totp_enabled,
          status,
          updated_at,
        });
      }
      return [] as T[];
    }

    // Session queries
    if (sql.includes("INSERT INTO auth_sessions")) {
      const row: DbSessionRow = {
        id: params[0] as string,
        user_id: params[1] as string,
        tenant_id: params[2] as string,
        session_token_hash: params[3] as string,
        ip_address: (params[4] as string | null) ?? null,
        user_agent: (params[5] as string | null) ?? null,
        expires_at: params[6] as string,
        created_at: params[7] as string,
      };
      this.sessions.set(row.session_token_hash, row);
      return [] as T[];
    }
    if (sql.includes("SELECT * FROM auth_sessions WHERE session_token_hash = ?")) {
      const tokenHash = params[0] as string;
      const row = this.sessions.get(tokenHash);
      return (row ? [row] : []) as T[];
    }
    if (sql.includes("DELETE FROM auth_sessions WHERE session_token_hash = ?")) {
      const tokenHash = params[0] as string;
      this.sessions.delete(tokenHash);
      return [] as T[];
    }
    if (sql.includes("DELETE FROM auth_sessions WHERE user_id = ?")) {
      const userId = params[0] as string;
      for (const [key, s] of this.sessions.entries()) {
        if (s.user_id === userId) {
          this.sessions.delete(key);
        }
      }
      return [] as T[];
    }

    // Refresh token queries
    if (sql.includes("INSERT INTO auth_refresh_tokens")) {
      const row: DbRefreshTokenRow = {
        id: params[0] as string,
        user_id: params[1] as string,
        tenant_id: params[2] as string,
        token_hash: params[3] as string,
        family_id: params[4] as string,
        is_rotated: params[5] as number,
        expires_at: params[6] as string,
        created_at: params[7] as string,
      };
      this.refreshTokens.set(row.token_hash, row);
      return [] as T[];
    }
    if (sql.includes("SELECT * FROM auth_refresh_tokens WHERE token_hash = ?")) {
      const tokenHash = params[0] as string;
      const row = this.refreshTokens.get(tokenHash);
      return (row ? [row] : []) as T[];
    }
    if (sql.includes("UPDATE auth_refresh_tokens SET is_rotated = 1 WHERE id = ?")) {
      const id = params[0] as string;
      for (const [key, t] of this.refreshTokens.entries()) {
        if (t.id === id) {
          this.refreshTokens.set(key, { ...t, is_rotated: 1 });
        }
      }
      return [] as T[];
    }
    if (sql.includes("DELETE FROM auth_refresh_tokens WHERE family_id = ?")) {
      const familyId = params[0] as string;
      for (const [key, t] of this.refreshTokens.entries()) {
        if (t.family_id === familyId) {
          this.refreshTokens.delete(key);
        }
      }
      return [] as T[];
    }

    // OAuth queries
    if (sql.includes("INSERT INTO auth_oauth_accounts")) {
      const row: DbOAuthRow = {
        id: params[0] as string,
        user_id: params[1] as string,
        tenant_id: params[2] as string,
        provider: params[3] as string,
        provider_user_id: params[4] as string,
        provider_email: (params[5] as string | null) ?? null,
        email_verified: params[6] as number,
        created_at: params[7] as string,
      };
      const key = `${row.provider}:${row.provider_user_id}`;
      this.oauthAccounts.set(key, row);
      return [] as T[];
    }
    if (
      sql.includes("SELECT * FROM auth_oauth_accounts WHERE provider = ? AND provider_user_id = ?")
    ) {
      const provider = params[0] as string;
      const providerUserId = params[1] as string;
      const key = `${provider}:${providerUserId}`;
      const row = this.oauthAccounts.get(key);
      return (row ? [row] : []) as T[];
    }

    return [] as T[];
  }

  async transaction<T>(fn: (tx: DatabasePort) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}

  getUnderlyingClient(): unknown {
    return this;
  }
}

describe("DbAuthRepository SQL Adapter", () => {
  let db: MockAuthDatabasePort;
  let repo: DbAuthRepository;
  let tenantCtx: TenantContext;

  beforeEach(async () => {
    db = new MockAuthDatabasePort();
    repo = new DbAuthRepository(db);
    tenantCtx = {
      tenantId: createTenantId("tnt_prod"),
      mode: "single",
      slug: "prod",
      isDefault: false,
    };
    await repo.initializeSchema();
  });

  it("handles user CRUD and queries by ID, email, and username", async () => {
    const userId = createUserId("usr_123");
    const user: User = {
      id: userId,
      tenantId: createTenantId("tnt_prod"),
      email: "Alice@Example.com",
      username: "AliceUser",
      emailVerified: true,
      passwordHash: "argon2id$hashed",
      totpSecretEncrypted: "enc:totp",
      totpEnabled: true,
      status: "active",
      createdAt: "2026-11-21T00:00:00.000Z",
      updatedAt: "2026-11-21T00:00:00.000Z",
    };

    expect(await repo.findUserById(tenantCtx, userId)).toBeNull();
    expect(await repo.findUserByEmail(tenantCtx, "alice@example.com")).toBeNull();
    expect(await repo.findUserByUsername(tenantCtx, "aliceuser")).toBeNull();

    await repo.createUser(tenantCtx, user);

    const byId = await repo.findUserById(tenantCtx, userId);
    expect(byId).not.toBeNull();
    expect(byId?.id).toBe(userId);
    expect(byId?.email).toBe("alice@example.com");
    expect(byId?.username).toBe("aliceuser");
    expect(byId?.emailVerified).toBe(true);
    expect(byId?.totpEnabled).toBe(true);
    expect(byId?.passwordHash).toBe("argon2id$hashed");
    expect(byId?.totpSecretEncrypted).toBe("enc:totp");

    const byEmail = await repo.findUserByEmail(tenantCtx, "ALICE@EXAMPLE.COM");
    expect(byEmail?.id).toBe(userId);

    const byUsername = await repo.findUserByUsername(tenantCtx, "ALICEUSER");
    expect(byUsername?.id).toBe(userId);

    // Update user
    const updatedUser: User = {
      ...user,
      email: "alice_updated@example.com",
      status: "suspended",
      updatedAt: "2026-11-21T01:00:00.000Z",
    };
    await repo.updateUser(tenantCtx, updatedUser);

    const refreshed = await repo.findUserById(tenantCtx, userId);
    expect(refreshed?.email).toBe("alice_updated@example.com");
    expect(refreshed?.status).toBe("suspended");
  });

  it("handles minimal user without username, password, or totp", async () => {
    const userId = createUserId("usr_min");
    const user: User = {
      id: userId,
      tenantId: createTenantId("tnt_prod"),
      email: "min@example.com",
      emailVerified: false,
      totpEnabled: false,
      status: "pending_verification",
      createdAt: "2026-11-21T00:00:00.000Z",
      updatedAt: "2026-11-21T00:00:00.000Z",
    };

    await repo.createUser(tenantCtx, user);
    const found = await repo.findUserById(tenantCtx, userId);
    expect(found?.username).toBeUndefined();
    expect(found?.passwordHash).toBeUndefined();
    expect(found?.totpSecretEncrypted).toBeUndefined();
    expect(found?.emailVerified).toBe(false);
    expect(found?.totpEnabled).toBe(false);
  });

  it("handles session creation, lookup, and deletion", async () => {
    const session: Session = {
      id: "sess_1",
      userId: createUserId("usr_123"),
      tenantId: createTenantId("tnt_prod"),
      sessionTokenHash: "hash_token_abc",
      ipAddress: "127.0.0.1",
      userAgent: "Vitest/1.0",
      expiresAt: "2026-11-22T00:00:00.000Z",
      createdAt: "2026-11-21T00:00:00.000Z",
    };

    expect(await repo.findSessionByTokenHash("hash_token_abc")).toBeNull();

    await repo.createSession(session);
    const found = await repo.findSessionByTokenHash("hash_token_abc");
    expect(found).not.toBeNull();
    expect(found?.userId).toBe(session.userId);
    expect(found?.ipAddress).toBe("127.0.0.1");
    expect(found?.userAgent).toBe("Vitest/1.0");

    const deleted = await repo.deleteSession("hash_token_abc");
    expect(deleted).toBe(true);

    const deletedAgain = await repo.deleteSession("hash_token_abc");
    expect(deletedAgain).toBe(false);

    // Multiple sessions deleted by user id
    await repo.createSession({ ...session, sessionTokenHash: "hash1" });
    await repo.createSession({ ...session, sessionTokenHash: "hash2" });
    await repo.deleteSessionsByUserId(session.userId);

    expect(await repo.findSessionByTokenHash("hash1")).toBeNull();
    expect(await repo.findSessionByTokenHash("hash2")).toBeNull();
  });

  it("handles refresh token lifecycle and family revocation", async () => {
    const refreshToken: RefreshToken = {
      id: "rt_1",
      userId: createUserId("usr_123"),
      tenantId: createTenantId("tnt_prod"),
      tokenHash: "rt_hash_1",
      familyId: "family_alpha",
      isRotated: false,
      expiresAt: "2026-11-28T00:00:00.000Z",
      createdAt: "2026-11-21T00:00:00.000Z",
    };

    expect(await repo.findRefreshTokenByHash("rt_hash_1")).toBeNull();

    await repo.createRefreshToken(refreshToken);
    const found = await repo.findRefreshTokenByHash("rt_hash_1");
    expect(found).not.toBeNull();
    expect(found?.isRotated).toBe(false);

    await repo.markRefreshTokenRotated("rt_1");
    const rotated = await repo.findRefreshTokenByHash("rt_hash_1");
    expect(rotated?.isRotated).toBe(true);

    await repo.createRefreshToken({
      ...refreshToken,
      id: "rt_2",
      tokenHash: "rt_hash_2",
      familyId: "family_alpha",
    });

    await repo.revokeRefreshTokenFamily("family_alpha");
    expect(await repo.findRefreshTokenByHash("rt_hash_1")).toBeNull();
    expect(await repo.findRefreshTokenByHash("rt_hash_2")).toBeNull();
  });

  it("handles OAuth account creation and lookup", async () => {
    const account: OAuthAccount = {
      id: "oauth_1",
      userId: createUserId("usr_123"),
      tenantId: createTenantId("tnt_prod"),
      provider: "google",
      providerUserId: "goog_sub_999",
      providerEmail: "oauth@example.com",
      emailVerified: true,
      createdAt: "2026-11-21T00:00:00.000Z",
    };

    expect(await repo.findOAuthAccount("google", "goog_sub_999")).toBeNull();

    await repo.createOAuthAccount(account);
    const found = await repo.findOAuthAccount("google", "goog_sub_999");
    expect(found).not.toBeNull();
    expect(found?.provider).toBe("google");
    expect(found?.providerEmail).toBe("oauth@example.com");
    expect(found?.emailVerified).toBe(true);
  });
});
