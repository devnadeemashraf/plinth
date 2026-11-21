import { describe, expect, it } from "vitest";
import {
  base32Encode,
  generateRecoveryCodes,
  generateTotp,
  generateTotpSecret,
  verifyRecoveryCode,
  verifyTotp,
} from "@/crypto/totp.js";

describe("Crypto: RFC 6238 TOTP Multi-Factor Authentication (5-Category Matrix)", () => {
  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("generates a high-entropy Base32 secret and valid otpauth URI", () => {
      const { secret, uri } = generateTotpSecret("PlinthPlatform", "admin@example.com");

      expect(secret).toBeTypeOf("string");
      expect(secret.length).toBeGreaterThanOrEqual(16);
      expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);

      expect(uri.startsWith("otpauth://totp/PlinthPlatform:admin%40example.com?")).toBe(true);
      expect(uri).toContain(`secret=${secret}`);
      expect(uri).toContain("issuer=PlinthPlatform");
      expect(uri).toContain("algorithm=SHA1");
      expect(uri).toContain("digits=6");
      expect(uri).toContain("period=30");
    });

    it("generates and verifies a valid 6-digit TOTP code for the current timestamp", () => {
      const { secret } = generateTotpSecret("Plinth", "test@example.com");
      const timestamp = 1700000000000;

      const code = generateTotp(secret, timestamp);
      expect(code).toBeTypeOf("string");
      expect(code.length).toBe(6);
      expect(/^\d{6}$/.test(code)).toBe(true);

      const isValid = verifyTotp(code, secret, { timestampMs: timestamp });
      expect(isValid).toBe(true);
    });

    it("generates and verifies 8 recovery codes", () => {
      const { plaintextCodes, hashedCodes } = generateRecoveryCodes(8);

      expect(plaintextCodes.length).toBe(8);
      expect(hashedCodes.length).toBe(8);

      // Verify each plaintext code against the hashed list
      for (const plain of plaintextCodes) {
        expect(verifyRecoveryCode(plain, hashedCodes)).toBe(true);
      }
      expect(verifyRecoveryCode("invalid-recovery-code", hashedCodes)).toBe(false);
    });
  });

  // Category 2: Boundary & Fuzzing
  describe("Category 2: Boundary & Fuzzing", () => {
    it("handles time steps at exact boundary transitions", () => {
      const { secret } = generateTotpSecret("Plinth", "test@example.com");
      // Align to exact interval start: 30,000 ms
      const intervalStart = Math.floor(1700000000000 / 30000) * 30000;
      const t0 = intervalStart; // start of window
      const t1 = intervalStart + 29999; // 1ms before end of window
      const t2 = intervalStart + 30000; // start of next window

      const code0 = generateTotp(secret, t0);
      const code1 = generateTotp(secret, t1);
      const code2 = generateTotp(secret, t2);

      expect(code0).toBe(code1);
      expect(code0).not.toBe(code2);
    });

    it("accepts codes within allowed clock skew window (default +-1 step)", () => {
      const { secret } = generateTotpSecret("Plinth", "test@example.com");
      const now = 1700000000000;
      const prevStepTime = now - 30000;
      const nextStepTime = now + 30000;

      const prevCode = generateTotp(secret, prevStepTime);
      const nextCode = generateTotp(secret, nextStepTime);

      // Should be valid with window: 1
      expect(verifyTotp(prevCode, secret, { timestampMs: now, window: 1 })).toBe(true);
      expect(verifyTotp(nextCode, secret, { timestampMs: now, window: 1 })).toBe(true);
    });

    it("rejects codes outside the allowed clock skew window", () => {
      const { secret } = generateTotpSecret("Plinth", "test@example.com");
      const now = 1700000000000;
      const oldTime = now - 60000; // 2 steps back
      const futureTime = now + 60000; // 2 steps ahead

      const oldCode = generateTotp(secret, oldTime);
      const futureCode = generateTotp(secret, futureTime);

      expect(verifyTotp(oldCode, secret, { timestampMs: now, window: 1 })).toBe(false);
      expect(verifyTotp(futureCode, secret, { timestampMs: now, window: 1 })).toBe(false);
    });
  });

  // Category 3: Concurrency & Ordering
  describe("Category 3: Concurrency & Ordering", () => {
    it("generates distinct recovery codes within a single batch", () => {
      const { plaintextCodes } = generateRecoveryCodes(16);
      const set = new Set(plaintextCodes);
      expect(set.size).toBe(16);
    });
  });

  // Category 4: Fault Injection & Resilience
  describe("Category 4: Fault Injection & Resilience", () => {
    it("returns false for non-numeric or malformed code strings", () => {
      const { secret } = generateTotpSecret("Plinth", "test@example.com");
      expect(verifyTotp("12345", secret)).toBe(false); // 5 digits
      expect(verifyTotp("1234567", secret)).toBe(false); // 7 digits
      expect(verifyTotp("abcdef", secret)).toBe(false); // letters
      expect(verifyTotp("", secret)).toBe(false); // empty
    });

    it("returns false for invalid Base32 secret string", () => {
      expect(verifyTotp("123456", "invalid-not-base32-1890!@#$")).toBe(false);
    });
  });

  // Category 5: Security & Abuse Prevention
  describe("Category 5: Security & Abuse Prevention", () => {
    it("rejects invalid codes without throwing unhandled exceptions", () => {
      const { secret } = generateTotpSecret("Plinth", "test@example.com");
      const wrongCode = "000000";
      expect(verifyTotp(wrongCode, secret, { timestampMs: 1700000000000 })).toBe(false);
    });

    it("handles boundary encodings and invalid inputs safely", () => {
      expect(base32Encode(Buffer.from("abc"))).toBeTypeOf("string");
      expect(generateTotp("invalid-base32-secret-!")).toBe("");
      expect(verifyRecoveryCode("", [])).toBe(false);
      expect(verifyRecoveryCode(123 as unknown as string, [])).toBe(false);
    });
  });
});
