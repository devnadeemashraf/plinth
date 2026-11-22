/**
 * Queue & Transactional Outbox Port Contracts
 *
 * Defines the Hexagonal Queue & Outbox abstractions allowing transactional
 * job intents to be enqueued atomically with business state and asynchronously
 * processed by local DB workers or distributed BullMQ workers with exponential backoff & DLQ.
 */

export type JobStatus = "pending" | "processing" | "completed" | "failed" | "dead_letter";

export interface OutboxEvent<TPayload = Record<string, unknown>> {
  readonly id: string;
  readonly tenantId: string;
  readonly eventType: string;
  readonly payload: TPayload;
  readonly status: JobStatus;
  readonly retryCount: number;
  readonly maxRetries: number;
  readonly backoffSeconds: number;
  readonly scheduledAt: Date;
  readonly lockedAt?: Date | null | undefined;
  readonly lockedBy?: string | null | undefined;
  readonly errorReason?: string | null | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateOutboxEventInput<TPayload = Record<string, unknown>> {
  readonly id?: string | undefined;
  readonly tenantId?: string | undefined;
  readonly eventType: string;
  readonly payload: TPayload;
  readonly delaySeconds?: number | undefined;
  readonly maxRetries?: number | undefined;
  readonly backoffSeconds?: number | undefined;
}

export interface EnqueueJobInput<TPayload = Record<string, unknown>>
  extends CreateOutboxEventInput<TPayload> {}

export type JobHandler<TPayload = Record<string, unknown>> = (
  event: OutboxEvent<TPayload>,
) => Promise<void>;

export interface QueuePort {
  /**
   * Enqueues a job for background execution.
   * Returns the generated or provided job ID.
   */
  enqueue<TPayload = Record<string, unknown>>(input: EnqueueJobInput<TPayload>): Promise<string>;

  /**
   * Registers a worker handler function for a specific event type.
   */
  registerHandler<TPayload = Record<string, unknown>>(
    eventType: string,
    handler: JobHandler<TPayload>,
  ): void;

  /**
   * Starts processing queued jobs.
   */
  start(): Promise<void>;

  /**
   * Gracefully shuts down the queue worker, waiting for in-flight jobs to drain.
   */
  stop(): Promise<void>;

  /**
   * Optional health check.
   */
  isHealthy?(): Promise<boolean>;
}

export interface OutboxRepositoryPort {
  /**
   * Persists an outbox event. May be passed an existing transaction context
   * to ensure atomic commit with business entity writes.
   */
  create<TPayload = Record<string, unknown>>(
    input: CreateOutboxEventInput<TPayload>,
    tx?: unknown,
  ): Promise<OutboxEvent<TPayload>>;

  /**
   * Persists a batch of outbox events atomically.
   */
  createBatch<TPayload = Record<string, unknown>>(
    inputs: readonly CreateOutboxEventInput<TPayload>[],
    tx?: unknown,
  ): Promise<readonly OutboxEvent<TPayload>[]>;

  /**
   * Atomically acquires and locks pending outbox events scheduled for processing.
   */
  fetchPending(
    limit: number,
    workerId: string,
    lockDurationMs?: number,
  ): Promise<readonly OutboxEvent[]>;

  /**
   * Marks a job as successfully completed.
   */
  markCompleted(id: string): Promise<void>;

  /**
   * Updates a job after failure, scheduling retry or routing to dead letter queue.
   */
  markFailed(
    id: string,
    errorReason: string,
    nextScheduledAt: Date | null,
    isDeadLetter: boolean,
  ): Promise<void>;

  /**
   * Retrieves an outbox event by ID.
   */
  getById(id: string): Promise<OutboxEvent | null>;

  /**
   * Retrieves dead-letter jobs for inspection or admin triage.
   */
  listDeadLetters(tenantId?: string, limit?: number): Promise<readonly OutboxEvent[]>;

  /**
   * Re-queues a dead-letter job for immediate execution.
   */
  retryDeadLetter(id: string): Promise<boolean>;
}

/**
 * Calculates exponential backoff date based on base backoff and retry count.
 * next = now + (baseSeconds * 2^(retryCount - 1))
 */
export function calculateNextRetryTime(
  baseBackoffSeconds: number,
  retryCount: number,
  fromTime: Date = new Date(),
): Date {
  const exponent = Math.max(0, retryCount - 1);
  const delaySeconds = baseBackoffSeconds * 2 ** exponent;
  return new Date(fromTime.getTime() + delaySeconds * 1000);
}
