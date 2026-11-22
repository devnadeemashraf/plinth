import { describe, expect, it } from "vitest";
import { normalizeEmailAddress, validateEmailSubject } from "@/ports/email.js";

describe("Email Helpers - Validation & Header Injection Defense", () => {
  describe("normalizeEmailAddress", () => {
    it("should normalize valid string email address", () => {
      const result = normalizeEmailAddress("  User@Example.COM  ");
      expect(result).toEqual({ email: "user@example.com" });
    });

    it("should normalize valid recipient object", () => {
      const result = normalizeEmailAddress({
        email: "alice@test.org",
        name: "Alice Smith",
      });
      expect(result).toEqual({ email: "alice@test.org", name: "Alice Smith" });
    });

    it("should normalize object recipient with no name", () => {
      expect(normalizeEmailAddress({ email: "user@example.com" })).toEqual({
        email: "user@example.com",
      });
    });

    it("should reject object recipient with CRLF in email", () => {
      expect(() =>
        normalizeEmailAddress({
          email: "user@example.com\r\nBcc: evil@attacker.com",
        }),
      ).toThrow("CRLF injection detected");
    });

    it("should reject object recipient with null-byte injection", () => {
      expect(() =>
        normalizeEmailAddress({
          email: "user@example.com\0@evil.com",
        }),
      ).toThrow("CRLF injection detected");
      expect(() =>
        normalizeEmailAddress({
          email: "user@example.com",
          name: "User\0Injection",
        }),
      ).toThrow("CRLF injection detected");
    });

    it("should reject object recipient with invalid email syntax", () => {
      expect(() =>
        normalizeEmailAddress({
          email: "invalid-syntax",
        }),
      ).toThrow("Invalid email address format");
    });

    it("should reject email with CRLF injection characters", () => {
      expect(() => normalizeEmailAddress("user@example.com\r\nBcc: evil@attacker.com")).toThrow(
        "CRLF injection detected",
      );
      expect(() => normalizeEmailAddress("user@example.com\nevil@attacker.com")).toThrow(
        "CRLF injection detected",
      );
    });

    it("should reject string email with null-byte injection", () => {
      expect(() => normalizeEmailAddress("admin@example.com\0evil")).toThrow(
        "CRLF injection detected",
      );
    });

    it("should reject recipient name with CRLF injection", () => {
      expect(() =>
        normalizeEmailAddress({
          email: "valid@example.com",
          name: "Attacker\r\nSubject: Injected",
        }),
      ).toThrow("CRLF injection detected");
    });

    it("should reject invalid email format", () => {
      expect(() => normalizeEmailAddress("not-an-email")).toThrow("Invalid email address format");
      expect(() => normalizeEmailAddress("missing-at.com")).toThrow("Invalid email address format");
      expect(() => normalizeEmailAddress("@missing-local.com")).toThrow(
        "Invalid email address format",
      );
    });
  });

  describe("validateEmailSubject", () => {
    it("should return valid subject string", () => {
      expect(validateEmailSubject("Welcome to Plinth!")).toBe("Welcome to Plinth!");
    });

    it("should reject subject with CRLF injection", () => {
      expect(() => validateEmailSubject("Welcome\r\nBcc: evil@test.com")).toThrow(
        "CRLF injection detected",
      );
      expect(() => validateEmailSubject("Welcome\nInjected")).toThrow("CRLF injection detected");
    });

    it("should reject subject with null-byte injection", () => {
      expect(() => validateEmailSubject("Welcome\0Injected")).toThrow("CRLF injection detected");
    });
  });
});
