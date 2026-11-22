/**
 * Server-Sent Events (SSE) Port & Broadcaster Contracts
 *
 * Provides a production-hardened SSE streaming engine with heartbeat keep-alives,
 * connection caps, CRLF injection defenses, tenant filtering, and disconnect cleanup.
 */

export interface SseEvent {
  readonly id?: string | undefined;
  readonly event?: string | undefined;
  readonly data?: unknown | undefined;
  readonly comment?: string | undefined;
  readonly retry?: number | undefined;
}

export interface SseClient {
  readonly id: string;
  readonly tenantId?: string | undefined;
  readonly isClosed: boolean;
  send(event: SseEvent): boolean;
  close(): void;
}

export interface SseBroadcasterPort {
  /**
   * Registers an active client connection.
   * Returns false if the maximum client connection cap is reached.
   */
  addClient(client: SseClient): boolean;

  /**
   * Removes a client connection by ID.
   */
  removeClient(clientId: string): void;

  /**
   * Broadcasts an event to all connected clients, optionally filtered.
   * Returns the number of clients the event was sent to.
   */
  broadcast(event: SseEvent, filter?: (client: SseClient) => boolean): number;

  /**
   * Broadcasts an event strictly to clients of a specific tenant.
   */
  broadcastToTenant(tenantId: string, event: SseEvent): number;

  /**
   * Sends an event directly to a single client by ID.
   */
  sendToClient(clientId: string, event: SseEvent): boolean;

  /**
   * Returns current active client count.
   */
  getClientCount(): number;

  /**
   * Closes all active connections and cleans up background timers.
   */
  closeAll(): void;
}

const CRLF_REGEX = /[\r\n\u2028\u2029]/g;

/**
 * Formats an SSE event into a spec-compliant text/event-stream wire chunk.
 * Sanitizes field names to prevent SSE stream injection.
 */
export function formatSseEvent(event: SseEvent): string {
  let output = "";

  if (event.comment !== undefined) {
    const sanitizedComment = String(event.comment).replace(CRLF_REGEX, "");
    output += `: ${sanitizedComment}\n\n`;
    return output;
  }

  if (event.id !== undefined) {
    const sanitizedId = String(event.id).replace(CRLF_REGEX, "");
    output += `id: ${sanitizedId}\n`;
  }

  if (event.event !== undefined) {
    const sanitizedEvent = String(event.event).replace(CRLF_REGEX, "");
    output += `event: ${sanitizedEvent}\n`;
  }

  if (event.retry !== undefined && Number.isFinite(event.retry) && event.retry >= 0) {
    output += `retry: ${Math.floor(event.retry)}\n`;
  }

  // Handle data payload: strings, primitives, or JSON-serializable objects
  const rawData = typeof event.data === "string" ? event.data : JSON.stringify(event.data ?? null);

  // Each line in data payload MUST be prefixed with "data: "
  const lines = rawData.split(/\r\n|\r|\n/);
  for (const line of lines) {
    output += `data: ${line}\n`;
  }

  output += "\n";
  return output;
}

export interface DefaultSseBroadcasterOptions {
  /**
   * Maximum concurrent SSE connections permitted before rejecting new ones.
   * @default 1000
   */
  readonly maxConnections?: number | undefined;

  /**
   * Keep-alive ping interval in milliseconds.
   * Set to 0 to disable heartbeats.
   * @default 15000 (15s)
   */
  readonly heartbeatIntervalMs?: number | undefined;
}

/**
 * Production-hardened SSE Broadcaster maintaining client maps,
 * periodic keep-alive comments (": ping\n\n"), and bounded capacity.
 */
export class DefaultSseBroadcaster implements SseBroadcasterPort {
  private readonly clients = new Map<string, SseClient>();
  private readonly maxConnections: number;
  private readonly heartbeatIntervalMs: number;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: DefaultSseBroadcasterOptions = {}) {
    this.maxConnections = options.maxConnections ?? 1000;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15_000;

    if (this.heartbeatIntervalMs > 0) {
      this.heartbeatTimer = setInterval(() => {
        this.sendHeartbeat();
      }, this.heartbeatIntervalMs);

      // Allow Node process to exit cleanly if this timer is active
      if (typeof this.heartbeatTimer === "object" && "unref" in this.heartbeatTimer) {
        this.heartbeatTimer.unref();
      }
    }
  }

  public addClient(client: SseClient): boolean {
    if (this.clients.size >= this.maxConnections) {
      return false;
    }
    this.clients.set(client.id, client);
    return true;
  }

  public removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      if (!client.isClosed) {
        client.close();
      }
    }
  }

  public broadcast(event: SseEvent, filter?: (client: SseClient) => boolean): number {
    let sentCount = 0;
    const toRemove: string[] = [];

    for (const [id, client] of this.clients) {
      if (client.isClosed) {
        toRemove.push(id);
        continue;
      }

      if (filter && !filter(client)) {
        continue;
      }

      const success = client.send(event);
      if (success) {
        sentCount += 1;
      } else {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.removeClient(id);
    }

    return sentCount;
  }

  public broadcastToTenant(tenantId: string, event: SseEvent): number {
    return this.broadcast(event, (client) => client.tenantId === tenantId);
  }

  public sendToClient(clientId: string, event: SseEvent): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.isClosed) {
      if (client) {
        this.clients.delete(clientId);
      }
      return false;
    }

    const success = client.send(event);
    if (!success) {
      this.removeClient(clientId);
      return false;
    }
    return true;
  }

  public getClientCount(): number {
    return this.clients.size;
  }

  public closeAll(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    for (const client of this.clients.values()) {
      if (!client.isClosed) {
        client.close();
      }
    }
    this.clients.clear();
  }

  private sendHeartbeat(): void {
    const toRemove: string[] = [];
    for (const [id, client] of this.clients) {
      if (client.isClosed) {
        toRemove.push(id);
        continue;
      }

      // Spec-compliant SSE comment format for keepalive (: ping\n\n)
      const heartbeatEvent: SseEvent = {
        comment: "ping",
      };
      const ok = client.send(heartbeatEvent);
      if (!ok) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.removeClient(id);
    }
  }
}
