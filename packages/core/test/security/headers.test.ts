import { describe, expect, it } from "vitest";
import { getSecurityHeaders } from "@/index.js";

describe("security / getSecurityHeaders (5-category TDD)", () => {
  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should return baseline hardened security headers in development", () => {
      const headers = getSecurityHeaders({ isProduction: false });

      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(headers["content-security-policy"]).toContain("default-src 'self'");
      expect(headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()");
      // HSTS should NOT be set in non-production
      expect(headers["strict-transport-security"]).toBeUndefined();
    });

    it("should include HSTS header with preload in production", () => {
      const headers = getSecurityHeaders({ isProduction: true });

      expect(headers["strict-transport-security"]).toBe(
        "max-age=31536000; includeSubDomains; preload",
      );
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should accept custom HSTS max-age seconds", () => {
      const headers = getSecurityHeaders({
        isProduction: true,
        hstsMaxAgeSeconds: 86400,
      });

      expect(headers["strict-transport-security"]).toBe(
        "max-age=86400; includeSubDomains; preload",
      );
    });

    it("should accept custom CSP directives", () => {
      const customCsp = "default-src 'none'; frame-ancestors 'none';";
      const headers = getSecurityHeaders({ customCsp });

      expect(headers["content-security-policy"]).toBe(customCsp);
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should return deterministic frozen object across calls", () => {
      const h1 = getSecurityHeaders({ isProduction: true });
      const h2 = getSecurityHeaders({ isProduction: true });

      expect(h1).toEqual(h2);
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should handle undefined options gracefully", () => {
      const headers = getSecurityHeaders();
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["strict-transport-security"]).toBeUndefined();
    });
  });

  // Category 5: Security & Abuse Cases
  describe("Category 5: Security & Abuse Cases", () => {
    it("should strictly forbid framing by default", () => {
      const headers = getSecurityHeaders();
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    });

    it("should disable dangerous browser APIs via Permissions-Policy", () => {
      const headers = getSecurityHeaders();
      expect(headers["permissions-policy"]).toContain("camera=()");
      expect(headers["permissions-policy"]).toContain("microphone=()");
      expect(headers["permissions-policy"]).toContain("geolocation=()");
    });
  });
});
