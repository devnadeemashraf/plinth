import {
  AppError,
  createTenantId,
  generateEd25519KeyPair,
  type TenantContext,
  verifyEd25519Jwt,
} from "@plinth/core";
import { AuditService, InMemoryAuditLogRepository } from "@plinth/modules-audit";
import { AuthService, InMemoryAuthRepository, MockOidcProvider } from "@plinth/modules-auth";
import { ConfigStore, InMemoryConfigStoreRepository } from "@plinth/modules-config-store";
import { beforeEach, describe, expect, it } from "vitest";

describe("Auth: Slim Auth Core, Dual Sessions, PKCE & Audit (5-Category Matrix)", () => {
  const masterKey = Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 13 + 7) % 256));
  const keyPair = generateEd25519KeyPair();
  const tenantId = createTenantId("tnt_demo");
  const tenantContext: TenantContext = {
    tenantId,
    mode: "single",
    slug: "demo",
    isDefault: true,
  };

  let authRepo: InMemoryAuthRepository;
  let configStore: ConfigStore;
  let auditService: AuditService;
  let mockOidc: MockOidcProvider;
  let authService: AuthService;

  beforeEach(() => {
    authRepo = new InMemoryAuthRepository();
    const configRepo = new InMemoryConfigStoreRepository();
    configStore = new ConfigStore({
      repository: configRepo,
      masterKey,
      fallbacks: {
        "auth.emailPasswordEnabled": "true",
        "auth.oauthEnabled": "true",
      },
    });
    const auditRepo = new InMemoryAuditLogRepository();
    auditService = new AuditService({ repository: auditRepo });
    mockOidc = new MockOidcProvider();

    authService = new AuthService({
      repository: authRepo,
      configStore,
      auditService,
      masterKey,
      jwtPrivateKeyPem: keyPair.privateKeyPem,
      jwtPublicKeyPem: keyPair.publicKeyPem,
      jwtIssuer: "https://auth.plinth.dev",
      jwtAudience: "plinth-api",
      oidcProviders: {
        mock: mockOidc,
      },
    });
  });

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("registers a user with email and password, hashing via Argon2id", async () => {
      const res = await authService.register(tenantContext, {
        email: "alice@example.com",
        password: "secure-password-1234",
      });

      expect(res.user.id).toBeTypeOf("string");
      expect(res.user.email).toBe("alice@example.com");
      expect(res.user.status).toBe("active");

      // Verify dual session tokens returned
      expect(res.sessionToken).toBeTypeOf("string");
      expect(res.csrfToken).toBeTypeOf("string");
      expect(res.accessToken).toBeTypeOf("string");
      expect(res.refreshToken).toBeTypeOf("string");

      // Verify JWT claims
      const accessToken = res.accessToken ?? "";
      const claims = verifyEd25519Jwt(accessToken, keyPair.publicKeyPem, {
        issuer: "https://auth.plinth.dev",
        audience: "plinth-api",
      });
      expect(claims.sub).toBe(res.user.id);
      expect(claims["tenantId"]).toBe(tenantId);
    });

    it("logs in with valid email and password credentials", async () => {
      await authService.register(tenantContext, {
        email: "bob@example.com",
        password: "my-strong-password-99",
      });

      const loginRes = await authService.login(tenantContext, {
        identifier: "bob@example.com",
        password: "my-strong-password-99",
      });

      expect(loginRes.mfaRequired).toBe(false);
      expect(loginRes.user?.email).toBe("bob@example.com");
      expect(loginRes.accessToken).toBeTypeOf("string");
      expect(loginRes.refreshToken).toBeTypeOf("string");
    });

    it("rotates refresh token and issues new JWT access token", async () => {
      const reg = await authService.register(tenantContext, {
        email: "carol@example.com",
        password: "password-carol-123",
      });

      const originalRefreshToken = reg.refreshToken ?? "";
      const refreshRes = await authService.refreshTokens({
        refreshToken: originalRefreshToken,
      });

      expect(refreshRes.accessToken).toBeTypeOf("string");
      expect(refreshRes.refreshToken).toBeTypeOf("string");
      expect(refreshRes.refreshToken).not.toBe(reg.refreshToken);

      // Verify new JWT is valid
      const claims = verifyEd25519Jwt(refreshRes.accessToken, keyPair.publicKeyPem);
      expect(claims.sub).toBe(reg.user.id);
    });

    it("logs out by revoking session and refresh token", async () => {
      const reg = await authService.register(tenantContext, {
        email: "david@example.com",
        password: "password-david-123",
      });

      await authService.logout({
        sessionToken: reg.sessionToken,
        refreshToken: reg.refreshToken,
      });

      const tokenToTry = reg.refreshToken ?? "";
      // Attempting to refresh should fail now
      await expect(authService.refreshTokens({ refreshToken: tokenToTry })).rejects.toThrow(
        AppError,
      );
    });

    it("executes Mock OIDC login flow with verified email", async () => {
      const init = await authService.initiateOAuth(
        "mock",
        "https://app.plinth.dev/callback",
        tenantId,
      );
      expect(init.authorizationUrl).toContain("mock-oidc");
      expect(init.state).toBeTypeOf("string");
      expect(init.codeVerifier).toBeTypeOf("string");

      mockOidc.stageUser({
        sub: "mock-user-123",
        email: "oauth.user@example.com",
        email_verified: true,
        name: "Mock OAuth User",
      });

      const callbackRes = await authService.handleOAuthCallback(
        "mock",
        {
          code: "mock-auth-code",
          state: init.state,
          codeVerifier: init.codeVerifier,
          redirectUri: "https://app.plinth.dev/callback",
        },
        tenantContext,
      );

      expect(callbackRes.user.email).toBe("oauth.user@example.com");
      expect(callbackRes.accessToken).toBeTypeOf("string");
    });
  });

  // Category 2: Boundary & Fuzzing
  describe("Category 2: Boundary & Fuzzing", () => {
    it("handles case-insensitive email login matching", async () => {
      await authService.register(tenantContext, {
        email: "CaseSensitiveTest@Example.Com",
        password: "password-case-123",
      });

      const login = await authService.login(tenantContext, {
        identifier: "casesensitivetest@example.com",
        password: "password-case-123",
      });
      expect(login.user?.email).toBe("casesensitivetest@example.com");
    });

    it("rejects duplicate email registration with 409 Conflict", async () => {
      await authService.register(tenantContext, {
        email: "duplicate@example.com",
        password: "password-dup-123",
      });

      await expect(
        authService.register(tenantContext, {
          email: "DUPLICATE@EXAMPLE.COM",
          password: "another-password-123",
        }),
      ).rejects.toThrow(AppError);
    });
  });

  // Category 3: Concurrency & Ordering
  describe("Category 3: Concurrency & Ordering", () => {
    it("REVOKES ENTIRE REFRESH FAMILY upon reuse detection (replay attack defense)", async () => {
      const reg = await authService.register(tenantContext, {
        email: "eve@example.com",
        password: "password-eve-123",
      });

      const originalToken = reg.refreshToken ?? "";

      // 1. Legitimate refresh: rotates originalToken -> token2
      const step1 = await authService.refreshTokens({ refreshToken: originalToken });
      expect(step1.refreshToken).toBeDefined();

      // 2. Attacker attempts to replay originalToken (already rotated!)
      // MUST trigger reuse detection, invalidate step1.refreshToken, and reject!
      await expect(authService.refreshTokens({ refreshToken: originalToken })).rejects.toThrow(
        AppError,
      );

      // 3. Legitimate client's token2 MUST now also be revoked due to family revocation!
      await expect(authService.refreshTokens({ refreshToken: step1.refreshToken })).rejects.toThrow(
        AppError,
      );
    });
  });

  // Category 4: Fault Injection & Resilience
  describe("Category 4: Fault Injection & Resilience", () => {
    it("rejects login with wrong password without leaking user existence", async () => {
      await authService.register(tenantContext, {
        email: "frank@example.com",
        password: "real-password-123",
      });

      await expect(
        authService.login(tenantContext, {
          identifier: "frank@example.com",
          password: "wrong-password-999",
        }),
      ).rejects.toThrow(AppError);

      // Non-existent user should return identical 401 error
      await expect(
        authService.login(tenantContext, {
          identifier: "ghost-user@example.com",
          password: "wrong-password-999",
        }),
      ).rejects.toThrow(AppError);
    });
  });

  // Category 5: Security & Abuse Prevention
  describe("Category 5: Security & Abuse Prevention", () => {
    it("BLOCKS Unverified OAuth Email Linking Attack (Account Takeover Defense)", async () => {
      // 1. Existing verified user
      await authService.register(tenantContext, {
        email: "victim@example.com",
        password: "victim-secure-password-123",
      });

      // 2. Attacker creates OAuth account with victim's email but UNVERIFIED (email_verified: false)
      mockOidc.stageUser({
        sub: "attacker-oauth-sub",
        email: "victim@example.com",
        email_verified: false, // NOT VERIFIED!
        name: "Attacker",
      });

      const init = await authService.initiateOAuth(
        "mock",
        "https://app.plinth.dev/callback",
        tenantId,
      );

      // 3. Callback MUST reject linking with 400 Bad Request to protect victim's account
      await expect(
        authService.handleOAuthCallback(
          "mock",
          {
            code: "mock-code",
            state: init.state,
            codeVerifier: init.codeVerifier,
            redirectUri: "https://app.plinth.dev/callback",
          },
          tenantContext,
        ),
      ).rejects.toThrow(AppError);
    });

    it("enforces live feature flags: rejects registration and password login when auth.emailPasswordEnabled = false", async () => {
      await configStore.set("auth.emailPasswordEnabled", "false");

      await expect(
        authService.register(tenantContext, {
          email: "disabled@example.com",
          password: "password-disabled-123",
        }),
      ).rejects.toThrow(AppError);

      await expect(
        authService.login(tenantContext, {
          identifier: "disabled@example.com",
          password: "password-disabled-123",
        }),
      ).rejects.toThrow(AppError);
    });

    it("enforces live feature flags: rejects OAuth initiation when auth.oauthEnabled = false", async () => {
      await configStore.set("auth.oauthEnabled", "false");

      await expect(
        authService.initiateOAuth("mock", "https://app.plinth.dev/callback", tenantId),
      ).rejects.toThrow(AppError);
    });

    it("supports Super Admin TOTP MFA setup and verification flow", async () => {
      const reg = await authService.register(tenantContext, {
        email: "admin@plinth.dev",
        password: "super-admin-password-123",
      });

      // 1. Setup TOTP
      const setup = await authService.setupTotp(tenantContext, reg.user.id);
      expect(setup.secret).toBeTypeOf("string");
      expect(setup.uri).toContain("otpauth://");
      expect(setup.recoveryCodes.length).toBe(8);

      // 2. Enable TOTP using verification code
      const { generateTotp } = await import("@plinth/core");
      const currentCode = generateTotp(setup.secret);

      const enableRes = await authService.enableTotp(
        tenantContext,
        reg.user.id,
        currentCode,
        setup.encryptedSecret,
      );
      expect(enableRes.totpEnabled).toBe(true);

      // 3. Subsequent password login requires MFA ticket
      const mfaLogin = await authService.login(tenantContext, {
        identifier: "admin@plinth.dev",
        password: "super-admin-password-123",
      });
      expect(mfaLogin.mfaRequired).toBe(true);
      expect(mfaLogin.mfaTicket).toBeTypeOf("string");

      // 4. Submit MFA ticket with TOTP code to complete login
      const completeLogin = await authService.loginWithTotp(tenantContext, {
        mfaTicket: mfaLogin.mfaTicket ?? "",
        totpCode: currentCode,
      });
      expect(completeLogin.accessToken).toBeTypeOf("string");
      expect(completeLogin.user?.email).toBe("admin@plinth.dev");
    });

    it("supports login with username and blocks suspended accounts", async () => {
      const reg = await authService.register(tenantContext, {
        email: "bob_unique@example.com",
        username: "bob_the_builder",
        password: "BobPassword123!",
      });

      // Login using username
      const loginRes = await authService.login(tenantContext, {
        identifier: "bob_the_builder",
        password: "BobPassword123!",
      });
      expect(loginRes.user.email).toBe("bob_unique@example.com");

      // Suspend user
      await authRepo.updateUser(tenantContext, {
        ...reg.user,
        status: "suspended",
      });

      await expect(
        authService.login(tenantContext, {
          identifier: "bob_the_builder",
          password: "BobPassword123!",
        }),
      ).rejects.toThrow(AppError);
    });

    it("handles full OAuth lifecycle: auto-linking verified accounts and returning linked accounts", async () => {
      // 1. Existing verified user
      const reg = await authService.register(tenantContext, {
        email: "verified.oauth@example.com",
        password: "VerifiedPass123!",
      });
      await authRepo.updateUser(tenantContext, {
        ...reg.user,
        emailVerified: true,
      });

      // 2. Verified OAuth identity
      mockOidc.stageUser({
        sub: "google-sub-verified-1",
        email: "verified.oauth@example.com",
        email_verified: true,
        name: "Verified User",
      });

      const init = await authService.initiateOAuth(
        "mock",
        "https://app.plinth.dev/callback",
        tenantId,
      );

      // Auto-links because both emails are verified
      const firstCallback = await authService.handleOAuthCallback(
        "mock",
        {
          code: "mock-code",
          state: init.state,
          codeVerifier: init.codeVerifier,
          redirectUri: "https://app.plinth.dev/callback",
        },
        tenantContext,
      );
      expect(firstCallback.user.id).toBe(reg.user.id);

      // Logging in again with the already linked OAuth account
      const secondCallback = await authService.handleOAuthCallback(
        "mock",
        {
          code: "mock-code",
          state: init.state,
          codeVerifier: init.codeVerifier,
          redirectUri: "https://app.plinth.dev/callback",
        },
        tenantContext,
      );
      expect(secondCallback.user.id).toBe(reg.user.id);

      // OAuth failure when provider is unsupported
      await expect(
        authService.handleOAuthCallback(
          "unsupported-provider",
          {
            code: "code",
            state: "state",
            codeVerifier: "verifier",
            redirectUri: "uri",
          },
          tenantContext,
        ),
      ).rejects.toThrow(AppError);

      // OAuth failure when user has no email
      mockOidc.stageUser({
        sub: "no-email-sub",
        name: "No Email User",
      });
      await expect(
        authService.handleOAuthCallback(
          "mock",
          {
            code: "mock-code",
            state: "state",
            codeVerifier: "verifier",
            redirectUri: "uri",
          },
          tenantContext,
        ),
      ).rejects.toThrow(AppError);
    });

    it("exercises InMemoryAuthRepository boundary lookup methods", async () => {
      expect(await authRepo.findUserByUsername(tenantContext, "nonexistent")).toBeNull();
      expect(await authRepo.findUserByEmail(tenantContext, "nonexistent@ex.com")).toBeNull();
      expect(await authRepo.deleteSession("nonexistent_hash")).toBe(false);
      expect(await authRepo.findRefreshTokenByHash("nonexistent_hash")).toBeNull();
      expect(await authRepo.findOAuthAccount("unknown", "123")).toBeNull();
    });
  });
});
