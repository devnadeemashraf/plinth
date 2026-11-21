export type ActorType = "user" | "system" | "api_key" | "anonymous";

export interface AuditLogEntry {
  readonly id: string; // UUIDv7
  readonly tenantId?: string | undefined;
  readonly actorId?: string | undefined;
  readonly actorType: ActorType;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId?: string | undefined;
  readonly payloadDiff?: Record<string, unknown> | undefined;
  readonly ipAddress?: string | undefined;
  readonly userAgent?: string | undefined;
  readonly traceId?: string | undefined;
  readonly createdAt: string; // ISO 8601 UTC
}

export interface CreateAuditEntryInput {
  readonly tenantId?: string | undefined;
  readonly actorId?: string | undefined;
  readonly actorType: ActorType;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId?: string | undefined;
  readonly payloadDiff?: Record<string, unknown> | undefined;
  readonly ipAddress?: string | undefined;
  readonly userAgent?: string | undefined;
  readonly traceId?: string | undefined;
}

export interface AuditLogFilter {
  readonly tenantId?: string | undefined;
  readonly actorId?: string | undefined;
  readonly action?: string | undefined;
  readonly resourceType?: string | undefined;
  readonly resourceId?: string | undefined;
  readonly limit?: number | undefined;
  readonly cursor?: string | undefined;
}
