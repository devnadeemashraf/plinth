import type { EnqueueJobInput, JobHandler, LoggerPort, OutboxEvent, QueuePort } from "@plinth/core";
import { type ConnectionOptions, type Job, Queue, Worker } from "bullmq";

export interface BullMqQueueAdapterOptions {
  /**
   * Redis connection options or existing ioredis instance.
   */
  readonly connection: ConnectionOptions;

  /**
   * BullMQ queue name.
   * @default "plinth-jobs"
   */
  readonly queueName?: string | undefined;

  /**
   * Worker concurrency limit.
   * @default 5
   */
  readonly concurrency?: number | undefined;

  /**
   * Structured logger port.
   */
  readonly logger?: LoggerPort | undefined;
}

export class BullMqQueueAdapter implements QueuePort {
  private readonly queue: Queue;
  private worker: Worker | null = null;
  private readonly queueName: string;
  private readonly connection: ConnectionOptions;
  private readonly concurrency: number;
  private readonly logger?: LoggerPort | undefined;
  private readonly handlers = new Map<string, JobHandler>();
  private isStarted = false;

  constructor(options: BullMqQueueAdapterOptions) {
    this.queueName = options.queueName ?? "plinth-jobs";
    this.connection = options.connection;
    this.concurrency = options.concurrency ?? 5;
    this.logger = options.logger;

    this.queue = new Queue(this.queueName, {
      connection: this.connection,
    });
  }

  public getQueue(): Queue {
    return this.queue;
  }

  public getWorker(): Worker | null {
    return this.worker;
  }

  public async enqueue<TPayload = Record<string, unknown>>(
    input: EnqueueJobInput<TPayload>,
  ): Promise<string> {
    const attempts = input.maxRetries ?? 5;
    const backoffSeconds = input.backoffSeconds ?? 1;
    const delay =
      input.delaySeconds !== undefined && input.delaySeconds > 0
        ? input.delaySeconds * 1000
        : undefined;

    const job = await this.queue.add(input.eventType, input.payload, {
      ...(input.id !== undefined ? { jobId: input.id } : {}),
      attempts,
      backoff: {
        type: "exponential",
        delay: backoffSeconds * 1000,
      },
      ...(delay !== undefined ? { delay } : {}),
      removeOnComplete: true,
      removeOnFail: false, // Keep in failed state for dead-letter review
    });

    return job.id ?? String(job.timestamp);
  }

  public registerHandler<TPayload = Record<string, unknown>>(
    eventType: string,
    handler: JobHandler<TPayload>,
  ): void {
    this.handlers.set(eventType, handler as unknown as JobHandler);
  }

  public async processJob(job: Job): Promise<void> {
    const handler = this.handlers.get(job.name);
    if (!handler) {
      this.logger?.warn(`No BullMQ handler registered for job name: ${job.name}`);
      throw new Error(`No handler registered for event type: ${job.name}`);
    }

    const outboxEvent: OutboxEvent = {
      id: job.id ?? String(job.timestamp),
      tenantId: (job.data?.["tenantId"] as string) ?? "default",
      eventType: job.name,
      payload: job.data as Record<string, unknown>,
      status: "processing",
      retryCount: job.attemptsMade,
      maxRetries: job.opts.attempts ?? 5,
      backoffSeconds: 1,
      scheduledAt: new Date(job.timestamp),
      createdAt: new Date(job.timestamp),
      updatedAt: new Date(),
    };

    await handler(outboxEvent);
  }

  public async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }
    this.isStarted = true;

    this.worker = new Worker(
      this.queueName,
      async (job: Job) => {
        await this.processJob(job);
      },
      {
        connection: this.connection,
        concurrency: this.concurrency,
      },
    );

    this.worker.on("failed", (job, err) => {
      this.logger?.warn(`BullMQ job ${job?.id} failed`, {
        error: err.message,
        attemptsMade: job?.attemptsMade,
      });
    });
  }

  public async stop(): Promise<void> {
    this.isStarted = false;
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    await this.queue.close();
  }

  public async isHealthy(): Promise<boolean> {
    return true;
  }
}
