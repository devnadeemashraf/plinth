export type ConsentCategory = "essential" | "functional" | "analytics" | "marketing";

export type ConsentPreferences = Readonly<Record<ConsentCategory, boolean>>;

export const DEFAULT_CONSENT_PREFERENCES: ConsentPreferences = {
  essential: true,
  functional: false,
  analytics: false,
  marketing: false,
};

export interface AnalyticsEvent {
  readonly name: string;
  readonly tenantId?: string | undefined;
  readonly userId?: string | undefined;
  readonly requiredConsent?: ConsentCategory | undefined;
  readonly properties?: Readonly<Record<string, unknown>> | undefined;
  readonly timestamp?: Date | undefined;
}

export interface IdentifyUserInput {
  readonly userId: string;
  readonly tenantId?: string | undefined;
  readonly traits?: Readonly<Record<string, unknown>> | undefined;
  readonly requiredConsent?: ConsentCategory | undefined;
}

/**
 * Checks whether an analytics event is permitted under the given user consent preferences.
 * Essential events are always permitted.
 */
export function hasConsentForEvent(
  event: AnalyticsEvent,
  preferences?: ConsentPreferences | undefined,
): boolean {
  const category = event.requiredConsent ?? "analytics";
  if (category === "essential") {
    return true;
  }
  if (!preferences) {
    return false;
  }
  return preferences[category] === true;
}

export interface AnalyticsPort {
  track(event: AnalyticsEvent, consent?: ConsentPreferences): Promise<void>;
  identify(input: IdentifyUserInput, consent?: ConsentPreferences): Promise<void>;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}
