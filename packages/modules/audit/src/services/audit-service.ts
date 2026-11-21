import { defaultRedactionEngine, generateUuidV7 } from "@plinth/core";
import type {
  AuditLogEntry,
  AuditLogFilter,
  CreateAuditEntryInput,
} from "../domain/audit-entry.js";
import type { AuditLogRepositoryPort } from "../ports/repository.js";

export interface AuditServiceOptions {
  readonly repository: AuditLogRepositoryPort;
}

export class AuditService {
  readonly #repository: AuditLogRepositoryPort;

  constructor(options: AuditServiceOptions) {
    this.#repository = options.repository;
  }

  /**
   * Records an immutable audit log entry.
   * Automatically redacts sensitive keys and patterns from payloadDiff using RedactionEngine.
   */
  async record(input: CreateAuditEntryInput): Promise<AuditLogEntry> {
    const id = generateUuidV7();
    const createdAt = new Date().toISOString();

    let maskedDiff: Record<string, unknown> | undefined;
    if (input.payloadDiff) {
      maskedDiff = defaultRedactionEngine.redact(input.payloadDiff) as Record<string, unknown>;
    }

    const entry: AuditLogEntry = {
      id,
      actorType: input.actorType,
      action: input.action,
      resourceType: input.resourceType,
      createdAt,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      ...(input.actorId ? { actorId: input.actorId } : {}),
      ...(input.resourceId ? { resourceId: input.resourceId } : {}),
      ...(maskedDiff ? { payloadDiff: maskedDiff } : {}),
      ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
      ...(input.userAgent ? { userAgent: input.userAgent } : {}),
      ...(input.traceId ? { traceId: input.traceId } : {}),
    };

    await this.#repository.record(entry);
    return entry;
  }

  async query(filter: AuditLogFilter): Promise<readonly AuditLogEntry[]> {
    return await this.#repository.query(filter);
  }
}
