import { describe, expect, it } from "vitest";
import type { HttpRequest } from "@/ports/http.js";
import { resolveTenantFromRequest, type TenantResolverOptions } from "@/tenancy/resolver.js";

function createMockRequest(overrides?: Partial<HttpRequest>): HttpRequest {
  return {
    method: "GET",
    url: "/api/v1/resource",
    path: "/api/v1/resource",
    headers: {},
    params: {},
    query: {},
    ip: "127.0.0.1",
    ...overrides,
  };
}

describe("tenancy / TenantResolver (5-category TDD)", () => {
  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("should resolve to default_tenant in single mode regardless of headers or host", () => {
      const req = createMockRequest({
        headers: { "x-tenant-id": "ignored_tenant", host: "tenant.example.com" },
      });
      const options: TenantResolverOptions = { mode: "single" };
      const resolved = resolveTenantFromRequest(req, options);

      expect(resolved).toEqual({
        id: "default_tenant",
        slug: "default",
      });
    });

    it("should resolve tenant from header in multi mode with header strategy", () => {
      const req = createMockRequest({
        headers: { "x-tenant-id": "tenant_acme" },
      });
      const options: TenantResolverOptions = {
        mode: "multi",
        strategy: "header",
      };
      const resolved = resolveTenantFromRequest(req, options);

      expect(resolved).toEqual({
        id: "tenant_acme",
        slug: "tenant_acme",
      });
    });

    it("should resolve tenant from subdomain in multi mode with subdomain strategy", () => {
      const req = createMockRequest({
        headers: { host: "acme.app.domain.com:3000" },
      });
      const options: TenantResolverOptions = {
        mode: "multi",
        strategy: "subdomain",
        rootDomain: "app.domain.com",
      };
      const resolved = resolveTenantFromRequest(req, options);

      expect(resolved).toEqual({
        slug: "acme",
      });
    });

    it("should resolve tenant from path prefix in multi mode with path strategy", () => {
      const req = createMockRequest({
        url: "/api/v1/t/acme-corp/projects",
        path: "/api/v1/t/acme-corp/projects",
      });
      const options: TenantResolverOptions = {
        mode: "multi",
        strategy: "path",
      };
      const resolved = resolveTenantFromRequest(req, options);

      expect(resolved).toEqual({
        slug: "acme-corp",
      });
    });
  });

  // Category 2: Boundary & Input Fuzzing
  describe("Category 2: Boundary & Input Fuzzing", () => {
    it("should ignore IP address hosts and localhost when resolving subdomains", () => {
      const options: TenantResolverOptions = {
        mode: "multi",
        strategy: "subdomain",
        rootDomain: "app.example.com",
      };

      expect(
        resolveTenantFromRequest(
          createMockRequest({ headers: { host: "127.0.0.1:3000" } }),
          options,
        ),
      ).toBeNull();

      expect(
        resolveTenantFromRequest(
          createMockRequest({ headers: { host: "localhost:3000" } }),
          options,
        ),
      ).toBeNull();
    });

    it("should return null when host equals rootDomain without any subdomain", () => {
      const req = createMockRequest({ headers: { host: "app.example.com" } });
      const options: TenantResolverOptions = {
        mode: "multi",
        strategy: "subdomain",
        rootDomain: "app.example.com",
      };

      expect(resolveTenantFromRequest(req, options)).toBeNull();
    });

    it("should normalize uppercase tenant IDs/slugs to lowercase", () => {
      const req = createMockRequest({
        headers: { "x-tenant-id": "ACME_CORP_123" },
      });
      const options: TenantResolverOptions = {
        mode: "multi",
        strategy: "header",
      };

      const resolved = resolveTenantFromRequest(req, options);
      expect(resolved?.id).toBe("acme_corp_123");
    });
  });

  // Category 3: Concurrency, Ordering & Idempotency
  describe("Category 3: Concurrency, Ordering & Idempotency", () => {
    it("should resolve deterministically across 50 parallel requests", () => {
      const options: TenantResolverOptions = {
        mode: "multi",
        strategy: "header",
      };

      const results = Array.from({ length: 50 }, (_, i) => {
        const req = createMockRequest({
          headers: { "x-tenant-id": `tenant_${i % 5}` },
        });
        return resolveTenantFromRequest(req, options);
      });

      expect(results).toHaveLength(50);
      expect(results[0]?.id).toBe("tenant_0");
      expect(results[5]?.id).toBe("tenant_0");
    });
  });

  // Category 4: Failure & Fault Injection
  describe("Category 4: Failure & Fault Injection", () => {
    it("should return null if header is missing in header strategy", () => {
      const req = createMockRequest({ headers: {} });
      const options: TenantResolverOptions = {
        mode: "multi",
        strategy: "header",
      };

      expect(resolveTenantFromRequest(req, options)).toBeNull();
    });

    it("should return null if path does not contain /t/:slug/ pattern in path strategy", () => {
      const req = createMockRequest({ path: "/api/v1/generic-endpoint" });
      const options: TenantResolverOptions = {
        mode: "multi",
        strategy: "path",
      };

      expect(resolveTenantFromRequest(req, options)).toBeNull();
    });
  });

  // Category 5: Security & Abuse Cases
  describe("Category 5: Security & Abuse Cases", () => {
    it("should reject path traversal sequences in tenant slugs", () => {
      const maliciousRequests = [
        createMockRequest({ headers: { "x-tenant-id": "../../etc/passwd" } }),
        createMockRequest({ headers: { "x-tenant-id": "..%2F..%2Fetc" } }),
        createMockRequest({ headers: { "x-tenant-id": "tenant/sub" } }),
        createMockRequest({ headers: { "x-tenant-id": "tenant\\slash" } }),
      ];

      const options: TenantResolverOptions = {
        mode: "multi",
        strategy: "header",
      };

      for (const req of maliciousRequests) {
        expect(resolveTenantFromRequest(req, options)).toBeNull();
      }
    });
  });
});
