import type { DatabasePort } from "@plinth/core";
import type { ActorType, AuditLogEntry, AuditLogFilter } from "../domain/audit-entry.js";
import type { AuditLogRepositoryPort } from "../ports/repository.js";

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

export class DbAuditLogRepository implements AuditLogRepositoryPort {
  readonly #db: DatabasePort;

  constructor(db: DatabasePort) {
    this.#db = db;
  }

  async initializeSchema(): Promise<void> {
    await this.#db.query(
      `CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        actor_id TEXT,
        actor_type TEXT NOT NULL,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        payload_diff TEXT,
        ip_address TEXT,
        user_agent TEXT,
        trace_id TEXT,
        created_at TEXT NOT NULL
      );`,
    );
    await this.#db.query(
      "CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, created_at);",
    );
    await this.#db.query(
      "CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, created_at);",
    );
    await this.#db.query(
      "CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at);",
    );
  }

  async record(entry: AuditLogEntry): Promise<void> {
    await this.#db.query(
      `INSERT INTO audit_logs (
        id, tenant_id, actor_id, actor_type, action,
        resource_type, resource_id, payload_diff,
        ip_address, user_agent, trace_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        entry.id,
        entry.tenantId ?? null,
        entry.actorId ?? null,
        entry.actorType,
        entry.action,
        entry.resourceType,
        entry.resourceId ?? null,
        entry.payloadDiff ? JSON.stringify(entry.payloadDiff) : null,
        entry.ipAddress ?? null,
        entry.userAgent ?? null,
        entry.traceId ?? null,
        entry.createdAt,
      ],
    );
  }

  async query(filter: AuditLogFilter): Promise<readonly AuditLogEntry[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.tenantId !== undefined) {
      conditions.push("tenant_id = ?");
      params.push(filter.tenantId);
    }
    if (filter.actorId !== undefined) {
      conditions.push("actor_id = ?");
      params.push(filter.actorId);
    }
    if (filter.action !== undefined) {
      conditions.push("action = ?");
      params.push(filter.action);
    }
    if (filter.resourceType !== undefined) {
      conditions.push("resource_type = ?");
      params.push(filter.resourceType);
    }
    if (filter.resourceId !== undefined) {
      conditions.push("resource_id = ?");
      params.push(filter.resourceId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    params.push(limit);

    const rows = await this.#db.query<DbAuditRow>(
      `SELECT id, tenant_id, actor_id, actor_type, action, resource_type, resource_id, payload_diff, ip_address, user_agent, trace_id, created_at
       FROM audit_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ?;`,
      params,
    );

    return rows.map((row) => {
      let diff: Record<string, unknown> | undefined;
      if (row.payload_diff) {
        try {
          diff = JSON.parse(row.payload_diff) as Record<string, unknown>;
        } catch {
          diff = undefined;
        }
      }

      const entry: AuditLogEntry = {
        id: row.id,
        actorType: row.actor_type as ActorType,
        action: row.action,
        resourceType: row.resource_type,
        createdAt: row.created_at,
      };

      if (row.tenant_id !== null) {
        return {
          ...entry,
          tenantId: row.tenant_id,
          ...(row.actor_id !== null ? { actorId: row.actor_id } : {}),
          ...(row.resource_id !== null ? { resourceId: row.resource_id } : {}),
          ...(diff ? { payloadDiff: diff } : {}),
          ...(row.ip_address !== null ? { ipAddress: row.ip_address } : {}),
          ...(row.user_agent !== null ? { userAgent: row.user_agent } : {}),
          ...(row.trace_id !== null ? { traceId: row.trace_id } : {}),
        };
      }

      return {
        ...entry,
        ...(row.actor_id !== null ? { actorId: row.actor_id } : {}),
        ...(row.resource_id !== null ? { resourceId: row.resource_id } : {}),
        ...(diff ? { payloadDiff: diff } : {}),
        ...(row.ip_address !== null ? { ipAddress: row.ip_address } : {}),
        ...(row.user_agent !== null ? { userAgent: row.user_agent } : {}),
        ...(row.trace_id !== null ? { traceId: row.trace_id } : {}),
      };
    });
  }
}
