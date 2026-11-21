import { describe, expect, it } from "vitest";
import { isIpBlocked, validateUrlForEgress } from "@/security/ssrf-guard.js";

describe("security / SSRF Egress Guard (5-category TDD)", () => {
  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should allow public internet domain addresses", async () => {
      // 1.1.1.1 or 8.8.8.8 are standard public DNS addresses
      const res = await validateUrlForEgress("https://1.1.1.1/dns-query");
      expect(res.safe).toBe(true);
      expect(res.resolvedIps).toContain("1.1.1.1");
    });

    it("should allow safe public domain with standard ports", async () => {
      const res = await validateUrlForEgress("https://example.com:443/test");
      expect(res.safe).toBe(true);
      expect(res.url.hostname).toBe("example.com");
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should reject non-HTTP protocols", async () => {
      const dangerousProtocols = [
        "file:///etc/passwd",
        "ftp://ftp.example.com/file",
        "gopher://127.0.0.1:70",
        "data:text/plain;base64,SGVsbG8=",
        "javascript:alert(1)",
        "blob:https://example.com/uuid",
      ];

      for (const uri of dangerousProtocols) {
        const res = await validateUrlForEgress(uri);
        expect(res.safe).toBe(false);
        expect(res.error).toMatch(/unsupported protocol/i);
      }
    });

    it("should reject empty, whitespace, or malformed URL strings", async () => {
      const malformed = ["", "   ", "http://", "not-a-url", "://missing-scheme"];

      for (const uri of malformed) {
        const res = await validateUrlForEgress(uri);
        expect(res.safe).toBe(false);
      }
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should evaluate IP blocklist deterministically and concurrently", () => {
      const ips = ["127.0.0.1", "10.0.0.1", "8.8.8.8", "169.254.169.254"];
      const runs = Array.from({ length: 20 }, () => ips.map((ip) => isIpBlocked(ip)));

      const firstRun = runs[0];
      for (const run of runs) {
        expect(run).toEqual(firstRun);
      }
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should return safe=false if hostname fails DNS resolution", async () => {
      const res = await validateUrlForEgress(
        "https://non-existent-domain-plinth-test-xyz-987.invalid",
      );
      expect(res.safe).toBe(false);
      expect(res.error).toMatch(/dns resolution failed/i);
    });
  });

  // Category 5: Security & Abuse Cases (Hostile SSRF Blocklist)
  describe("Category 5: Security & Abuse Cases", () => {
    it("should block IPv4 loopback addresses", () => {
      expect(isIpBlocked("127.0.0.1")).toBe(true);
      expect(isIpBlocked("127.0.1.1")).toBe(true);
      expect(isIpBlocked("127.255.255.255")).toBe(true);
      expect(isIpBlocked("0.0.0.0")).toBe(true);
    });

    it("should block IPv6 loopback addresses", () => {
      expect(isIpBlocked("::1")).toBe(true);
      expect(isIpBlocked("[::1]")).toBe(true);
      expect(isIpBlocked("0:0:0:0:0:0:0:1")).toBe(true);
    });

    it("should block Cloud Metadata endpoints (169.254.169.254)", () => {
      expect(isIpBlocked("169.254.169.254")).toBe(true);
      expect(isIpBlocked("169.254.0.1")).toBe(true);
    });

    it("should block RFC 1918 Private Networks (10/8, 172.16/12, 192.168/16)", () => {
      expect(isIpBlocked("10.0.0.1")).toBe(true);
      expect(isIpBlocked("10.255.255.255")).toBe(true);
      expect(isIpBlocked("172.16.0.1")).toBe(true);
      expect(isIpBlocked("172.31.255.255")).toBe(true);
      expect(isIpBlocked("192.168.0.1")).toBe(true);
      expect(isIpBlocked("192.168.255.255")).toBe(true);
    });

    it("should block Carrier-Grade NAT (100.64.0.0/10)", () => {
      expect(isIpBlocked("100.64.0.1")).toBe(true);
      expect(isIpBlocked("100.127.255.255")).toBe(true);
    });

    it("should block IPv6 Unique Local Addresses (fc00::/7)", () => {
      expect(isIpBlocked("fc00::1")).toBe(true);
      expect(isIpBlocked("fd00::1")).toBe(true);
      expect(isIpBlocked("fe80::1")).toBe(true); // Link-local
    });

    it("should block IPv4-Mapped IPv6 bypasses (::ffff:127.0.0.1)", () => {
      expect(isIpBlocked("::ffff:127.0.0.1")).toBe(true);
      expect(isIpBlocked("::ffff:10.0.0.1")).toBe(true);
      expect(isIpBlocked("::ffff:169.254.169.254")).toBe(true);
    });

    it("should block localhost hostname URL", async () => {
      const res = await validateUrlForEgress("http://localhost:8080/secret");
      expect(res.safe).toBe(false);
      expect(res.error).toMatch(/restricted|blocked/i);
    });

    it("should block cloud metadata URL", async () => {
      const res = await validateUrlForEgress("http://169.254.169.254/latest/meta-data/");
      expect(res.safe).toBe(false);
      expect(res.error).toMatch(/restricted|blocked/i);
    });

    it("should block bracketed IPv6 and IPv4-mapped loopback URLs directly without DNS fallback", async () => {
      const resIpv6 = await validateUrlForEgress("http://[::1]:8080/admin");
      expect(resIpv6.safe).toBe(false);
      expect(resIpv6.error).toMatch(/restricted ip address/i);

      const resMapped = await validateUrlForEgress("http://[::ffff:127.0.0.1]:8080/admin");
      expect(resMapped.safe).toBe(false);
      expect(resMapped.error).toMatch(/restricted ip address/i);
    });
  });
});
