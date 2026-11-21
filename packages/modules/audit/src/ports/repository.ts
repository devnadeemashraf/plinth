import type { AuditLogEntry, AuditLogFilter } from "../domain/audit-entry.js";

export interface AuditLogRepositoryPort {
  record(entry: AuditLogEntry): Promise<void>;
  query(filter: AuditLogFilter): Promise<readonly AuditLogEntry[]>;
}
