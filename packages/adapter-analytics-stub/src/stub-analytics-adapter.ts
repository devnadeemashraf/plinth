import {
  type AnalyticsEvent,
  type AnalyticsPort,
  type ConsentPreferences,
  defaultRedactionEngine,
  hasConsentForEvent,
  type IdentifyUserInput,
  type RedactionEngine,
} from "@plinth/core";

export interface StubAnalyticsOptions {
  readonly maxEvents?: number | undefined;
  readonly redactionEngine?: RedactionEngine | undefined;
  readonly onEvent?: ((event: AnalyticsEvent) => void) | undefined;
}

export class StubAnalyticsAdapter implements AnalyticsPort {
  private readonly maxEvents: number;
  private readonly redactionEngine: RedactionEngine;
  private readonly onEvent?: ((event: AnalyticsEvent) => void) | undefined;
  private readonly events: AnalyticsEvent[] = [];
  private readonly identifiedUsers = new Map<string, Record<string, unknown>>();

  constructor(options: StubAnalyticsOptions = {}) {
    this.maxEvents = options.maxEvents ?? 1000;
    this.redactionEngine = options.redactionEngine ?? defaultRedactionEngine;
    this.onEvent = options.onEvent;
  }

  private scrubValue(val: unknown): unknown {
    if (typeof val === "string") {
      return this.redactionEngine.scrubText(val);
    }
    if (val !== null && typeof val === "object") {
      const redacted = this.redactionEngine.redact(val) as Record<string, unknown>;
      if (Array.isArray(redacted)) {
        return redacted.map((item) => this.scrubValue(item));
      }
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(redacted)) {
        result[k] = this.scrubValue(v);
      }
      return result;
    }
    return val;
  }

  async track(event: AnalyticsEvent, consent?: ConsentPreferences): Promise<void> {
    if (!hasConsentForEvent(event, consent)) {
      return;
    }

    const scrubbedProperties = event.properties
      ? (this.scrubValue(event.properties) as Record<string, unknown>)
      : undefined;

    const recordedEvent: AnalyticsEvent = {
      name: event.name,
      tenantId: event.tenantId,
      userId: event.userId,
      requiredConsent: event.requiredConsent ?? "analytics",
      properties: scrubbedProperties,
      timestamp: event.timestamp ?? new Date(),
    };

    if (this.events.length >= this.maxEvents) {
      this.events.shift(); // Evict oldest
    }
    this.events.push(recordedEvent);

    if (this.onEvent) {
      this.onEvent(recordedEvent);
    }
  }

  async identify(input: IdentifyUserInput, consent?: ConsentPreferences): Promise<void> {
    const pseudoEvent: AnalyticsEvent = {
      name: "$identify",
      requiredConsent: input.requiredConsent ?? "analytics",
    };
    if (!hasConsentForEvent(pseudoEvent, consent)) {
      return;
    }

    const scrubbedTraits = input.traits
      ? (this.scrubValue(input.traits) as Record<string, unknown>)
      : {};

    const key = input.tenantId ? `${input.tenantId}:${input.userId}` : input.userId;
    this.identifiedUsers.set(key, scrubbedTraits);
  }

  getEvents(): AnalyticsEvent[] {
    return [...this.events];
  }

  getIdentifiedUser(userId: string, tenantId?: string): Record<string, unknown> | undefined {
    const key = tenantId ? `${tenantId}:${userId}` : userId;
    return this.identifiedUsers.get(key);
  }

  clear(): void {
    this.events.length = 0;
    this.identifiedUsers.clear();
  }

  async flush(): Promise<void> {
    // In-memory stub needs no flush
  }

  async shutdown(): Promise<void> {
    this.clear();
  }
}
