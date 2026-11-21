import { describe, expect, it } from "vitest";
import {
  generatePkce,
  generateSecureToken,
  hashToken,
  timingSafeEqualString,
  verifyPkce,
} from "@/crypto/tokens.js";
import { AppError } from "@/errors/app-error.js";

describe("Crypto: Secure Tokens, Hashing & PKCE (5-Category Matrix)", () => {
  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("generates a high-entropy base64url token of requested byte length", () => {
      const token = generateSecureToken(32);
      expect(token).toBeTypeOf("string");
      expect(token.length).toBeGreaterThanOrEqual(42);
      // Valid base64url characters only
      expect(/^[A-Za-z0-9_-]+$/.test(token)).toBe(true);
    });

    it("hashes a token using SHA-256 to a 64-character lowercase hex string", () => {
      const token = "my-secret-token-value";
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
      expect(/^[0-9a-f]{64}$/.test(hash1)).toBe(true);
    });

    it("generates valid RFC 7636 PKCE code verifier and S256 code challenge", () => {
      const pkce = generatePkce();

      expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(pkce.codeVerifier.length).toBeLessThanOrEqual(128);
      expect(pkce.codeChallenge).toBeTypeOf("string");

      const isValid = verifyPkce(pkce.codeVerifier, pkce.codeChallenge);
      expect(isValid).toBe(true);
    });
  });

  // Category 2: Boundary & Fuzzing
  describe("Category 2: Boundary & Fuzzing", () => {
    it("accepts minimum token byte length of 16", () => {
      const token = generateSecureToken(16);
      expect(token.length).toBeGreaterThanOrEqual(21);
    });

    it("rejects token byte length < 16 (insufficient entropy)", () => {
      expect(() => generateSecureToken(15)).toThrow(AppError);
      expect(() => generateSecureToken(0)).toThrow(AppError);
    });
  });

  // Category 3: Concurrency & Ordering
  describe("Category 3: Concurrency & Ordering", () => {
    it("generates 1,000 completely unique secure tokens without collisions", () => {
      const count = 1000;
      const set = new Set<string>();
      for (let i = 0; i < count; i++) {
        set.add(generateSecureToken(32));
      }
      expect(set.size).toBe(count);
    });
  });

  // Category 4: Fault Injection & Resilience
  describe("Category 4: Fault Injection & Resilience", () => {
    it("returns false when PKCE code verifier does not match challenge", () => {
      const pkce = generatePkce();
      const wrongVerifier = generateSecureToken(48);

      expect(verifyPkce(wrongVerifier, pkce.codeChallenge)).toBe(false);
    });

    it("returns false when PKCE inputs are malformed or empty", () => {
      const pkce = generatePkce();
      expect(verifyPkce("", pkce.codeChallenge)).toBe(false);
      expect(verifyPkce(pkce.codeVerifier, "")).toBe(false);
    });
  });

  // Category 5: Security & Abuse Prevention
  describe("Category 5: Security & Abuse Prevention", () => {
    it("performs timing-safe string comparison", () => {
      expect(timingSafeEqualString("secret-abc", "secret-abc")).toBe(true);
      expect(timingSafeEqualString("secret-abc", "secret-xyz")).toBe(false);
      expect(timingSafeEqualString("secret-abc", "secret-abcdef")).toBe(false);
      expect(timingSafeEqualString("", "secret-abc")).toBe(false);
      expect(timingSafeEqualString("", "")).toBe(true);
      expect(timingSafeEqualString(123 as unknown as string, "abc")).toBe(false);
      expect(hashToken("")).toBe("");
      expect(hashToken(123 as unknown as string)).toBe("");
    });
  });
});
