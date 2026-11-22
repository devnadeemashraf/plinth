import { describe, expect, it } from "vitest";
import {
  type AnalyticsEvent,
  type ConsentPreferences,
  DEFAULT_CONSENT_PREFERENCES,
  hasConsentForEvent,
} from "@/ports/analytics.js";

describe("Analytics Port - Consent & Event Invariants", () => {
  it("should have essential consent enabled by default", () => {
    expect(DEFAULT_CONSENT_PREFERENCES.essential).toBe(true);
    expect(DEFAULT_CONSENT_PREFERENCES.analytics).toBe(false);
    expect(DEFAULT_CONSENT_PREFERENCES.marketing).toBe(false);
    expect(DEFAULT_CONSENT_PREFERENCES.functional).toBe(false);
  });

  it("should allow essential events regardless of user consent preferences", () => {
    const essentialEvent: AnalyticsEvent = {
      name: "security.login_failed",
      requiredConsent: "essential",
    };
    const deniedPreferences: ConsentPreferences = {
      essential: true,
      analytics: false,
      marketing: false,
      functional: false,
    };
    expect(hasConsentForEvent(essentialEvent, deniedPreferences)).toBe(true);
    expect(hasConsentForEvent(essentialEvent, undefined)).toBe(true);
  });

  it("should check consent for non-essential events", () => {
    const analyticsEvent: AnalyticsEvent = {
      name: "page_view",
      requiredConsent: "analytics",
    };
    const granted: ConsentPreferences = {
      essential: true,
      analytics: true,
      marketing: false,
      functional: false,
    };
    const denied: ConsentPreferences = {
      essential: true,
      analytics: false,
      marketing: false,
      functional: false,
    };
    expect(hasConsentForEvent(analyticsEvent, granted)).toBe(true);
    expect(hasConsentForEvent(analyticsEvent, denied)).toBe(false);
    expect(hasConsentForEvent(analyticsEvent, undefined)).toBe(false);
  });

  it("should default requiredConsent to analytics if not specified", () => {
    const event: AnalyticsEvent = {
      name: "button_clicked",
    };
    const granted: ConsentPreferences = {
      essential: true,
      analytics: true,
      marketing: false,
      functional: false,
    };
    const denied: ConsentPreferences = {
      essential: true,
      analytics: false,
      marketing: false,
      functional: false,
    };
    expect(hasConsentForEvent(event, granted)).toBe(true);
    expect(hasConsentForEvent(event, denied)).toBe(false);
  });
});
