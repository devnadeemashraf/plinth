import { SqliteDatabaseAdapter } from "@plinth/adapter-db-sqlite";
import { DbOutboxRepository, DbQueueAdapter } from "@plinth/adapter-queue-db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("DbQueueAdapter & DbOutboxRepository - Outbox & DLQ Lifecycle", () => {
  let db: SqliteDatabaseAdapter;
  let repo: DbOutboxRepository;

  beforeAll(async () => {
    db = new SqliteDatabaseAdapter({ filename: ":memory:" });
    repo = new DbOutboxRepository(db);
    await repo.ensureTable();
  });

  afterAll(async () => {
    await db.close();
  });

  it("should create outbox events atomically and fetch pending with worker locks", async () => {
    const event = await repo.create({
      tenantId: "tenant-acme",
      eventType: "invoice.generate",
      payload: { invoiceId: "inv-99", amount: 4999 },
    });

    expect(event.id).toBeDefined();
    expect(event.status).toBe("pending");

    // Fetch pending
    const pending = await repo.fetchPending(10, "worker-alpha");
    expect(pending.length).toBeGreaterThanOrEqual(1);

    const locked = pending.find((e) => e.id === event.id);
    expect(locked).toBeDefined();
    expect(locked?.status).toBe("processing");
    expect(locked?.lockedBy).toBe("worker-alpha");

    // Mark complete
    await repo.markCompleted(event.id);
    const completed = await repo.getById(event.id);
    expect(completed?.status).toBe("completed");
  });

  it("should retry on failure with exponential backoff and route to dead letter queue after maxRetries", async () => {
    const queue = new DbQueueAdapter({
      db,
      repository: repo,
      pollIntervalMs: 20,
    });
    await queue.start();

    let attempts = 0;
    queue.registerHandler("faulty.task", async () => {
      attempts += 1;
      throw new Error("Simulated failure in handler");
    });

    const jobId = await queue.enqueue({
      tenantId: "tenant-fail",
      eventType: "faulty.task",
      payload: { target: "test" },
      maxRetries: 2,
      backoffSeconds: 0, // instantaneous retry for test
    });

    // Wait until job is processed and marked dead letter
    const start = Date.now();
    let current = await repo.getById(jobId);
    while (current?.status !== "dead_letter" && Date.now() - start < 3000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      current = await repo.getById(jobId);
    }

    expect(attempts).toBeGreaterThanOrEqual(2);
    expect(current?.status).toBe("dead_letter");
    expect(current?.errorReason).toContain("Simulated failure");

    // List dead letters
    const dlq = await repo.listDeadLetters();
    expect(dlq.some((e) => e.id === jobId)).toBe(true);

    const dlqTenant = await repo.listDeadLetters("tenant-fail");
    expect(dlqTenant.some((e) => e.id === jobId)).toBe(true);

    // Retry dead letter
    const retried = await repo.retryDeadLetter(jobId);
    expect(retried).toBe(true);

    const reloaded = await repo.getById(jobId);
    expect(reloaded?.status).toBe("pending");
    expect(reloaded?.retryCount).toBe(0);

    await queue.stop();
  });

  it("should create outbox events in batch", async () => {
    const batch = await repo.createBatch([
      { eventType: "batch.1", payload: { a: 1 } },
      { eventType: "batch.2", payload: { b: 2 } },
    ]);
    expect(batch).toHaveLength(2);
    expect(batch[0]?.eventType).toBe("batch.1");
    expect(batch[1]?.eventType).toBe("batch.2");
  });

  it("should route unhandled event type to dead letter queue", async () => {
    const queue = new DbQueueAdapter({
      db,
      repository: repo,
      pollIntervalMs: 20,
    });
    await queue.start();

    const jobId = await queue.enqueue({
      eventType: "unhandled.event.type",
      payload: { x: 10 },
    });

    const start = Date.now();
    let current = await repo.getById(jobId);
    while (current?.status !== "dead_letter" && Date.now() - start < 3000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      current = await repo.getById(jobId);
    }

    expect(current?.status).toBe("dead_letter");
    expect(current?.errorReason).toContain("No handler registered");

    await queue.stop();
  });

  it("should reclaim stale locks when worker crashes or times out", async () => {
    const event = await repo.create({
      eventType: "long.task",
      payload: { data: 123 },
    });

    // Fetch and lock with short lockDurationMs = 50ms
    const lockedBatch = await repo.fetchPending(10, "crashed-worker", 50);
    expect(lockedBatch.some((e) => e.id === event.id)).toBe(true);

    // Wait 60ms so lock expires
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Another worker fetches pending and reclaims the job
    const reclaimed = await repo.fetchPending(10, "healthy-worker", 50);
    const reclaimedEvent = reclaimed.find((e) => e.id === event.id);
    expect(reclaimedEvent).toBeDefined();
    expect(reclaimedEvent?.lockedBy).toBe("healthy-worker");

    await repo.markCompleted(event.id);
  });

  it("should return null for non-existent outbox event ID", async () => {
    const missing = await repo.getById("non-existent-id");
    expect(missing).toBeNull();
  });

  it("should handle corrupted json payload gracefully by falling back to empty object", async () => {
    await db.query(
      `
      INSERT INTO outbox_events (
        id, tenant_id, event_type, payload, status, retry_count,
        max_retries, backoff_seconds, scheduled_at, locked_at,
        locked_by, error_reason, created_at, updated_at
      ) VALUES ('corrupt-1', 'default', 'test', 'not-valid-json', 'pending', 0, 5, 1, '2026-01-01', NULL, NULL, NULL, '2026-01-01', '2026-01-01');
    `,
    );

    const loaded = await repo.getById("corrupt-1");
    expect(loaded?.payload).toEqual({});
  });

  it("should handle double start, report healthy, and drain batches immediately when batch is full", async () => {
    const warnSpy = vi.fn();
    const mockLogger = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: warnSpy,
      error: vi.fn(),
      fatal: vi.fn(),
      child: () => mockLogger,
    };
    const queue = new DbQueueAdapter({
      db,
      repository: repo,
      batchSize: 2,
      pollIntervalMs: 20,
      logger: mockLogger,
    });

    await queue.start();
    // Double start is safe no-op
    await queue.start();
    expect(await queue.isHealthy()).toBe(true);

    let processedCount = 0;
    queue.registerHandler("full.batch.task", async () => {
      processedCount += 1;
    });

    await queue.enqueue({ eventType: "full.batch.task", payload: { i: 1 } });
    await queue.enqueue({ eventType: "full.batch.task", payload: { i: 2 } });

    const start = Date.now();
    while (processedCount < 2 && Date.now() - start < 3000) {
      await new Promise((resolve) => setTimeout(resolve, 30));
    }

    expect(queue.getRepository()).toBe(repo);
    expect(processedCount).toBe(2);
    await queue.stop();
  });

  it("should catch and log errors thrown during polling loop", async () => {
    const warnSpy = vi.fn();
    const mockLogger = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: warnSpy,
      error: vi.fn(),
      fatal: vi.fn(),
      child: () => mockLogger,
    };
    const failingRepo = {
      ...repo,
      ensureTable: async () => {},
      fetchPending: async () => {
        throw new Error("DB lock collision");
      },
    } as unknown as DbOutboxRepository;

    const queue = new DbQueueAdapter({
      db,
      repository: failingRepo,
      pollIntervalMs: 20,
      logger: mockLogger,
    });

    await queue.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(warnSpy).toHaveBeenCalledWith(
      "Error polling pending outbox events",
      expect.objectContaining({ error: "DB lock collision" }),
    );
    await queue.stop();
  });

  it("should prevent duplicate claims when another worker claims a job", async () => {
    // Create a single pending outbox job
    const job = await repo.create({
      tenantId: "tenant-race",
      eventType: "race.task",
      payload: { test: true },
    });

    // Worker 1 claims the job
    const worker1Results = await repo.fetchPending(10, "worker-1");
    expect(worker1Results.some((e) => e.id === job.id)).toBe(true);

    // Worker 2 attempts to claim while worker 1's lock is active
    const worker2Results = await repo.fetchPending(10, "worker-2");
    expect(worker2Results.some((e) => e.id === job.id)).toBe(false);

    await repo.markCompleted(job.id);
  });

  it("should reject lock acquisition when another worker updated the status concurrently", async () => {
    const job = await repo.create({
      tenantId: "tenant-interleaved",
      eventType: "interleaved.task",
      payload: { test: true },
    });

    // Directly simulate another worker locking the job just before fetchPending updates it
    const nowIso = new Date().toISOString();
    await db.query(
      `
      UPDATE outbox_events
      SET status = 'processing', locked_at = ?, locked_by = 'worker-external', updated_at = ?
      WHERE id = ?;
    `,
      [nowIso, nowIso, job.id],
    );

    // fetchPending for worker-1 with a 60s lock duration must not claim this job
    const worker1Results = await repo.fetchPending(10, "worker-1", 60_000);
    expect(worker1Results.some((e) => e.id === job.id)).toBe(false);

    await repo.markCompleted(job.id);
  });
});
