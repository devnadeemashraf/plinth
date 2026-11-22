import type { OutboxEvent, QueuePort } from "@plinth/core";
import { describe, expect, it } from "vitest";

export interface QueueContractSuiteOptions {
  readonly adapterName: string;
  readonly createQueue: () => Promise<QueuePort> | QueuePort;
  readonly cleanup?: () => Promise<void> | void;
}

export function runQueueContractTests(suiteOptions: QueueContractSuiteOptions): void {
  const { adapterName, createQueue, cleanup } = suiteOptions;

  describe(`${adapterName} - Queue Adapter Contract Tests`, () => {
    it("should enqueue a job and execute its registered handler", async () => {
      const queue = await createQueue();
      await queue.start();

      let executed = false;
      let receivedEvent: OutboxEvent | null = null;

      queue.registerHandler("test.notification", async (event) => {
        executed = true;
        receivedEvent = event;
      });

      const jobId = await queue.enqueue({
        eventType: "test.notification",
        payload: { userId: "user-101", message: "Hello Queue!" },
      });

      expect(jobId).toBeDefined();

      // Poll until processed or timeout (up to 3s)
      const startTime = Date.now();
      while (!executed && Date.now() - startTime < 3000) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      expect(executed).toBe(true);
      expect(receivedEvent).not.toBeNull();
      const event = receivedEvent as OutboxEvent | null;
      expect(event?.payload).toEqual({
        userId: "user-101",
        message: "Hello Queue!",
      });

      await queue.stop();
      if (cleanup) await cleanup();
    });

    it("should route multiple event types to distinct handlers", async () => {
      const queue = await createQueue();
      await queue.start();

      const eventsSeen: string[] = [];

      queue.registerHandler("email.welcome", async (event) => {
        eventsSeen.push(`welcome:${String(event.payload["email"])}`);
      });

      queue.registerHandler("webhook.dispatch", async (event) => {
        eventsSeen.push(`webhook:${String(event.payload["url"])}`);
      });

      await queue.enqueue({
        eventType: "email.welcome",
        payload: { email: "alice@example.com" },
      });

      await queue.enqueue({
        eventType: "webhook.dispatch",
        payload: { url: "https://example.com/hook" },
      });

      // Poll until both are processed
      const startTime = Date.now();
      while (eventsSeen.length < 2 && Date.now() - startTime < 3000) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      expect(eventsSeen).toContain("welcome:alice@example.com");
      expect(eventsSeen).toContain("webhook:https://example.com/hook");

      await queue.stop();
      if (cleanup) await cleanup();
    });
  });
}
