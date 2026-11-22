# Adapter Swap Handbook: Stub Analytics vs PostHog / OTLP

This 1-page guide explains how to swap between `@plinth/adapter-analytics-stub` and external analytics sinks (PostHog, Segment, or OpenTelemetry OTLP).

---

## 1. Architectural Comparison

| Dimension | Stub Analytics (`adapter-analytics-stub`) | PostHog / OTLP Production Sink |
|---|---|---|
| **Backing Engine** | Bounded in-memory event array (FIFO) | Cloud analytics cluster via HTTP batching |
| **Consent Filtering** | Strict `hasConsentForEvent` gating | Strict `hasConsentForEvent` gating |
| **Dual-Layer PII Scrubbing**| Automatic email, phone, PAN, card scrubbing | Automatic email, phone, PAN, card scrubbing |
| **Target Audience** | Local dev, compliance testing, CI | Product management, conversion funnels |

---

## 2. GDPR & India DPDP Privacy Invariants
All analytics event ingestion unconditionally enforces user consent categories:
- `necessary`: System uptime, security logs (always active).
- `analytics`: Product usage, route views (requires explicit opt-in).
- `marketing`: Campaign conversion tracking (requires explicit opt-in).

If a user revokes analytics consent, subsequent event dispatches are dropped immediately before entering the buffer or network transport.

---

## 3. Swap Steps

### Custom Analytics Adapter Implementation
Create an adapter implementing `AnalyticsPort`:
```typescript
import { type AnalyticsPort, type AnalyticsEvent, RedactionEngine } from "@plinth/core";

export class PostHogAnalyticsAdapter implements AnalyticsPort {
  async track(event: AnalyticsEvent): Promise<void> {
    // Scrub sensitive keys and text before network transmission
    const scrubbedProperties = RedactionEngine.redact(event.properties);

    await fetch("https://app.posthog.com/capture/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.POSTHOG_API_KEY,
        event: event.name,
        distinct_id: event.userId,
        properties: scrubbedProperties,
      }),
    });
  }
}
```

### Verification:
```bash
pnpm test:analytics
```
Both adapters pass 100% of the shared `AnalyticsPort` contract tests.
