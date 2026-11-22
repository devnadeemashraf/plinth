import { createHmac } from "node:crypto";
import {
  BadRequestError,
  type BillingCustomer,
  type BillingPort,
  type BillingSubscription,
  type BillingWebhookEvent,
  type CheckoutSession,
  type CreateCheckoutSessionInput,
  type CreateCustomerInput,
  calculateLineItemsTotal,
  generateUuidV7,
  timingSafeEqualString,
  type VerifyWebhookSignatureInput,
  validateLineItems,
} from "@plinth/core";

export interface StubBillingAdapterOptions {
  readonly baseUrl?: string | undefined;
}

export class StubBillingAdapter implements BillingPort {
  readonly provider = "stub" as const;
  readonly #baseUrl: string;
  readonly #customers = new Map<string, BillingCustomer>();
  readonly #sessions = new Map<string, CheckoutSession>();
  readonly #subscriptions = new Map<string, BillingSubscription>();

  constructor(options: StubBillingAdapterOptions = {}) {
    this.#baseUrl = options.baseUrl ?? "http://localhost:3000";
  }

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession> {
    validateLineItems(input.lineItems);
    const amountTotal = calculateLineItemsTotal(input.lineItems);

    const sessionId = `stub_cs_${generateUuidV7()}`;
    const currency = input.lineItems[0]?.currency ?? "USD";

    let subscriptionId: string | undefined;
    if (input.mode === "subscription") {
      subscriptionId = `stub_sub_${generateUuidV7()}`;
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

      const sub: BillingSubscription = {
        id: subscriptionId,
        provider: "stub",
        customerId: input.customerId ?? `stub_cus_${generateUuidV7()}`,
        status: "active",
        planId: input.lineItems[0]?.name ?? "default_plan",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        metadata: input.metadata,
      };
      this.#subscriptions.set(subscriptionId, sub);
    }

    const session: CheckoutSession = {
      id: sessionId,
      url: `${this.#baseUrl}/billing/stub-checkout?session_id=${sessionId}`,
      provider: "stub",
      status: "open",
      amountTotal,
      currency,
      mode: input.mode,
      customerId: input.customerId,
      subscriptionId,
      metadata: input.metadata,
    };

    this.#sessions.set(sessionId, session);
    return session;
  }

  async createCustomer(input: CreateCustomerInput): Promise<BillingCustomer> {
    if (!input.email || typeof input.email !== "string" || !input.email.includes("@")) {
      throw new BadRequestError("Customer email must be a valid email string.", {
        code: "INVALID_CUSTOMER_EMAIL",
      });
    }

    const customerId = `stub_cus_${generateUuidV7()}`;
    const customer: BillingCustomer = {
      id: customerId,
      provider: "stub",
      email: input.email.toLowerCase().trim(),
      name: input.name,
      billingAddress: input.billingAddress,
      taxId: input.taxId,
      metadata: input.metadata,
    };

    this.#customers.set(customerId, customer);
    return customer;
  }

  async getCustomer(customerId: string): Promise<BillingCustomer | null> {
    return this.#customers.get(customerId) ?? null;
  }

  async getSubscription(subscriptionId: string): Promise<BillingSubscription | null> {
    return this.#subscriptions.get(subscriptionId) ?? null;
  }

  async cancelSubscription(
    subscriptionId: string,
    options?: { cancelImmediately?: boolean } | undefined,
  ): Promise<BillingSubscription> {
    const existing = this.#subscriptions.get(subscriptionId);
    if (!existing) {
      throw new BadRequestError(`Subscription '${subscriptionId}' not found.`, {
        code: "SUBSCRIPTION_NOT_FOUND",
      });
    }

    const updated: BillingSubscription = {
      ...existing,
      status: options?.cancelImmediately ? "canceled" : existing.status,
      cancelAtPeriodEnd: !options?.cancelImmediately,
      canceledAt: new Date(),
    };

    this.#subscriptions.set(subscriptionId, updated);
    return updated;
  }

  async verifyWebhookSignature(input: VerifyWebhookSignatureInput): Promise<BillingWebhookEvent> {
    const rawBuffer = Buffer.isBuffer(input.rawBody)
      ? input.rawBody
      : Buffer.from(input.rawBody, "utf8");

    // Case-insensitive header lookup for signature
    let signatureHeader: string | undefined;
    for (const [key, value] of Object.entries(input.headers)) {
      const lower = key.toLowerCase();
      if (lower === "x-stub-signature" || lower === "x-webhook-signature") {
        signatureHeader = Array.isArray(value) ? value[0] : value;
        break;
      }
    }

    if (!signatureHeader || signatureHeader.trim().length === 0) {
      throw new BadRequestError("Missing webhook signature header ('x-stub-signature').", {
        code: "MISSING_WEBHOOK_SIGNATURE",
      });
    }

    const expectedSignature = createHmac("sha256", input.webhookSecret)
      .update(rawBuffer)
      .digest("hex");

    if (!timingSafeEqualString(expectedSignature, signatureHeader)) {
      throw new BadRequestError("Invalid webhook signature.", {
        code: "INVALID_WEBHOOK_SIGNATURE",
      });
    }

    try {
      const parsed = JSON.parse(rawBuffer.toString("utf8")) as Record<string, unknown>;
      const eventType = (parsed["event"] ?? parsed["eventType"] ?? "payment.succeeded") as string;
      const eventId = (parsed["id"] ?? `stub_evt_${generateUuidV7()}`) as string;

      return {
        id: eventId,
        provider: "stub",
        eventType: eventType as BillingWebhookEvent["eventType"],
        timestamp: new Date(),
        data: (parsed["data"] as BillingWebhookEvent["data"]) ?? {},
        rawPayload: parsed,
      };
    } catch (err) {
      throw new BadRequestError("Malformed JSON webhook payload.", {
        code: "MALFORMED_WEBHOOK_JSON",
        cause: err,
      });
    }
  }

  /**
   * Helper for tests & Dev/Admin UI to simulate realistic webhooks with HMAC headers.
   */
  simulateWebhook(
    event: BillingWebhookEvent,
    webhookSecret: string,
  ): { headers: Record<string, string>; rawBody: Buffer } {
    const rawBody = Buffer.from(JSON.stringify(event.rawPayload), "utf8");
    const signature = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");

    return {
      headers: {
        "x-stub-signature": signature,
        "content-type": "application/json",
      },
      rawBody,
    };
  }

  reset(): void {
    this.#customers.clear();
    this.#sessions.clear();
    this.#subscriptions.clear();
  }
}
