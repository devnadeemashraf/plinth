import {
  BadRequestError,
  ConflictError,
  createUserId,
  decryptEnvelope,
  encryptEnvelope,
  ForbiddenError,
  generatePkce,
  generateRecoveryCodes,
  generateSecureToken,
  generateTotpSecret,
  generateUuidV7,
  hashPassword,
  hashToken,
  normalizeEmail,
  normalizeUsername,
  signEd25519Jwt,
  type TenantContext,
  type TenantId,
  UnauthorizedError,
  type UserId,
  validatePasswordStrength,
  verifyEd25519Jwt,
  verifyPassword,
  verifyTotp,
} from "@plinth/core";
import type { AuditService } from "@plinth/modules-audit";
import type { ConfigStore } from "@plinth/modules-config-store";
import type {
  LoginDto,
  LoginTotpDto,
  OAuthAccount,
  OAuthCallbackDto,
  RefreshToken,
  RegisterDto,
  Session,
  User,
} from "../domain/auth.js";
import type { OidcProviderPort } from "../ports/oidc-provider.js";
import type { AuthRepositoryPort } from "../ports/repository.js";

// Dummy hash for non-existent users to eliminate timing attacks
const DUMMY_ARGON2_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRmb3JkdW1teQ$4L9L8P5k+rJ8z2X6+L4bYV2FvM4k1Q8R3X0a1B2C3D4";

export interface AuthServiceOptions {
  readonly repository: AuthRepositoryPort;
  readonly configStore: ConfigStore;
  readonly auditService: AuditService;
  readonly masterKey: Buffer | Uint8Array;
  readonly jwtPrivateKeyPem: string;
  readonly jwtPublicKeyPem: string;
  readonly jwtIssuer?: string | undefined;
  readonly jwtAudience?: string | undefined;
  readonly sessionTtlSec?: number | undefined; // Default 7 days
  readonly jwtTtlSec?: number | undefined; // Default 15 mins (900s)
  readonly refreshTokenTtlSec?: number | undefined; // Default 30 days
  readonly oidcProviders?: Record<string, OidcProviderPort> | undefined;
}

export interface ClientContext {
  readonly ipAddress?: string | undefined;
  readonly userAgent?: string | undefined;
  readonly traceId?: string | undefined;
}

export interface AuthResult {
  readonly user: User;
  readonly sessionToken?: string | undefined;
  readonly csrfToken?: string | undefined;
  readonly accessToken?: string | undefined;
  readonly refreshToken?: string | undefined;
}

export interface LoginResult extends AuthResult {
  readonly mfaRequired: boolean;
  readonly mfaTicket?: string | undefined;
}

export interface RefreshResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
}

export interface OAuthInitiateResult {
  readonly authorizationUrl: string;
  readonly state: string;
  readonly codeVerifier: string;
}

export class AuthService {
  readonly #repo: AuthRepositoryPort;
  readonly #configStore: ConfigStore;
  readonly #audit: AuditService;
  readonly #masterKey: Buffer | Uint8Array;
  readonly #jwtPrivateKeyPem: string;
  readonly #jwtPublicKeyPem: string;
  readonly #jwtIssuer: string;
  readonly #jwtAudience: string;
  readonly #sessionTtlSec: number;
  readonly #jwtTtlSec: number;
  readonly #refreshTokenTtlSec: number;
  readonly #oidcProviders: Record<string, OidcProviderPort>;

  constructor(options: AuthServiceOptions) {
    this.#repo = options.repository;
    this.#configStore = options.configStore;
    this.#audit = options.auditService;
    this.#masterKey = options.masterKey;
    this.#jwtPrivateKeyPem = options.jwtPrivateKeyPem;
    this.#jwtPublicKeyPem = options.jwtPublicKeyPem;
    this.#jwtIssuer = options.jwtIssuer ?? "https://auth.plinth.dev";
    this.#jwtAudience = options.jwtAudience ?? "plinth-api";
    this.#sessionTtlSec = options.sessionTtlSec ?? 7 * 24 * 60 * 60;
    this.#jwtTtlSec = options.jwtTtlSec ?? 900;
    this.#refreshTokenTtlSec = options.refreshTokenTtlSec ?? 30 * 24 * 60 * 60;
    this.#oidcProviders = { ...(options.oidcProviders ?? {}) };
  }

