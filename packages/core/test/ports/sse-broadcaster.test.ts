import { describe, expect, it, vi } from "vitest";
import {
  DefaultSseBroadcaster,
  formatSseEvent,
  type SseClient,
  type SseEvent,
} from "@/ports/sse.js";

class MockSseClient implements SseClient {
  public sentEvents: SseEvent[] = [];
  public isClosed = false;
  public readonly id: string;
  public readonly tenantId?: string | undefined;

  constructor(id: string, tenantId?: string) {
    this.id = id;
    this.tenantId = tenantId;
  }

  public send(event: SseEvent): boolean {
    if (this.isClosed) {
      return false;
    }
    this.sentEvents.push(event);
    return true;
  }

  public close(): void {
    this.isClosed = true;
  }
}

describe("SSE Formatting & Broadcaster", () => {
  describe("formatSseEvent", () => {
    it("should format basic data payload", () => {
      const output = formatSseEvent({ data: "hello world" });
      expect(output).toBe("data: hello world\n\n");
    });

    it("should format full SSE event with id, event, retry, and multiline data", () => {
      const output = formatSseEvent({
        id: "evt-123",
        event: "update",
        retry: 5000,
        data: "line1\nline2",
      });
      expect(output).toBe("id: evt-123\nevent: update\nretry: 5000\ndata: line1\ndata: line2\n\n");
    });

    it("should JSON stringify object data", () => {
      const output = formatSseEvent({
        event: "order.created",
        data: { orderId: "ord-456", amount: 1000 },
      });
      expect(output).toBe('event: order.created\ndata: {"orderId":"ord-456","amount":1000}\n\n');
    });

    it("should sanitize CRLF in event name and id to prevent stream injection", () => {
      const output = formatSseEvent({
        id: "injected\r\ndata: fake",
        event: "evil\nevent",
        data: "clean",
      });
      expect(output).toBe("id: injecteddata: fake\nevent: evilevent\ndata: clean\n\n");
    });

    it("should format comment events with leading colon", () => {
      const output = formatSseEvent({ comment: "ping" });
      expect(output).toBe(": ping\n\n");
    });

    it("should sanitize CRLF and unicode line breaks in comment", () => {
      const output = formatSseEvent({ comment: "ping\r\ninjected\u2028payload" });
      expect(output).toBe(": pinginjectedpayload\n\n");
    });

    it("should ignore invalid retry numbers", () => {
      expect(formatSseEvent({ retry: -1, data: "test" })).toBe("data: test\n\n");
      expect(formatSseEvent({ retry: Number.NaN, data: "test" })).toBe("data: test\n\n");
    });
  });

  describe("DefaultSseBroadcaster", () => {
    it("should add clients, track count, and remove them", () => {
      const broadcaster = new DefaultSseBroadcaster({ heartbeatIntervalMs: 0 });
      const client1 = new MockSseClient("c1");
      const client2 = new MockSseClient("c2");

      expect(broadcaster.addClient(client1)).toBe(true);
      expect(broadcaster.addClient(client2)).toBe(true);
      expect(broadcaster.getClientCount()).toBe(2);

      broadcaster.removeClient("c1");
      expect(broadcaster.getClientCount()).toBe(1);
      expect(client1.isClosed).toBe(true);
    });

    it("should enforce maximum connection cap", () => {
      const broadcaster = new DefaultSseBroadcaster({
        maxConnections: 2,
        heartbeatIntervalMs: 0,
      });

      expect(broadcaster.addClient(new MockSseClient("c1"))).toBe(true);
      expect(broadcaster.addClient(new MockSseClient("c2"))).toBe(true);
      // Third client rejected
      expect(broadcaster.addClient(new MockSseClient("c3"))).toBe(false);
      expect(broadcaster.getClientCount()).toBe(2);
    });

    it("should broadcast to all clients and filter by tenant", () => {
      const broadcaster = new DefaultSseBroadcaster({ heartbeatIntervalMs: 0 });
      const c1 = new MockSseClient("c1", "tenant-alpha");
      const c2 = new MockSseClient("c2", "tenant-alpha");
      const c3 = new MockSseClient("c3", "tenant-beta");

      broadcaster.addClient(c1);
      broadcaster.addClient(c2);
      broadcaster.addClient(c3);

      const sentGlobal = broadcaster.broadcast({ data: "global announcement" });
      expect(sentGlobal).toBe(3);
      expect(c1.sentEvents).toHaveLength(1);
      expect(c2.sentEvents).toHaveLength(1);
      expect(c3.sentEvents).toHaveLength(1);

      const sentTenant = broadcaster.broadcastToTenant("tenant-alpha", {
        data: "alpha notice",
      });
      expect(sentTenant).toBe(2);
      expect(c1.sentEvents).toHaveLength(2);
      expect(c2.sentEvents).toHaveLength(2);
      expect(c3.sentEvents).toHaveLength(1); // Not sent to beta
    });

    it("should send directly to a specific client", () => {
      const broadcaster = new DefaultSseBroadcaster({ heartbeatIntervalMs: 0 });
      const c1 = new MockSseClient("c1");
      broadcaster.addClient(c1);

      const ok = broadcaster.sendToClient("c1", { data: "direct message" });
      expect(ok).toBe(true);
      expect(c1.sentEvents).toHaveLength(1);

      const missing = broadcaster.sendToClient("non-existent", { data: "lost" });
      expect(missing).toBe(false);
    });

    it("should automatically remove dead/closed clients on broadcast", () => {
      const broadcaster = new DefaultSseBroadcaster({ heartbeatIntervalMs: 0 });
      const c1 = new MockSseClient("c1");
      const c2 = new MockSseClient("c2");

      broadcaster.addClient(c1);
      broadcaster.addClient(c2);

      // Close c1 externally
      c1.close();

      const sent = broadcaster.broadcast({ data: "ping" });
      expect(sent).toBe(1);
      expect(broadcaster.getClientCount()).toBe(1);
    });

    it("should send heartbeat pings on configured interval and close all cleanly", () => {
      vi.useFakeTimers();
      try {
        const broadcaster = new DefaultSseBroadcaster({
          heartbeatIntervalMs: 5000,
        });
        const c1 = new MockSseClient("c1");
        broadcaster.addClient(c1);

        vi.advanceTimersByTime(5000);
        expect(c1.sentEvents).toHaveLength(1);

        vi.advanceTimersByTime(5000);
        expect(c1.sentEvents).toHaveLength(2);

        broadcaster.closeAll();
        expect(c1.isClosed).toBe(true);
        expect(broadcaster.getClientCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("should handle closed client in sendToClient and remove failing clients", () => {
      const broadcaster = new DefaultSseBroadcaster({ heartbeatIntervalMs: 0 });
      const c1 = new MockSseClient("c1");
      broadcaster.addClient(c1);
      c1.close();
      expect(broadcaster.sendToClient("c1", { data: "test" })).toBe(false);

      const c2 = new MockSseClient("c2");
      broadcaster.addClient(c2);
      c2.send = () => false; // fails to send
      expect(broadcaster.sendToClient("c2", { data: "test" })).toBe(false);
      expect(broadcaster.getClientCount()).toBe(0);
    });

    it("should handle failing and closed clients during heartbeat and send comments", () => {
      vi.useFakeTimers();
      try {
        const broadcaster = new DefaultSseBroadcaster({ heartbeatIntervalMs: 1000 });
        const c1 = new MockSseClient("c1");
        const c2 = new MockSseClient("c2");
        const c3 = new MockSseClient("c3");
        broadcaster.addClient(c1);
        broadcaster.addClient(c2);
        broadcaster.addClient(c3);

        c1.close();
        c2.send = () => false;

        vi.advanceTimersByTime(1000);
        // c3 received ping comment without false onmessage payload
        expect(c3.sentEvents).toHaveLength(1);
        expect(c3.sentEvents[0]?.comment).toBe("ping");
        expect(broadcaster.getClientCount()).toBe(1);
        broadcaster.closeAll();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
