import type { AuditLogEntry, AuditLogFilter } from "../domain/audit-entry.js";
import type { AuditLogRepositoryPort } from "../ports/repository.js";

export class InMemoryAuditLogRepository implements AuditLogRepositoryPort {
  readonly #entries: AuditLogEntry[] = [];

  async record(entry: AuditLogEntry): Promise<void> {
    this.#entries.push(entry);
  }

  async query(filter: AuditLogFilter): Promise<readonly AuditLogEntry[]> {
    let result = [...this.#entries];

    if (filter.tenantId !== undefined) {
      result = result.filter((e) => e.tenantId === filter.tenantId);
    }
    if (filter.actorId !== undefined) {
      result = result.filter((e) => e.actorId === filter.actorId);
    }
    if (filter.action !== undefined) {
      result = result.filter((e) => e.action === filter.action);
    }
    if (filter.resourceType !== undefined) {
      result = result.filter((e) => e.resourceType === filter.resourceType);
    }
    if (filter.resourceId !== undefined) {
      result = result.filter((e) => e.resourceId === filter.resourceId);
    }

    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    return result.slice(0, limit);
  }
}
