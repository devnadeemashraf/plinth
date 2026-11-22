import { StubAnalyticsAdapter } from "@plinth/adapter-analytics-stub";
import { describe, expect, it } from "vitest";

describe("StubAnalyticsAdapter - Specific Features", () => {
  it("should evict oldest events when maxEvents capacity is exceeded", async () => {
    const adapter = new StubAnalyticsAdapter({ maxEvents: 3 });
    const consent = {
      essential: true,
      functional: true,
      analytics: true,
      marketing: true,
    };

    await adapter.track({ name: "event-1" }, consent);
    await adapter.track({ name: "event-2" }, consent);
    await adapter.track({ name: "event-3" }, consent);
    expect(adapter.getEvents().map((e) => e.name)).toEqual(["event-1", "event-2", "event-3"]);

    await adapter.track({ name: "event-4" }, consent);
    expect(adapter.getEvents().map((e) => e.name)).toEqual(["event-2", "event-3", "event-4"]);
  });

  it("should invoke onEvent hook when event is tracked", async () => {
    const captured: string[] = [];
    const adapter = new StubAnalyticsAdapter({
      onEvent: (event) => captured.push(event.name),
    });

    await adapter.track(
      { name: "hook-test" },
      { essential: true, functional: false, analytics: true, marketing: false },
    );
    expect(captured).toEqual(["hook-test"]);
  });

  it("should identify user with redacted traits and retrieve identified user", async () => {
    const adapter = new StubAnalyticsAdapter();
    const consent = {
      essential: true,
      functional: true,
      analytics: true,
      marketing: true,
    };

    await adapter.identify(
      {
        userId: "user-123",
        tenantId: "tenant-abc",
        traits: {
          plan: "pro",
          email: "charlie@example.com",
        },
      },
      consent,
    );

    const traits = adapter.getIdentifiedUser("user-123", "tenant-abc");
    expect(traits).toBeDefined();
    expect(traits?.["plan"]).toBe("pro");
    expect(traits?.["email"]).not.toBe("charlie@example.com");
    expect(traits?.["email"]).toContain("*");
  });
});
