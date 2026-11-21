import type { DatabasePort, TenantContext, TenantId, UserId } from "@plinth/core";
import type { OAuthAccount, RefreshToken, Session, User } from "../domain/auth.js";
import type { AuthRepositoryPort } from "../ports/repository.js";

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

export class DbAuthRepository implements AuthRepositoryPort {
  readonly #db: DatabasePort;

  constructor(db: DatabasePort) {
    this.#db = db;
  }

  async initializeSchema(): Promise<void> {
    await this.#db.query(
      `CREATE TABLE IF NOT EXISTS auth_users (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        email TEXT NOT NULL,
        username TEXT,
        email_verified INTEGER NOT NULL,
        password_hash TEXT,
        totp_secret_encrypted TEXT,
        totp_enabled INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
    );
    await this.#db.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(tenant_id, email);",
    );
    await this.#db.query(
      "CREATE INDEX IF NOT EXISTS idx_auth_users_username ON auth_users(tenant_id, username);",
    );

    await this.#db.query(
      `CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        session_token_hash TEXT UNIQUE NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
    );
    await this.#db.query(
      "CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);",
    );

    await this.#db.query(
      `CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        family_id TEXT NOT NULL,
        is_rotated INTEGER NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
    );
    await this.#db.query(
      "CREATE INDEX IF NOT EXISTS idx_auth_refresh_family ON auth_refresh_tokens(family_id);",
    );

    await this.#db.query(
      `CREATE TABLE IF NOT EXISTS auth_oauth_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        provider_email TEXT,
        email_verified INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (provider, provider_user_id)
      );`,
    );
  }

  #mapUser(row: DbUserRow): User {
    const user: User = {
      id: row.id as UserId,
      tenantId: row.tenant_id as TenantId,
      email: row.email,
      emailVerified: row.email_verified === 1,
      totpEnabled: row.totp_enabled === 1,
      status: row.status as "active" | "suspended" | "pending_verification",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    return {
      ...user,
      ...(row.username !== null ? { username: row.username } : {}),
      ...(row.password_hash !== null ? { passwordHash: row.password_hash } : {}),
      ...(row.totp_secret_encrypted !== null
        ? { totpSecretEncrypted: row.totp_secret_encrypted }
        : {}),
    };
  }

  async findUserById(tenantContext: TenantContext, id: UserId): Promise<User | null> {
    const rows = await this.#db.query<DbUserRow>(
      "SELECT * FROM auth_users WHERE tenant_id = ? AND id = ? LIMIT 1;",
      [tenantContext.tenantId, id],
    );
    const row = rows[0];
    return row ? this.#mapUser(row) : null;
  }

  async findUserByEmail(tenantContext: TenantContext, email: string): Promise<User | null> {
    const normalized = email.toLowerCase().trim();
    const rows = await this.#db.query<DbUserRow>(
      "SELECT * FROM auth_users WHERE tenant_id = ? AND LOWER(email) = ? LIMIT 1;",
      [tenantContext.tenantId, normalized],
    );
    const row = rows[0];
    return row ? this.#mapUser(row) : null;
  }

  async findUserByUsername(tenantContext: TenantContext, username: string): Promise<User | null> {
    const normalized = username.toLowerCase().trim();
    const rows = await this.#db.query<DbUserRow>(
      "SELECT * FROM auth_users WHERE tenant_id = ? AND LOWER(username) = ? LIMIT 1;",
      [tenantContext.tenantId, normalized],
    );
    const row = rows[0];
    return row ? this.#mapUser(row) : null;
  }

  async createUser(tenantContext: TenantContext, user: User): Promise<void> {
    await this.#db.query(
      `INSERT INTO auth_users (
        id, tenant_id, email, username, email_verified,
        password_hash, totp_secret_encrypted, totp_enabled,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        user.id,
        tenantContext.tenantId,
        user.email.toLowerCase().trim(),
        user.username?.toLowerCase().trim() ?? null,
        user.emailVerified ? 1 : 0,
        user.passwordHash ?? null,
        user.totpSecretEncrypted ?? null,
        user.totpEnabled ? 1 : 0,
        user.status,
        user.createdAt,
        user.updatedAt,
      ],
    );
  }

  async updateUser(tenantContext: TenantContext, user: User): Promise<void> {
    await this.#db.query(
      `UPDATE auth_users SET
        email = ?,
        username = ?,
        email_verified = ?,
        password_hash = ?,
        totp_secret_encrypted = ?,
        totp_enabled = ?,
        status = ?,
        updated_at = ?
       WHERE tenant_id = ? AND id = ?;`,
      [
        user.email.toLowerCase().trim(),
        user.username?.toLowerCase().trim() ?? null,
        user.emailVerified ? 1 : 0,
        user.passwordHash ?? null,
        user.totpSecretEncrypted ?? null,
        user.totpEnabled ? 1 : 0,
        user.status,
        user.updatedAt,
        tenantContext.tenantId,
        user.id,
      ],
    );
  }

  async createSession(session: Session): Promise<void> {
    await this.#db.query(
      `INSERT INTO auth_sessions (
        id, user_id, tenant_id, session_token_hash, ip_address, user_agent, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        session.id,
        session.userId,
        session.tenantId,
        session.sessionTokenHash,
        session.ipAddress ?? null,
        session.userAgent ?? null,
        session.expiresAt,
        session.createdAt,
      ],
    );
  }

  async findSessionByTokenHash(tokenHash: string): Promise<Session | null> {
    const rows = await this.#db.query<DbSessionRow>(
      "SELECT * FROM auth_sessions WHERE session_token_hash = ? LIMIT 1;",
      [tokenHash],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    const sess: Session = {
      id: row.id,
      userId: row.user_id as UserId,
      tenantId: row.tenant_id as TenantId,
      sessionTokenHash: row.session_token_hash,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
    return {
      ...sess,
      ...(row.ip_address !== null ? { ipAddress: row.ip_address } : {}),
      ...(row.user_agent !== null ? { userAgent: row.user_agent } : {}),
    };
  }

  async deleteSession(tokenHash: string): Promise<boolean> {
    const existing = await this.findSessionByTokenHash(tokenHash);
    if (!existing) {
      return false;
    }
    await this.#db.query("DELETE FROM auth_sessions WHERE session_token_hash = ?;", [tokenHash]);
    return true;
  }

  async deleteSessionsByUserId(userId: UserId): Promise<void> {
    await this.#db.query("DELETE FROM auth_sessions WHERE user_id = ?;", [userId]);
  }

  async createRefreshToken(token: RefreshToken): Promise<void> {
    await this.#db.query(
      `INSERT INTO auth_refresh_tokens (
        id, user_id, tenant_id, token_hash, family_id, is_rotated, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        token.id,
        token.userId,
        token.tenantId,
        token.tokenHash,
        token.familyId,
        token.isRotated ? 1 : 0,
        token.expiresAt,
        token.createdAt,
      ],
    );
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshToken | null> {
    const rows = await this.#db.query<DbRefreshTokenRow>(
      "SELECT * FROM auth_refresh_tokens WHERE token_hash = ? LIMIT 1;",
      [tokenHash],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      userId: row.user_id as UserId,
      tenantId: row.tenant_id as TenantId,
      tokenHash: row.token_hash,
      familyId: row.family_id,
      isRotated: row.is_rotated === 1,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }

  async markRefreshTokenRotated(id: string): Promise<void> {
    await this.#db.query("UPDATE auth_refresh_tokens SET is_rotated = 1 WHERE id = ?;", [id]);
  }

  async revokeRefreshTokenFamily(familyId: string): Promise<void> {
    await this.#db.query("DELETE FROM auth_refresh_tokens WHERE family_id = ?;", [familyId]);
  }

  async findOAuthAccount(provider: string, providerUserId: string): Promise<OAuthAccount | null> {
    const rows = await this.#db.query<DbOAuthRow>(
      "SELECT * FROM auth_oauth_accounts WHERE provider = ? AND provider_user_id = ? LIMIT 1;",
      [provider, providerUserId],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    const acc: OAuthAccount = {
      id: row.id,
      userId: row.user_id as UserId,
      tenantId: row.tenant_id as TenantId,
      provider: row.provider,
      providerUserId: row.provider_user_id,
      emailVerified: row.email_verified === 1,
      createdAt: row.created_at,
    };
    return {
      ...acc,
      ...(row.provider_email !== null ? { providerEmail: row.provider_email } : {}),
    };
  }

  async createOAuthAccount(account: OAuthAccount): Promise<void> {
    await this.#db.query(
      `INSERT INTO auth_oauth_accounts (
        id, user_id, tenant_id, provider, provider_user_id, provider_email, email_verified, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        account.id,
        account.userId,
        account.tenantId,
        account.provider,
        account.providerUserId,
        account.providerEmail ?? null,
        account.emailVerified ? 1 : 0,
        account.createdAt,
      ],
    );
  }
}
