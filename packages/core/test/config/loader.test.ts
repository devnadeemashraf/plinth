import { describe, expect, it } from "vitest";
import { ConfigValidationError, loadConfig } from "@/config/loader.js";

describe("config / schema and loader (5-category TDD + Pre-Audit Remediations)", () => {
  // 32-byte cryptographically random hex key with >= 16 distinct bytes
  const validHexKey = "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0";
  const validBase64Key = Buffer.from(validHexKey, "hex").toString("base64");

  const validDevEnv: Record<string, string> = {
    NODE_ENV: "development",
    PORT: "3000",
    DATABASE_URL: "sqlite://./dev.db",
    MASTER_ENCRYPTION_KEY: validHexKey,
    CORS_ALLOWED_ORIGINS: "http://localhost:3000,http://127.0.0.1:3000",
    ADMIN_ALLOWED_CIDRS: "127.0.0.1/32,::1/128",
  };

  const validProdEnv: Record<string, string> = {
    NODE_ENV: "production",
    PORT: "8080",
    DATABASE_URL: "postgres://user:pass@localhost:5432/proddb",
    MASTER_ENCRYPTION_KEY: validBase64Key,
    CORS_ALLOWED_ORIGINS: "https://plinth.dev,https://admin.plinth.dev",
    ADMIN_ALLOWED_CIDRS: "10.0.0.0/8,172.16.0.0/12",
  };

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should load valid development config", () => {
      const config = loadConfig(validDevEnv);
      expect(config.NODE_ENV).toBe("development");
      expect(config.PORT).toBe(3000);
      expect(config.DATABASE_URL).toBe("sqlite://./dev.db");
      expect(config.CORS_ALLOWED_ORIGINS).toEqual([
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ]);
      expect(config.ADMIN_ALLOWED_CIDRS).toEqual(["127.0.0.1/32", "::1/128"]);
    });

    it("should load valid production config with base64 master key", () => {
      const config = loadConfig(validProdEnv);
      expect(config.NODE_ENV).toBe("production");
      expect(config.PORT).toBe(8080);
      expect(config.CORS_ALLOWED_ORIGINS).toEqual([
        "https://plinth.dev",
        "https://admin.plinth.dev",
      ]);
      expect(config.ADMIN_ALLOWED_CIDRS).toEqual(["10.0.0.0/8", "172.16.0.0/12"]);
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should validate PORT boundaries (1..65535)", () => {
      expect(loadConfig({ ...validDevEnv, PORT: "1" }).PORT).toBe(1);
      expect(loadConfig({ ...validDevEnv, PORT: "65535" }).PORT).toBe(65535);

      expect(() => loadConfig({ ...validDevEnv, PORT: "0" })).toThrow(ConfigValidationError);
      expect(() => loadConfig({ ...validDevEnv, PORT: "65536" })).toThrow(ConfigValidationError);
      expect(() => loadConfig({ ...validDevEnv, PORT: "-1" })).toThrow(ConfigValidationError);
      expect(() => loadConfig({ ...validDevEnv, PORT: "3000.5" })).toThrow(ConfigValidationError);
      expect(() => loadConfig({ ...validDevEnv, PORT: "not-a-port" })).toThrow(
        ConfigValidationError,
      );
    });

    it("should accept valid single IPs and CIDRs for ADMIN_ALLOWED_CIDRS", () => {
      const config = loadConfig({
        ...validDevEnv,
        ADMIN_ALLOWED_CIDRS: "192.168.1.1, 10.0.0.0/24, 2001:db8::/32",
      });
      expect(config.ADMIN_ALLOWED_CIDRS).toEqual(["192.168.1.1", "10.0.0.0/24", "2001:db8::/32"]);
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should return deeply frozen idempotent config objects", () => {
      const config1 = loadConfig(validDevEnv);
      const config2 = loadConfig(validDevEnv);

      expect(config1).toEqual(config2);
      expect(Object.isFrozen(config1)).toBe(true);
      expect(Object.isFrozen(config1.CORS_ALLOWED_ORIGINS)).toBe(true);
      expect(Object.isFrozen(config1.ADMIN_ALLOWED_CIDRS)).toBe(true);
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should throw ConfigValidationError on missing required environment variables", () => {
      expect(() => loadConfig({})).toThrow(ConfigValidationError);
      expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(ConfigValidationError);
    });

    it("should prevent mutation of config properties at runtime", () => {
      const config = loadConfig(validDevEnv);
      expect(() => {
        // @ts-expect-error - testing runtime immutability
        config.PORT = 9000;
      }).toThrow();
    });
  });

  // Category 5: Security & Abuse Cases (Pre-Audited Invariants)
  describe("Category 5: Security & Abuse Cases (Pre-Audited Invariants)", () => {
    describe("[P1] Key Entropy Enforcement (MASTER_ENCRYPTION_KEY)", () => {
      it("should reject low-entropy keys with < 16 distinct bytes", () => {
        // 64-char hex string made of repeated bytes '01' (only 1 distinct byte)
        const lowEntropyHex = "01".repeat(32);
        expect(() => loadConfig({ ...validDevEnv, MASTER_ENCRYPTION_KEY: lowEntropyHex })).toThrow(
          ConfigValidationError,
        );

        // Repeated 8-byte pattern (only 8 distinct bytes)
        const eightByteRepeat = "0102030405060708".repeat(4);
        expect(() =>
          loadConfig({ ...validDevEnv, MASTER_ENCRYPTION_KEY: eightByteRepeat }),
        ).toThrow(ConfigValidationError);

        // All zeroes
        const allZeroes = "00".repeat(32);
        expect(() => loadConfig({ ...validDevEnv, MASTER_ENCRYPTION_KEY: allZeroes })).toThrow(
          ConfigValidationError,
        );
      });

      it("should reject known placeholder patterns in MASTER_ENCRYPTION_KEY", () => {
        const placeholders = [
          "changeme-changeme-changeme-changeme",
          "default-secret-key-32-bytes-long!",
          "password-password-password-passw",
          "test-key-test-key-test-key-test-",
          "replace-me-replace-me-replace-me",
        ];

        for (const placeholder of placeholders) {
          expect(() => loadConfig({ ...validDevEnv, MASTER_ENCRYPTION_KEY: placeholder })).toThrow(
            ConfigValidationError,
          );
        }
      });

      it("should reject keys with leading or trailing whitespace", () => {
        expect(() =>
          loadConfig({
            ...validDevEnv,
            MASTER_ENCRYPTION_KEY: ` ${validHexKey}`,
          }),
        ).toThrow(ConfigValidationError);

        expect(() =>
          loadConfig({
            ...validDevEnv,
            MASTER_ENCRYPTION_KEY: `${validHexKey}\n`,
          }),
        ).toThrow(ConfigValidationError);
      });

      it("should reject keys with invalid decoded byte length (!= 32 bytes)", () => {
        // 31 bytes hex (62 chars)
        const shortHex = "a1".repeat(31);
        expect(() => loadConfig({ ...validDevEnv, MASTER_ENCRYPTION_KEY: shortHex })).toThrow(
          ConfigValidationError,
        );

        // 33 bytes hex (66 chars)
        const longHex = "a1".repeat(33);
        expect(() => loadConfig({ ...validDevEnv, MASTER_ENCRYPTION_KEY: longHex })).toThrow(
          ConfigValidationError,
        );
      });

      it("should reject keys with corrupt or invalid base64 encoding", () => {
        const corruptBase64 = `${validBase64Key.slice(0, 40)}!@#$`;
        expect(() => loadConfig({ ...validDevEnv, MASTER_ENCRYPTION_KEY: corruptBase64 })).toThrow(
          ConfigValidationError,
        );
      });
    });

    describe("[P1] Redaction of Secrets in ConfigValidationError", () => {
      it("should NEVER leak raw MASTER_ENCRYPTION_KEY or DATABASE_URL in error output", () => {
        const rawSecretLeakAttempt = "super-secret-password-attempt-not-for-logs";
        try {
          loadConfig({
            ...validDevEnv,
            MASTER_ENCRYPTION_KEY: rawSecretLeakAttempt,
            DATABASE_URL: "postgres://admin:topsecretpassword123@db.prod:5432/main",
          });
          expect.fail("Should have thrown ConfigValidationError");
        } catch (err) {
          expect(err).toBeInstanceOf(ConfigValidationError);
          const validationError = err as ConfigValidationError;
          const serialized = JSON.stringify(validationError);
          const message = validationError.message;

          expect(message).not.toContain(rawSecretLeakAttempt);
          expect(message).not.toContain("topsecretpassword123");
          expect(serialized).not.toContain(rawSecretLeakAttempt);
          expect(serialized).not.toContain("topsecretpassword123");
        }
      });
    });

    describe("[P1] Strict CORS Origin Validation", () => {
      it("should reject wildcard '*' in production", () => {
        expect(() => loadConfig({ ...validProdEnv, CORS_ALLOWED_ORIGINS: "*" })).toThrow(
          ConfigValidationError,
        );
      });

      it("should reject origins with trailing slash, path, query, or fragment", () => {
        expect(() =>
          loadConfig({
            ...validDevEnv,
            CORS_ALLOWED_ORIGINS: "http://localhost:3000/",
          }),
        ).toThrow(ConfigValidationError);

        expect(() =>
          loadConfig({
            ...validDevEnv,
            CORS_ALLOWED_ORIGINS: "http://localhost:3000/api",
          }),
        ).toThrow(ConfigValidationError);

        expect(() =>
          loadConfig({
            ...validDevEnv,
            CORS_ALLOWED_ORIGINS: "http://localhost:3000?foo=bar",
          }),
        ).toThrow(ConfigValidationError);

        expect(() =>
          loadConfig({
            ...validDevEnv,
            CORS_ALLOWED_ORIGINS: "http://localhost:3000#section",
          }),
        ).toThrow(ConfigValidationError);
      });

      it("should reject non-http/https schemes and require https in production", () => {
        expect(() =>
          loadConfig({
            ...validDevEnv,
            CORS_ALLOWED_ORIGINS: "javascript:alert(1)",
          }),
        ).toThrow(ConfigValidationError);

        expect(() =>
          loadConfig({
            ...validDevEnv,
            CORS_ALLOWED_ORIGINS: "ftp://example.com",
          }),
        ).toThrow(ConfigValidationError);

        // Production requires https
        expect(() =>
          loadConfig({
            ...validProdEnv,
            CORS_ALLOWED_ORIGINS: "http://insecure-domain.com",
          }),
        ).toThrow(ConfigValidationError);
      });
    });

    describe("[P2] Startup CIDR Validation (ADMIN_ALLOWED_CIDRS)", () => {
      it("should reject invalid CIDR prefixes and malformed IPs", () => {
        // Negative prefix
        expect(() =>
          loadConfig({
            ...validDevEnv,
            ADMIN_ALLOWED_CIDRS: "10.0.0.0/-1",
          }),
        ).toThrow(ConfigValidationError);

        // IPv4 prefix > 32
        expect(() =>
          loadConfig({
            ...validDevEnv,
            ADMIN_ALLOWED_CIDRS: "10.0.0.0/33",
          }),
        ).toThrow(ConfigValidationError);

        // IPv6 prefix > 128
        expect(() =>
          loadConfig({
            ...validDevEnv,
            ADMIN_ALLOWED_CIDRS: "::1/129",
          }),
        ).toThrow(ConfigValidationError);

        // Invalid IP address octets
        expect(() =>
          loadConfig({
            ...validDevEnv,
            ADMIN_ALLOWED_CIDRS: "256.0.0.1/24",
          }),
        ).toThrow(ConfigValidationError);

        expect(() =>
          loadConfig({
            ...validDevEnv,
            ADMIN_ALLOWED_CIDRS: "not-an-ip",
          }),
        ).toThrow(ConfigValidationError);
      });
    });
  });
});