  async #assertEmailPasswordEnabled(): Promise<void> {
    const enabled = await this.#configStore.getBoolean("auth.emailPasswordEnabled", true);
    if (!enabled) {
      throw new ForbiddenError("Email and password authentication is currently disabled.", {
        code: "AUTH_METHOD_DISABLED",
      });
    }
  }

  async #assertOAuthEnabled(): Promise<void> {
    const enabled = await this.#configStore.getBoolean("auth.oauthEnabled", true);
    if (!enabled) {
      throw new ForbiddenError("OAuth2/OIDC authentication is currently disabled.", {
        code: "AUTH_METHOD_DISABLED",
      });
    }
  }

  #generateJwt(userId: UserId, tenantId: TenantId): string {
    const now = Math.floor(Date.now() / 1000);
    return signEd25519Jwt(
      {
        sub: userId,
        tenantId,
        iss: this.#jwtIssuer,
        aud: this.#jwtAudience,
        iat: now,
        exp: now + this.#jwtTtlSec,
      },
      this.#jwtPrivateKeyPem,
    );
  }

  async #createSessionAndTokens(
    user: User,
    client: ClientContext = {},
  ): Promise<{
    sessionToken: string;
    csrfToken: string;
    accessToken: string;
    refreshToken: string;
  }> {
    const sessionToken = generateSecureToken(32);
    const csrfToken = generateSecureToken(32);
    const refreshToken = generateSecureToken(32);

    const now = new Date();
    const sessionExpiresAt = new Date(now.getTime() + this.#sessionTtlSec * 1000).toISOString();
    const refreshExpiresAt = new Date(
      now.getTime() + this.#refreshTokenTtlSec * 1000,
    ).toISOString();

    const session: Session = {
      id: generateUuidV7(),
      userId: user.id,
      tenantId: user.tenantId,
      sessionTokenHash: hashToken(sessionToken),
      expiresAt: sessionExpiresAt,
      createdAt: now.toISOString(),
      ...(client.ipAddress ? { ipAddress: client.ipAddress } : {}),
      ...(client.userAgent ? { userAgent: client.userAgent } : {}),
    };
    await this.#repo.createSession(session);

    const familyId = generateUuidV7();
    const refreshRecord: RefreshToken = {
      id: generateUuidV7(),
      userId: user.id,
      tenantId: user.tenantId,
      tokenHash: hashToken(refreshToken),
      familyId,
      isRotated: false,
      expiresAt: refreshExpiresAt,
      createdAt: now.toISOString(),
    };
    await this.#repo.createRefreshToken(refreshRecord);

    const accessToken = this.#generateJwt(user.id, user.tenantId);

    return { sessionToken, csrfToken, accessToken, refreshToken };
  }

  async register(
    tenantContext: TenantContext,
    dto: RegisterDto,
    client: ClientContext = {},
  ): Promise<AuthResult> {
    await this.#assertEmailPasswordEnabled();

    const normalizedEmail = normalizeEmail(dto.email);
    validatePasswordStrength(dto.password);

    const existing = await this.#repo.findUserByEmail(tenantContext, normalizedEmail);
    if (existing) {
      throw new ConflictError("An account with this email address already exists.", {
        code: "EMAIL_ALREADY_EXISTS",
      });
    }

    if (dto.username) {
      const normalizedUsername = normalizeUsername(dto.username);
      const existingUser = await this.#repo.findUserByUsername(tenantContext, normalizedUsername);
      if (existingUser) {
        throw new ConflictError("An account with this username already exists.", {
          code: "USERNAME_ALREADY_EXISTS",
        });
      }
    }

    const passwordHash = await hashPassword(dto.password);
    const now = new Date().toISOString();
    const userId = createUserId(generateUuidV7());

    const user: User = {
      id: userId,
      tenantId: tenantContext.tenantId,
      email: normalizedEmail,
      emailVerified: false,
      passwordHash,
      totpEnabled: false,
      status: "active",
      createdAt: now,
      updatedAt: now,
      ...(dto.username ? { username: normalizeUsername(dto.username) } : {}),
    };

    await this.#repo.createUser(tenantContext, user);

    await this.#audit.record({
      tenantId: tenantContext.tenantId,
      actorId: user.id,
      actorType: "user",
      action: "auth.register",
      resourceType: "user",
      resourceId: user.id,
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
      traceId: client.traceId,
    });

    const tokens = await this.#createSessionAndTokens(user, client);
    return { user, ...tokens };
  }

  async login(
    tenantContext: TenantContext,
    dto: LoginDto,
    client: ClientContext = {},
  ): Promise<LoginResult> {
    await this.#assertEmailPasswordEnabled();

    const identifier = dto.identifier.trim();
    let user: User | null = null;

    if (identifier.includes("@")) {
      user = await this.#repo.findUserByEmail(tenantContext, normalizeEmail(identifier));
    } else {
      user = await this.#repo.findUserByUsername(tenantContext, normalizeUsername(identifier));
    }

    const candidateHash = user?.passwordHash ?? DUMMY_ARGON2_HASH;
    const isPasswordValid = await verifyPassword(candidateHash, dto.password);

    if (!user || !isPasswordValid) {
      await this.#audit.record({
        tenantId: tenantContext.tenantId,
        actorType: "anonymous",
        action: "auth.login.failed",
        resourceType: "user",
        payloadDiff: { identifier },
        ipAddress: client.ipAddress,
        userAgent: client.userAgent,
        traceId: client.traceId,
      });

      throw new UnauthorizedError("Invalid email or password.", {
        code: "INVALID_CREDENTIALS",
      });
    }

    if (user.status === "suspended") {
      throw new ForbiddenError("Your account has been suspended.", {
        code: "ACCOUNT_SUSPENDED",
      });
    }

    if (user.totpEnabled) {
      // Issue short-lived MFA ticket JWT (5 minutes)
      const now = Math.floor(Date.now() / 1000);
      const mfaTicket = signEd25519Jwt(
        {
          sub: user.id,
          tenantId: user.tenantId,
          type: "mfa_ticket",
          exp: now + 300,
        },
        this.#jwtPrivateKeyPem,
      );

      return {
        user,
        mfaRequired: true,
        mfaTicket,
      };
    }

    await this.#audit.record({
      tenantId: tenantContext.tenantId,
      actorId: user.id,
      actorType: "user",
      action: "auth.login.success",
      resourceType: "user",
      resourceId: user.id,
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
      traceId: client.traceId,
    });

    const tokens = await this.#createSessionAndTokens(user, client);
    return { user, mfaRequired: false, ...tokens };
  }

  async loginWithTotp(
    tenantContext: TenantContext,
    dto: LoginTotpDto,
    client: ClientContext = {},
  ): Promise<AuthResult> {
    const claims = verifyEd25519Jwt(dto.mfaTicket, this.#jwtPublicKeyPem);
    if (claims["type"] !== "mfa_ticket" || !claims.sub) {
      throw new UnauthorizedError("Invalid or expired MFA ticket.", {
        code: "INVALID_MFA_TICKET",
      });
    }

    const user = await this.#repo.findUserById(tenantContext, claims.sub as UserId);
    if (!user?.totpSecretEncrypted) {
      throw new UnauthorizedError("User does not have TOTP configured.", {
        code: "MFA_NOT_CONFIGURED",
      });
    }

    const secret = decryptEnvelope(user.totpSecretEncrypted, this.#masterKey).toString("utf8");
    const isCodeValid = verifyTotp(dto.totpCode, secret);

    if (!isCodeValid) {
      await this.#audit.record({
        tenantId: tenantContext.tenantId,
        actorId: user.id,
        actorType: "user",
        action: "auth.login.totp_failed",
        resourceType: "user",
        resourceId: user.id,
        ipAddress: client.ipAddress,
        userAgent: client.userAgent,
        traceId: client.traceId,
      });

      throw new UnauthorizedError("Invalid TOTP authentication code.", {
        code: "INVALID_TOTP_CODE",
      });
    }

    await this.#audit.record({
      tenantId: tenantContext.tenantId,
      actorId: user.id,
      actorType: "user",
      action: "auth.login.totp_success",
      resourceType: "user",
      resourceId: user.id,
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
      traceId: client.traceId,
    });

    const tokens = await this.#createSessionAndTokens(user, client);
    return { user, ...tokens };
  }

  async refreshTokens(
    dto: { readonly refreshToken: string },
    client: ClientContext = {},
  ): Promise<RefreshResult> {
    const tokenHash = hashToken(dto.refreshToken);
    const tokenRecord = await this.#repo.findRefreshTokenByHash(tokenHash);

    if (!tokenRecord) {
      throw new UnauthorizedError("Invalid or expired refresh token.", {
        code: "INVALID_REFRESH_TOKEN",
      });
    }

    // REUSE DETECTION DEFENSE:
    // If an already rotated refresh token is presented, someone is replaying a stolen token!
    // Instantly revoke the entire family to protect the user's account.
    if (tokenRecord.isRotated) {
      await this.#repo.revokeRefreshTokenFamily(tokenRecord.familyId);

      await this.#audit.record({
        tenantId: tokenRecord.tenantId,
        actorId: tokenRecord.userId,
        actorType: "user",
        action: "auth.refresh.reuse_detected",
        resourceType: "token",
        payloadDiff: { familyId: tokenRecord.familyId },
        ipAddress: client.ipAddress,
        userAgent: client.userAgent,
        traceId: client.traceId,
      });

      throw new UnauthorizedError(
        "Refresh token reuse detected. All tokens in this family have been revoked.",
        { code: "REFRESH_TOKEN_REUSED" },
      );
    }

    const expiresAt = new Date(tokenRecord.expiresAt).getTime();
    if (expiresAt < Date.now()) {
      throw new UnauthorizedError("Refresh token has expired.", {
        code: "REFRESH_TOKEN_EXPIRED",
      });
    }

    // 1. Mark current token as rotated
    await this.#repo.markRefreshTokenRotated(tokenRecord.id);

    // 2. Issue new refresh token within the same family
    const newRefreshToken = generateSecureToken(32);
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + this.#refreshTokenTtlSec * 1000).toISOString();

    const newRecord: RefreshToken = {
      id: generateUuidV7(),
      userId: tokenRecord.userId,
      tenantId: tokenRecord.tenantId,
      tokenHash: hashToken(newRefreshToken),
      familyId: tokenRecord.familyId,
      isRotated: false,
      expiresAt: newExpiresAt,
      createdAt: now.toISOString(),
    };
    await this.#repo.createRefreshToken(newRecord);

    // 3. Issue new access token
    const newAccessToken = this.#generateJwt(tokenRecord.userId, tokenRecord.tenantId);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: this.#jwtTtlSec,
    };
  }

  async logout(params: {
    readonly sessionToken?: string | undefined;
    readonly refreshToken?: string | undefined;
  }): Promise<void> {
    if (params.sessionToken) {
      const hash = hashToken(params.sessionToken);
      await this.#repo.deleteSession(hash);
    }

    if (params.refreshToken) {
      const hash = hashToken(params.refreshToken);
      const token = await this.#repo.findRefreshTokenByHash(hash);
      if (token) {
        await this.#repo.revokeRefreshTokenFamily(token.familyId);
      }
    }
  }

  async setupTotp(
    _tenantContext: TenantContext,
    userId: UserId,
  ): Promise<{
    secret: string;
    uri: string;
    encryptedSecret: string;
    recoveryCodes: readonly string[];
  }> {
    const { secret, uri } = generateTotpSecret("Plinth", userId);
    const encryptedSecret = encryptEnvelope(secret, this.#masterKey);
    const { plaintextCodes } = generateRecoveryCodes(8);

    return {
      secret,
      uri,
      encryptedSecret,
      recoveryCodes: plaintextCodes,
    };
  }

  async enableTotp(
    tenantContext: TenantContext,
    userId: UserId,
    code: string,
    encryptedSecret: string,
  ): Promise<User> {
    const user = await this.#repo.findUserById(tenantContext, userId);
    if (!user) {
      throw new UnauthorizedError("User not found.", { code: "USER_NOT_FOUND" });
    }

    const secret = decryptEnvelope(encryptedSecret, this.#masterKey).toString("utf8");
    const isCodeValid = verifyTotp(code, secret);

    if (!isCodeValid) {
      throw new BadRequestError("Invalid TOTP verification code.", {
        code: "INVALID_TOTP_CODE",
      });
    }

    const updated: User = {
      ...user,
      totpSecretEncrypted: encryptedSecret,
      totpEnabled: true,
      updatedAt: new Date().toISOString(),
    };

    await this.#repo.updateUser(tenantContext, updated);
    return updated;
  }

  async initiateOAuth(
    providerName: string,
    redirectUri: string,
    _tenantId: TenantId,
  ): Promise<OAuthInitiateResult> {
    await this.#assertOAuthEnabled();

    const provider = this.#oidcProviders[providerName];
    if (!provider) {
      throw new BadRequestError(`Unsupported OAuth provider: '${providerName}'.`, {
        code: "UNSUPPORTED_OAUTH_PROVIDER",
      });
    }

    const pkce = generatePkce();
    const state = generateSecureToken(32);

    const authorizationUrl = await provider.getAuthorizationUrl({
      state,
      codeChallenge: pkce.codeChallenge,
      redirectUri,
    });

    return {
      authorizationUrl,
      state,
      codeVerifier: pkce.codeVerifier,
    };
  }

  async handleOAuthCallback(
    providerName: string,
    dto: OAuthCallbackDto,
    tenantContext: TenantContext,
    client: ClientContext = {},
  ): Promise<AuthResult> {
    await this.#assertOAuthEnabled();

    const provider = this.#oidcProviders[providerName];
    if (!provider) {
      throw new BadRequestError(`Unsupported OAuth provider: '${providerName}'.`, {
        code: "UNSUPPORTED_OAUTH_PROVIDER",
      });
    }

    const userInfo = await provider.exchangeCode({
      code: dto.code,
      codeVerifier: dto.codeVerifier,
      redirectUri: dto.redirectUri,
    });

    // 1. Check if OAuth account is already linked
    const existingOAuth = await this.#repo.findOAuthAccount(providerName, userInfo.sub);
    let user: User | null = null;

    if (existingOAuth) {
      user = await this.#repo.findUserById(tenantContext, existingOAuth.userId);
    } else if (userInfo.email) {
      const normalizedEmail = normalizeEmail(userInfo.email);
      const existingUser = await this.#repo.findUserByEmail(tenantContext, normalizedEmail);

      if (existingUser) {
        // DEFENSE AGAINST UNVERIFIED OAUTH EMAIL LINKING ATTACK:
        // Never auto-link an existing account unless BOTH the OAuth email and the existing account email are verified!
        if (!userInfo.email_verified || !existingUser.emailVerified) {
          throw new BadRequestError(
            "Cannot link OAuth account: Email verification is required on both accounts before linking.",
            { code: "OAUTH_UNVERIFIED_EMAIL_LINK_REJECTED" },
          );
        }

        user = existingUser;
      } else {
        // Create new user for this OAuth profile
        const now = new Date().toISOString();
        user = {
          id: createUserId(generateUuidV7()),
          tenantId: tenantContext.tenantId,
          email: normalizedEmail,
          emailVerified: Boolean(userInfo.email_verified),
          totpEnabled: false,
          status: "active",
          createdAt: now,
          updatedAt: now,
          ...(userInfo.name
            ? { username: normalizeUsername(userInfo.name.replace(/\s+/g, "_")) }
            : {}),
        };
        await this.#repo.createUser(tenantContext, user);
      }

      // Link OAuth account
      const oauthAccount: OAuthAccount = {
        id: generateUuidV7(),
        userId: user.id,
        tenantId: tenantContext.tenantId,
        provider: providerName,
        providerUserId: userInfo.sub,
        emailVerified: Boolean(userInfo.email_verified),
        createdAt: new Date().toISOString(),
        ...(userInfo.email ? { providerEmail: normalizeEmail(userInfo.email) } : {}),
      };
      await this.#repo.createOAuthAccount(oauthAccount);
    }

    if (!user) {
      throw new UnauthorizedError("Failed to authenticate user from OAuth identity.", {
        code: "OAUTH_AUTHENTICATION_FAILED",
      });
    }

    await this.#audit.record({
      tenantId: tenantContext.tenantId,
      actorId: user.id,
      actorType: "user",
      action: "auth.oauth.login",
      resourceType: "user",
      resourceId: user.id,
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
      traceId: client.traceId,
    });

    const tokens = await this.#createSessionAndTokens(user, client);
    return { user, ...tokens };
  }
}
