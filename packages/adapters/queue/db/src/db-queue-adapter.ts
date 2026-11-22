import {
  calculateNextRetryTime,
  type DatabasePort,
  type EnqueueJobInput,
  generateUuidV7,
  type JobHandler,
  type LoggerPort,
  type OutboxEvent,
  type QueuePort,
} from "@plinth/core";
import { DbOutboxRepository } from "./db-outbox-repository.js";

export interface DbQueueAdapterOptions {
  readonly db: DatabasePort;
  readonly repository?: DbOutboxRepository | undefined;
  readonly pollIntervalMs?: number | undefined;
  readonly batchSize?: number | undefined;
  readonly workerId?: string | undefined;
  readonly lockDurationMs?: number | undefined;
  readonly logger?: LoggerPort | undefined;
}

export class DbQueueAdapter implements QueuePort {
  private readonly repository: DbOutboxRepository;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly workerId: string;
  private readonly lockDurationMs: number;
  private readonly logger?: LoggerPort | undefined;

  private readonly handlers = new Map<string, JobHandler>();
  private isRunning = false;
  private isPolling = false;
  private activeJobsCount = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: DbQueueAdapterOptions) {
    this.repository = options.repository ?? new DbOutboxRepository(options.db);
    this.pollIntervalMs = options.pollIntervalMs ?? 200;
    this.batchSize = options.batchSize ?? 10;
    this.workerId = options.workerId ?? `db-worker-${generateUuidV7()}`;
    this.lockDurationMs = options.lockDurationMs ?? 60_000;
    this.logger = options.logger;
  }

  public getRepository(): DbOutboxRepository {
    return this.repository;
  }

  public async enqueue<TPayload = Record<string, unknown>>(
    input: EnqueueJobInput<TPayload>,
  ): Promise<string> {
    const event = await this.repository.create(input);
    return event.id;
  }

  public registerHandler<TPayload = Record<string, unknown>>(
    eventType: string,
    handler: JobHandler<TPayload>,
  ): void {
    this.handlers.set(eventType, handler as unknown as JobHandler);
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    await this.repository.ensureTable();
    this.isRunning = true;
    this.scheduleNextPoll(0);
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Wait for in-flight jobs to drain (up to 5s)
    const startWait = Date.now();
    while (this.activeJobsCount > 0 && Date.now() - startWait < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  public async isHealthy(): Promise<boolean> {
    return true;
  }

  private scheduleNextPoll(delayMs: number): void {
    if (!this.isRunning) {
      return;
    }
    this.pollTimer = setTimeout(() => {
      void this.poll();
    }, delayMs);
  }

  private async poll(): Promise<void> {
    if (!this.isRunning || this.isPolling) {
      return;
    }

    this.isPolling = true;
    try {
      const events = await this.repository.fetchPending(
        this.batchSize,
        this.workerId,
        this.lockDurationMs,
      );

      if (events.length > 0) {
        await Promise.all(events.map((evt) => this.processEvent(evt)));
        // If we found a full batch, poll immediately again
        if (events.length >= this.batchSize) {
          this.scheduleNextPoll(0);
          return;
        }
      }
    } catch (err) {
      this.logger?.warn("Error polling pending outbox events", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.isPolling = false;
      this.scheduleNextPoll(this.pollIntervalMs);
    }
  }

  private async processEvent(event: OutboxEvent): Promise<void> {
    const handler = this.handlers.get(event.eventType);
    if (!handler) {
      // No handler registered: fail job or leave pending
      this.logger?.warn(`No handler registered for outbox event: ${event.eventType}`);
      await this.repository.markFailed(
        event.id,
        `No handler registered for event type: ${event.eventType}`,
        null,
        true, // route to dead letter
      );
      return;
    }

    this.activeJobsCount += 1;
    try {
      await handler(event);
      await this.repository.markCompleted(event.id);
    } catch (err) {
      const errorReason = err instanceof Error ? err.message : String(err);
      const nextRetryCount = event.retryCount + 1;
      const isDeadLetter = nextRetryCount >= event.maxRetries;

      const nextScheduledAt = isDeadLetter
        ? null
        : calculateNextRetryTime(event.backoffSeconds, nextRetryCount);

      await this.repository.markFailed(event.id, errorReason, nextScheduledAt, isDeadLetter);
    } finally {
      this.activeJobsCount -= 1;
    }
  }
}
