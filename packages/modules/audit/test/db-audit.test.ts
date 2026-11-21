import type { DatabasePort } from "@plinth/core";
import type { AuditLogEntry } from "@plinth/modules-audit/domain/audit-entry.js";
import { DbAuditLogRepository } from "@plinth/modules-audit/infrastructure/db-audit-log-repository.js";
import { beforeEach, describe, expect, it } from "vitest";

interface DbAuditRow {
  id: string;
  tenant_id: string | null;
  actor_id: string | null;
  actor_type: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  payload_diff: string | null;
  ip_address: string | null;
  user_agent: string | null;
  trace_id: string | null;
  created_at: string;
}

class MockAuditDatabasePort implements DatabasePort {
  readonly entries: DbAuditRow[] = [];

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (sql.includes("CREATE TABLE") || sql.includes("CREATE INDEX")) {
      return [] as T[];
    }
    if (sql.includes("INSERT INTO audit_logs")) {
      const row: DbAuditRow = {
        id: params[0] as string,
        tenant_id: params[1] as string | null,
        actor_id: params[2] as string | null,
        actor_type: params[3] as string,
        action: params[4] as string,
        resource_type: params[5] as string,
        resource_id: params[6] as string | null,
        payload_diff: params[7] as string | null,
        ip_address: params[8] as string | null,
        user_agent: params[9] as string | null,
        trace_id: params[10] as string | null,
        created_at: params[11] as string,
      };
      this.entries.push(row);
      return [] as T[];
    }
    if (sql.includes("SELECT id, tenant_id, actor_id")) {
      let filtered = [...this.entries];
      if (sql.includes("tenant_id = ?")) {
        const tenantId = params[0] as string;
        filtered = filtered.filter((r) => r.tenant_id === tenantId);
      }
      return filtered as T[];
    }
    return [] as T[];
  }

  async transaction<T>(fn: (tx: DatabasePort) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}

  getUnderlyingClient(): unknown {
    return this;
  }
}

describe("DbAuditLogRepository SQL Adapter", () => {
  let db: MockAuditDatabasePort;
  let repo: DbAuditLogRepository;

  beforeEach(async () => {
    db = new MockAuditDatabasePort();
    repo = new DbAuditLogRepository(db);
    await repo.initializeSchema();
  });

  it("records and queries audit logs from SQL database", async () => {
    const entry: AuditLogEntry = {
      id: "018f-uuidv7-test",
      tenantId: "tnt_prod",
      actorId: "usr_lead",
      actorType: "user",
      action: "role.create",
      resourceType: "role",
      resourceId: "role_admin",
      payloadDiff: { name: "Admin" },
      ipAddress: "127.0.0.1",
      userAgent: "Vitest/1.0",
      traceId: "trace-xyz",
      createdAt: "2026-11-21T00:00:00.000Z",
    };

    await repo.record(entry);

    const records = await repo.query({ tenantId: "tnt_prod" });
    expect(records.length).toBe(1);
    expect(records[0]?.id).toBe("018f-uuidv7-test");
    expect(records[0]?.tenantId).toBe("tnt_prod");
    expect(records[0]?.actorId).toBe("usr_lead");
    expect(records[0]?.payloadDiff).toEqual({ name: "Admin" });
  });

  it("handles anonymous events without tenantId or actorId", async () => {
    await repo.record({
      id: "anon-uuidv7",
      actorType: "system",
      action: "system.healthcheck",
      resourceType: "system",
      createdAt: "2026-11-21T00:00:00.000Z",
    });

    const records = await repo.query({});
    expect(records.length).toBe(1);
    expect(records[0]?.actorType).toBe("system");
    expect(records[0]?.tenantId).toBeUndefined();
  });
});
