import { describe, expect, it } from "vitest";
import {
  hashPassword,
  normalizeEmail,
  normalizeUsername,
  validatePasswordStrength,
  verifyPassword,
} from "@/crypto/password.js";
import { AppError } from "@/errors/app-error.js";

describe("Crypto: Argon2id Password Hashing & Normalization (5-Category Matrix)", () => {
  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("hashes a password and produces a standard Argon2id PHC string", async () => {
      const password = "correct-horse-battery-staple";
      const hash = await hashPassword(password);

      expect(hash).toBeTypeOf("string");
      expect(hash.startsWith("$argon2id$")).toBe(true);
    });

    it("verifies a correct password against its hash", async () => {
      const password = "my-secure-password-2026!";
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(hash, password);
      expect(isValid).toBe(true);
    });

    it("rejects an incorrect password", async () => {
      const password = "my-secure-password-2026!";
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(hash, "wrong-password");
      expect(isValid).toBe(false);
    });
  });

  // Category 2: Boundary & Fuzzing
  describe("Category 2: Boundary & Fuzzing", () => {
    it("accepts password of exactly 8 characters (minimum bound)", () => {
      expect(() => validatePasswordStrength("12345678")).not.toThrow();
    });

    it("rejects password with 7 characters (under minimum bound)", () => {
      expect(() => validatePasswordStrength("1234567")).toThrow(AppError);
    });

    it("accepts password of exactly 128 characters (maximum bound)", () => {
      const maxPass = "A".repeat(128);
      expect(() => validatePasswordStrength(maxPass)).not.toThrow();
    });

    it("rejects password with 129 characters (DoS memory exhaustion defense)", () => {
      const tooLongPass = "A".repeat(129);
      expect(() => validatePasswordStrength(tooLongPass)).toThrow(AppError);
    });

    it("normalizes email addresses (lowercasing, trimming)", () => {
      expect(normalizeEmail("  Alice.Smith@Example.COM  ")).toBe("alice.smith@example.com");
      expect(normalizeEmail("USER@SUB.DOMAIN.ORG")).toBe("user@sub.domain.org");
    });

    it("normalizes usernames (lowercasing, trimming)", () => {
      expect(normalizeUsername("  CoolAdmin123  ")).toBe("cooladmin123");
    });
  });

  // Category 3: Concurrency & Ordering
  describe("Category 3: Concurrency & Ordering", () => {
    it("hashes concurrently and generates distinct salts for identical passwords", async () => {
      const password = "identical-password-1234";
      const [hash1, hash2] = await Promise.all([hashPassword(password), hashPassword(password)]);

      expect(hash1).not.toBe(hash2);
      expect(await verifyPassword(hash1, password)).toBe(true);
      expect(await verifyPassword(hash2, password)).toBe(true);
    });
  });

  // Category 4: Fault Injection & Resilience
  describe("Category 4: Fault Injection & Resilience", () => {
    it("returns false instead of crashing on malformed hash string", async () => {
      expect(await verifyPassword("not-a-valid-argon-hash", "password")).toBe(false);
      expect(await verifyPassword("", "password")).toBe(false);
      expect(await verifyPassword("$argon2id$v=19$corrupted", "password")).toBe(false);
    });
  });

  // Category 5: Security & Abuse Prevention
  describe("Category 5: Security & Abuse Prevention", () => {
    it("rejects hashing passwords that fail strength validation", async () => {
      await expect(hashPassword("short")).rejects.toThrow(AppError);
      await expect(hashPassword("A".repeat(130))).rejects.toThrow(AppError);
    });

    it("prevents case-insensitive email collision spoofing", () => {
      const email1 = normalizeEmail("Victim@Company.com");
      const email2 = normalizeEmail("victim@company.COM");
      expect(email1).toBe(email2);
      expect(normalizeEmail(123 as unknown as string)).toBe("");
      expect(normalizeUsername(123 as unknown as string)).toBe("");
    });
  });
});
