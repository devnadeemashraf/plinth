import type { AnalyticsEvent, AnalyticsPort, ConsentPreferences } from "@plinth/core";
import { describe, expect, it } from "vitest";

export interface AnalyticsContractOptions {
  readonly createAdapter: () => Promise<{
    readonly adapter: AnalyticsPort;
    readonly getEvents: () => AnalyticsEvent[];
    readonly clear: () => void;
  }>;
}

export function runAnalyticsContractTests(options: AnalyticsContractOptions): void {
  describe("Analytics Adapter Contract Tests", () => {
    it("1. Consent Enforcement - should record when consent is granted and drop when denied", async () => {
      const { adapter, getEvents, clear } = await options.createAdapter();
      clear();

      const grantedConsent: ConsentPreferences = {
        essential: true,
        functional: false,
        analytics: true,
        marketing: false,
      };

      const deniedConsent: ConsentPreferences = {
        essential: true,
        functional: false,
        analytics: false,
        marketing: false,
      };

      // Event with requiredConsent: "analytics" and granted preferences
      await adapter.track(
        {
          name: "dashboard.viewed",
          requiredConsent: "analytics",
          properties: { page: "home" },
        },
        grantedConsent,
      );

      // Event with requiredConsent: "analytics" and denied preferences
      await adapter.track(
        {
          name: "dashboard.clicked_button",
          requiredConsent: "analytics",
          properties: { button: "cta" },
        },
        deniedConsent,
      );

      const events = getEvents();
      expect(events.length).toBe(1);
      expect(events[0]?.name).toBe("dashboard.viewed");
    });

    it("2. Essential Events - should record essential events regardless of consent", async () => {
      const { adapter, getEvents, clear } = await options.createAdapter();
      clear();

      const deniedConsent: ConsentPreferences = {
        essential: true,
        functional: false,
        analytics: false,
        marketing: false,
      };

      await adapter.track(
        {
          name: "security.password_changed",
          requiredConsent: "essential",
          properties: { status: "success" },
        },
        deniedConsent,
      );

      const events = getEvents();
      expect(events.length).toBe(1);
      expect(events[0]?.name).toBe("security.password_changed");
    });

    it("3. PII Redaction - should scrub sensitive properties from recorded events", async () => {
      const { adapter, getEvents, clear } = await options.createAdapter();
      clear();

      const grantedConsent: ConsentPreferences = {
        essential: true,
        functional: false,
        analytics: true,
        marketing: false,
      };

      await adapter.track(
        {
          name: "user.updated_profile",
          requiredConsent: "analytics",
          properties: {
            email: "alice@example.com",
            phone: "+15551234567",
            customNote: "Safe details",
          },
        },
        grantedConsent,
      );

      const events = getEvents();
      expect(events.length).toBe(1);
      const props = events[0]?.properties as Record<string, string>;
      expect(props["email"]).not.toBe("alice@example.com");
      expect(props["email"]).toContain("*");
      expect(props["customNote"]).toBe("Safe details");
    });
  });
}
