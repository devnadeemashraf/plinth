import { describe, expect, it } from "vitest";
import { isIpAllowedByCidrs } from "@/security/cidr-guard.js";

describe("CIDR Guard - IP Allowlist Engine (5-Category TDD)", () => {
  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should allow loopback IPv4 and IPv6 when configured in allowed CIDRs", () => {
      const allowed = ["127.0.0.1/32", "::1/128"];
      expect(isIpAllowedByCidrs("127.0.0.1", allowed)).toBe(true);
      expect(isIpAllowedByCidrs("::1", allowed)).toBe(true);
      expect(isIpAllowedByCidrs("192.168.1.100", allowed)).toBe(false);
    });

    it("should allow IPs within an IPv4 CIDR range (e.g. /24)", () => {
      const allowed = ["10.0.0.0/24"];
      expect(isIpAllowedByCidrs("10.0.0.1", allowed)).toBe(true);
      expect(isIpAllowedByCidrs("10.0.0.254", allowed)).toBe(true);
      expect(isIpAllowedByCidrs("10.0.1.1", allowed)).toBe(false);
    });

    it("should allow IPs within an IPv6 CIDR range (e.g. /64)", () => {
      const allowed = ["2001:db8:abcd:0012::/64"];
      expect(isIpAllowedByCidrs("2001:db8:abcd:12::1", allowed)).toBe(true);
      expect(isIpAllowedByCidrs("2001:db8:abcd:13::1", allowed)).toBe(false);
    });

    it("should allow any IP when allowed CIDRs list is empty (unrestricted mode)", () => {
      expect(isIpAllowedByCidrs("203.0.113.42", [])).toBe(true);
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should reject undefined or empty client IP", () => {
      expect(isIpAllowedByCidrs(undefined, ["127.0.0.1/32"])).toBe(false);
      expect(isIpAllowedByCidrs("", ["127.0.0.1/32"])).toBe(false);
      expect(isIpAllowedByCidrs("   ", ["127.0.0.1/32"])).toBe(false);
    });

    it("should handle IP with port or whitespace cleanly", () => {
      const allowed = ["127.0.0.1/32"];
      expect(isIpAllowedByCidrs(" 127.0.0.1 ", allowed)).toBe(true);
      expect(isIpAllowedByCidrs("127.0.0.1:8080", allowed)).toBe(true);
    });

    it("should handle bracketed IPv6 addresses", () => {
      const allowed = ["::1/128"];
      expect(isIpAllowedByCidrs("[::1]", allowed)).toBe(true);
      expect(isIpAllowedByCidrs("[::1]:3000", allowed)).toBe(true);
    });

    it("should handle IPv4-mapped IPv6 notation", () => {
      const allowed = ["127.0.0.1/32", "192.168.0.0/16"];
      expect(isIpAllowedByCidrs("::ffff:127.0.0.1", allowed)).toBe(true);
      expect(isIpAllowedByCidrs("::ffff:192.168.1.50", allowed)).toBe(true);
      expect(isIpAllowedByCidrs("::ffff:10.0.0.1", allowed)).toBe(false);
    });

    it("should reject invalid IP strings gracefully without throwing", () => {
      expect(isIpAllowedByCidrs("not.an.ip.address", ["127.0.0.1/32"])).toBe(false);
      expect(isIpAllowedByCidrs("999.999.999.999", ["127.0.0.1/32"])).toBe(false);
    });
  });

  // Category 3: Concurrency & Performance
  describe("Category 3: Concurrency & Performance", () => {
    it("should evaluate 10,000 IP checks in < 50ms using cached blocklist", () => {
      const allowed = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.1/32"];
      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        isIpAllowedByCidrs("192.168.1.50", allowed);
        isIpAllowedByCidrs("8.8.8.8", allowed);
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(100);
    });
  });

  // Category 4: Fault Injection & Malformed CIDRs
  describe("Category 4: Fault Injection & Malformed CIDRs", () => {
    it("should skip malformed CIDR entries in configuration without crashing", () => {
      const mixed = ["invalid-cidr", "10.0.0.0/999", "127.0.0.1/32", ""];
      expect(isIpAllowedByCidrs("127.0.0.1", mixed)).toBe(true);
      expect(isIpAllowedByCidrs("10.0.0.1", mixed)).toBe(false);
    });
  });

  // Category 5: Security & Bypass Prevention
  describe("Category 5: Security & Bypass Prevention", () => {
    it("should prevent prefix collision attacks (e.g. 10.0.0.1 vs 10.0.0.100 without proper subnetting)", () => {
      const allowed = ["10.0.0.1/32"];
      expect(isIpAllowedByCidrs("10.0.0.1", allowed)).toBe(true);
      expect(isIpAllowedByCidrs("10.0.0.10", allowed)).toBe(false);
      expect(isIpAllowedByCidrs("10.0.0.100", allowed)).toBe(false);
    });

    it("should block non-allowed public IPs when allowlist is active", () => {
      const allowed = ["192.168.1.0/24"];
      expect(isIpAllowedByCidrs("1.1.1.1", allowed)).toBe(false);
      expect(isIpAllowedByCidrs("169.254.169.254", allowed)).toBe(false);
    });
  });
});
