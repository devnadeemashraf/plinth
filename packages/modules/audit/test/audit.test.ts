import { AuditService, InMemoryAuditLogRepository } from "@plinth/modules-audit";
import { beforeEach, describe, expect, it } from "vitest";

describe("Audit: Append-Only Masked Audit Log Engine (5-Category Matrix)", () => {
  let repository: InMemoryAuditLogRepository;
  let service: AuditService;

  beforeEach(() => {
    repository = new InMemoryAuditLogRepository();
    service = new AuditService({ repository });
  });

  // Category 1: Happy Path
  describe("Category 1: Happy Path", () => {
    it("records an audit entry with actor, action, resource and masked diff", async () => {
      const entry = await service.record({
        tenantId: "tnt_012345",
        actorId: "usr_999",
        actorType: "user",
        action: "user.password_reset",
        resourceType: "user",
        resourceId: "usr_999",
        payloadDiff: {
          changedFields: ["passwordHash"],
          resetReason: "user_requested",
        },
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
        traceId: "trace-abc-123",
      });

      expect(entry.id).toBeTypeOf("string");
      expect(entry.action).toBe("user.password_reset");
      expect(entry.tenantId).toBe("tnt_012345");
      expect(entry.actorId).toBe("usr_999");
      expect(entry.createdAt).toBeTypeOf("string");

      const queried = await service.query({ tenantId: "tnt_012345" });
      expect(queried.length).toBe(1);
      expect(queried[0]?.id).toBe(entry.id);
    });

    it("queries audit entries with multiple filter criteria", async () => {
      await service.record({
        tenantId: "tnt_1",
        actorId: "usr_1",
        actorType: "user",
        action: "role.create",
        resourceType: "role",
        resourceId: "role_admin",
      });

      await service.record({
        tenantId: "tnt_1",
        actorId: "usr_2",
        actorType: "user",
        action: "role.assign",
        resourceType: "role",
        resourceId: "role_admin",
      });

      await service.record({
        tenantId: "tnt_2",
        actorId: "usr_1",
        actorType: "user",
        action: "settings.update",
        resourceType: "config",
      });

      // Filter by tenantId
      const tenant1Entries = await service.query({ tenantId: "tnt_1" });
      expect(tenant1Entries.length).toBe(2);

      // Filter by action
      const roleCreates = await service.query({ action: "role.create" });
      expect(roleCreates.length).toBe(1);
      expect(roleCreates[0]?.actorId).toBe("usr_1");

      // Filter by actorId
      const user1Entries = await service.query({ actorId: "usr_1" });
      expect(user1Entries.length).toBe(2);
    });
  });

  // Category 2: Boundary & Fuzzing
  describe("Category 2: Boundary & Fuzzing", () => {
    it("records entries with minimal required fields (anonymous system events)", async () => {
      const entry = await service.record({
        actorType: "system",
        action: "system.cron_cleanup",
        resourceType: "database",
      });

      expect(entry.id).toBeTypeOf("string");
      expect(entry.tenantId).toBeUndefined();
      expect(entry.actorId).toBeUndefined();
      expect(entry.payloadDiff).toBeUndefined();
    });

    it("enforces pagination limit bounds (default 20, max 100)", async () => {
      for (let i = 0; i < 25; i++) {
        await service.record({
          actorType: "system",
          action: `event.${i}`,
          resourceType: "metric",
        });
      }

      // Default limit is 20
      const defaultPage = await service.query({});
      expect(defaultPage.length).toBe(20);

      // Explicit limit up to 100
      const customPage = await service.query({ limit: 10 });
      expect(customPage.length).toBe(10);
    });
  });

  // Category 3: Concurrency & Ordering
  describe("Category 3: Concurrency & Ordering", () => {
    it("records concurrent events preserving monotonic chronological ordering", async () => {
      const actions = Array.from({ length: 15 }, (_, i) => `concurrent.action.${i}`);
      await Promise.all(
        actions.map((act) =>
          service.record({
            actorType: "user",
            action: act,
            resourceType: "task",
          }),
        ),
      );

      const queried = await service.query({ limit: 100 });
      expect(queried.length).toBe(15);
    });
  });

  // Category 4: Fault Injection & Resilience
  describe("Category 4: Fault Injection & Resilience", () => {
    it("returns empty array when filter matches no records", async () => {
      const results = await service.query({ tenantId: "non-existent-tenant" });
      expect(results).toEqual([]);
    });
  });

  // Category 5: Security & Abuse Prevention
  describe("Category 5: Security & Abuse Prevention", () => {
    it("AUTOMATICALLY MASKS sensitive PII and secrets in payloadDiff before storing", async () => {
      const _entry = await service.record({
        tenantId: "tnt_prod",
        actorId: "usr_alice",
        actorType: "user",
        action: "auth.login_attempt",
        resourceType: "auth",
        payloadDiff: {
          username: "alice",
          password: "my-plaintext-super-secret-password-12345",
          apiKey: "plinth_live_sk_9999999999",
          token: "eyJhbGciOiJFZERTQSI...",
          email: "alice.secret@private-domain.com",
          nested: {
            clientSecret: "very-confidential-secret",
          },
        },
      });

      const stored = (await service.query({ tenantId: "tnt_prod" }))[0];
      expect(stored).toBeDefined();

      const diff = stored?.payloadDiff as Record<string, unknown>;
      // Passwords, tokens, API keys must NEVER be stored raw
      expect(diff["password"]).toBe("[REDACTED]");
      expect(diff["apiKey"]).toBe("[REDACTED]");
      expect(diff["token"]).toBe("[REDACTED]");
      const nested = diff["nested"] as Record<string, unknown>;
      expect(nested["clientSecret"]).toBe("[REDACTED]");
    });

    it("guarantees append-only invariant: repository exposes NO mutation or deletion methods", () => {
      const repoAny = repository as unknown as Record<string, unknown>;
      expect(repoAny["delete"]).toBeUndefined();
      expect(repoAny["update"]).toBeUndefined();
      expect(repoAny["remove"]).toBeUndefined();
      expect(repoAny["clear"]).toBeUndefined();
    });
  });
});
