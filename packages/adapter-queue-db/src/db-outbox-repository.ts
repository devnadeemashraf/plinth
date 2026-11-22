import {
  type CreateOutboxEventInput,
  type DatabasePort,
  DEFAULT_TENANT_ID,
  generateUuidV7,
  type JobStatus,
  type OutboxEvent,
  type OutboxRepositoryPort,
} from "@plinth/core";

export interface DbOutboxRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly event_type: string;
  readonly payload: string;
  readonly status: string;
  readonly retry_count: number;
  readonly max_retries: number;
  readonly backoff_seconds: number;
  readonly scheduled_at: string;
  readonly locked_at: string | null;
  readonly locked_by: string | null;
  readonly error_reason: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export class DbOutboxRepository implements OutboxRepositoryPort {
  private readonly db: DatabasePort;

  constructor(db: DatabasePort) {
    this.db = db;
  }

  public async ensureTable(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS outbox_events (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        event_type VARCHAR(128) NOT NULL,
        payload TEXT NOT NULL,
        status VARCHAR(32) NOT NULL,
        retry_count INT NOT NULL DEFAULT 0,
        max_retries INT NOT NULL DEFAULT 5,
        backoff_seconds INT NOT NULL DEFAULT 1,
        scheduled_at VARCHAR(64) NOT NULL,
        locked_at VARCHAR(64),
        locked_by VARCHAR(128),
        error_reason TEXT,
        created_at VARCHAR(64) NOT NULL,
        updated_at VARCHAR(64) NOT NULL
      );
    `);
  }

  private mapRowToEvent<T = Record<string, unknown>>(row: DbOutboxRow): OutboxEvent<T> {
    let parsedPayload: T;
    try {
      parsedPayload = JSON.parse(row.payload) as T;
    } catch {
      parsedPayload = {} as T;
    }

    return {
      id: row.id,
      tenantId: row.tenant_id,
      eventType: row.event_type,
      payload: parsedPayload,
      status: row.status as JobStatus,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      backoffSeconds: row.backoff_seconds,
      scheduledAt: new Date(row.scheduled_at),
      lockedAt: row.locked_at ? new Date(row.locked_at) : null,
      lockedBy: row.locked_by,
      errorReason: row.error_reason,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  public async create<TPayload = Record<string, unknown>>(
    input: CreateOutboxEventInput<TPayload>,
    _tx?: unknown,
  ): Promise<OutboxEvent<TPayload>> {
    const id = input.id ?? generateUuidV7();
    const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
    const now = new Date();
    const scheduledAt =
      input.delaySeconds !== undefined && input.delaySeconds > 0
        ? new Date(now.getTime() + input.delaySeconds * 1000)
        : now;

    const maxRetries = input.maxRetries ?? 5;
    const backoffSeconds = input.backoffSeconds ?? 1;
    const serializedPayload = JSON.stringify(input.payload);
    const nowIso = now.toISOString();
    const scheduledIso = scheduledAt.toISOString();

    await this.db.query(
      `
      INSERT INTO outbox_events (
        id, tenant_id, event_type, payload, status, retry_count,
        max_retries, backoff_seconds, scheduled_at, locked_at,
        locked_by, error_reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?);
    `,
      [
        id,
        tenantId,
        input.eventType,
        serializedPayload,
        "pending",
        0,
        maxRetries,
        backoffSeconds,
        scheduledIso,
        nowIso,
        nowIso,
      ],
    );

    return {
      id,
      tenantId,
      eventType: input.eventType,
      payload: input.payload,
      status: "pending",
      retryCount: 0,
      maxRetries,
      backoffSeconds,
      scheduledAt,
      lockedAt: null,
      lockedBy: null,
      errorReason: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  public async createBatch<TPayload = Record<string, unknown>>(
    inputs: readonly CreateOutboxEventInput<TPayload>[],
    tx?: unknown,
  ): Promise<readonly OutboxEvent<TPayload>[]> {
    const results: OutboxEvent<TPayload>[] = [];
    for (const input of inputs) {
      const created = await this.create(input, tx);
      results.push(created);
    }
    return results;
  }

  public async fetchPending(
    limit: number,
    workerId: string,
    lockDurationMs = 60_000,
  ): Promise<readonly OutboxEvent[]> {
    const now = new Date();
    const nowIso = now.toISOString();
    const staleLockThresholdIso = new Date(now.getTime() - lockDurationMs).toISOString();

    return this.db.transaction(async (tx) => {
      // Find candidate jobs
      const rows = await tx.query<DbOutboxRow>(
        `
        SELECT * FROM outbox_events
        WHERE (status = 'pending' AND scheduled_at <= ?)
           OR (status = 'processing' AND locked_at <= ?)
        ORDER BY scheduled_at ASC
        LIMIT ?;
      `,
        [nowIso, staleLockThresholdIso, limit],
      );

      if (rows.length === 0) {
        return [];
      }

      // Lock selected jobs atomically
      const lockedEvents: OutboxEvent[] = [];
      for (const row of rows) {
        await tx.query(
          `
          UPDATE outbox_events
          SET status = 'processing', locked_at = ?, locked_by = ?, updated_at = ?
          WHERE id = ? AND (status = 'pending' OR (status = 'processing' AND locked_at <= ?));
        `,
          [nowIso, workerId, nowIso, row.id, staleLockThresholdIso],
        );

        // Verify that this worker secured the exclusive lock
        const claimed = await tx.query<DbOutboxRow>(
          `
          SELECT * FROM outbox_events WHERE id = ? AND locked_by = ? AND locked_at = ?;
        `,
          [row.id, workerId, nowIso],
        );

        if (claimed.length > 0 && claimed[0]) {
          lockedEvents.push(this.mapRowToEvent(claimed[0]));
        }
      }

      return lockedEvents;
    });
  }

  public async markCompleted(id: string): Promise<void> {
    const nowIso = new Date().toISOString();
    await this.db.query(
      `
      UPDATE outbox_events
      SET status = 'completed', locked_at = NULL, locked_by = NULL, updated_at = ?
      WHERE id = ?;
    `,
      [nowIso, id],
    );
  }

  public async markFailed(
    id: string,
    errorReason: string,
    nextScheduledAt: Date | null,
    isDeadLetter: boolean,
  ): Promise<void> {
    const nowIso = new Date().toISOString();
    if (isDeadLetter) {
      await this.db.query(
        `
        UPDATE outbox_events
        SET status = 'dead_letter',
            retry_count = retry_count + 1,
            error_reason = ?,
            locked_at = NULL,
            locked_by = NULL,
            updated_at = ?
        WHERE id = ?;
      `,
        [errorReason, nowIso, id],
      );
    } else {
      const scheduledIso = (nextScheduledAt ?? new Date()).toISOString();
      await this.db.query(
        `
        UPDATE outbox_events
        SET status = 'pending',
            retry_count = retry_count + 1,
            scheduled_at = ?,
            error_reason = ?,
            locked_at = NULL,
            locked_by = NULL,
            updated_at = ?
        WHERE id = ?;
      `,
        [scheduledIso, errorReason, nowIso, id],
      );
    }
  }

  public async getById(id: string): Promise<OutboxEvent | null> {
    const rows = await this.db.query<DbOutboxRow>(
      "SELECT * FROM outbox_events WHERE id = ? LIMIT 1;",
      [id],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return this.mapRowToEvent(row);
  }

  public async listDeadLetters(tenantId?: string, limit = 50): Promise<readonly OutboxEvent[]> {
    let rows: readonly DbOutboxRow[];
    if (tenantId) {
      rows = await this.db.query<DbOutboxRow>(
        `
        SELECT * FROM outbox_events
        WHERE status = 'dead_letter' AND tenant_id = ?
        ORDER BY updated_at DESC
        LIMIT ?;
      `,
        [tenantId, limit],
      );
    } else {
      rows = await this.db.query<DbOutboxRow>(
        `
        SELECT * FROM outbox_events
        WHERE status = 'dead_letter'
        ORDER BY updated_at DESC
        LIMIT ?;
      `,
        [limit],
      );
    }

    return rows.map((r) => this.mapRowToEvent(r));
  }

  public async retryDeadLetter(id: string): Promise<boolean> {
    const nowIso = new Date().toISOString();
    await this.db.query(
      `
      UPDATE outbox_events
      SET status = 'pending',
          scheduled_at = ?,
          retry_count = 0,
          error_reason = NULL,
          locked_at = NULL,
          locked_by = NULL,
          updated_at = ?
      WHERE id = ? AND status = 'dead_letter';
    `,
      [nowIso, nowIso, id],
    );

    const updated = await this.getById(id);
    return updated?.status === "pending";
  }
}
