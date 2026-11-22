import { BullMqQueueAdapter } from "@plinth/adapter-queue-bullmq";
import type { ConnectionOptions, Job } from "bullmq";
import RedisMock from "ioredis-mock";
import { describe, expect, it, vi } from "vitest";

describe("BullMqQueueAdapter - Configuration & Interface", () => {
  it("should initialize BullMQ Queue instance with connection options", () => {
    const mockConnection = new RedisMock();
    const adapter = new BullMqQueueAdapter({
      connection: mockConnection as unknown as ConnectionOptions,
      queueName: "test-init-queue",
      concurrency: 3,
    });

    expect(adapter.getQueue()).toBeDefined();
    expect(adapter.getWorker()).toBeNull();
  });

  it("should enqueue jobs with custom options and default options", async () => {
    const mockConnection = new RedisMock();
    const adapter = new BullMqQueueAdapter({
      connection: mockConnection as unknown as ConnectionOptions,
    });

    const addSpy = vi.fn().mockResolvedValue({
      id: "job-123",
      timestamp: Date.now(),
    });
    adapter.getQueue().add = addSpy;

    const id1 = await adapter.enqueue({
      eventType: "email.send",
      payload: { to: "user@example.com" },
    });
    expect(id1).toBe("job-123");
    expect(addSpy).toHaveBeenCalledWith(
      "email.send",
      { to: "user@example.com" },
      expect.objectContaining({
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: true,
      }),
    );

    const id2 = await adapter.enqueue({
      id: "custom-job-id",
      eventType: "data.backup",
      payload: { db: "main" },
      delaySeconds: 15,
      maxRetries: 2,
      backoffSeconds: 5,
    });
    expect(id2).toBe("job-123");
    expect(addSpy).toHaveBeenCalledWith(
      "data.backup",
      { db: "main" },
      expect.objectContaining({
        jobId: "custom-job-id",
        attempts: 2,
        delay: 15000,
        backoff: { type: "exponential", delay: 5000 },
      }),
    );
  });

  it("should register handlers and report healthy", async () => {
    const mockConnection = new RedisMock();
    const adapter = new BullMqQueueAdapter({
      connection: mockConnection as unknown as ConnectionOptions,
      queueName: "test-handlers-queue",
    });

    adapter.registerHandler("user.signup", async () => {});
    expect(await adapter.isHealthy()).toBe(true);

    await adapter.stop();
  });

  it("should process registered jobs and forward to event handlers", async () => {
    const mockConnection = new RedisMock();
    const adapter = new BullMqQueueAdapter({
      connection: mockConnection as unknown as ConnectionOptions,
    });

    let handledPayload: Record<string, unknown> | null = null;
    adapter.registerHandler("order.process", async (event) => {
      handledPayload = event.payload;
    });

    const fakeJob = {
      id: "job-101",
      name: "order.process",
      data: { orderId: "ord-99", tenantId: "tenant-1" },
      attemptsMade: 1,
      opts: { attempts: 3 },
      timestamp: Date.now(),
    } as unknown as Job;

    await adapter.processJob(fakeJob);
    expect(handledPayload).toEqual({ orderId: "ord-99", tenantId: "tenant-1" });
  });

  it("should throw error when processing job without registered handler", async () => {
    const mockConnection = new RedisMock();
    const adapter = new BullMqQueueAdapter({
      connection: mockConnection as unknown as ConnectionOptions,
    });

    const fakeJob = {
      id: "job-missing",
      name: "unknown.event",
      data: {},
      attemptsMade: 0,
      opts: {},
      timestamp: Date.now(),
    } as unknown as Job;

    await expect(adapter.processJob(fakeJob)).rejects.toThrow("No handler registered");
  });

  it("should handle start and stop lifecycle cleanly", async () => {
    const mockConnection = new RedisMock();
    const adapter = new BullMqQueueAdapter({
      connection: mockConnection as unknown as ConnectionOptions,
      queueName: "test-lifecycle-queue",
    });

    await adapter.start();
    // Second start should be no-op
    await adapter.start();
    expect(adapter.getWorker()).toBeDefined();

    await adapter.stop();
    expect(adapter.getWorker()).toBeNull();
  });

  it("should log failed worker events", async () => {
    const mockConnection = new RedisMock();
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
    const adapter = new BullMqQueueAdapter({
      connection: mockConnection as unknown as ConnectionOptions,
      logger: mockLogger,
    });

    await adapter.start();
    const worker = adapter.getWorker();
    expect(worker).toBeDefined();

    const listeners = worker?.listeners("failed") ?? [];
    listeners[0]?.(
      { id: "failed-job-id", attemptsMade: 3 } as unknown as Job,
      new Error("Simulated failure"),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("failed"),
      expect.objectContaining({ error: "Simulated failure", attemptsMade: 3 }),
    );

    await adapter.stop();
  });
});
