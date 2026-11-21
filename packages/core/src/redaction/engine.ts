import { maskAadhaar, maskCreditCard, maskEmail, maskPan, maskToken } from "@/redaction/maskers.js";
import { isRedacted } from "@/redaction/redacted.js";

export interface RedactionOptions {
  readonly maxDepth?: number | undefined;
  readonly sensitiveKeys?: ReadonlySet<string> | undefined;
}

const DEFAULT_SENSITIVE_KEYS = [
  "password",
  "token",
  "secret",
  "apikey",
  "clientsecret",
  "sessiontoken",
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "access_token",
  "refresh_token",
  "private_key",
  "secretkey",
  "authtoken",
  "idtoken",
  "jwt",
  "credential",
];

const DEFAULT_MAX_DEPTH = 15;
const CIRCULAR_MARKER = "[Circular]";
const REDACTED_MARKER = "[REDACTED]";

// Regexes for freeform text scrubbing (strictly bounded to eliminate ReDoS)
const BEARER_SCRUB_REGEX = /Bearer\s+[A-Za-z0-9._-]+/g;
const CARD_SCRUB_REGEX = /\b(?:\d{4}[ -]){3}\d{4}\b|\b\d{13,19}\b/g;
const AADHAAR_SCRUB_REGEX = /\b[0-9]{4}\s[0-9]{4}\s[0-9]{4}\b(?!\s?[0-9]{4})/g;
const PAN_SCRUB_REGEX = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;
// Bounded email regex: local <= 64, domain labels <= 63, TLD 2..24 (RFC 5321 bounded)
const EMAIL_SCRUB_REGEX =
  /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}\b/g;

function normalizeKey(k: string): string {
  return k.toLowerCase().replace(/[-_]/g, "");
}

export class RedactionEngine {
  readonly #normalizedKeys: ReadonlySet<string>;
  readonly #maxDepth: number;

  constructor(options?: RedactionOptions) {
    this.#maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
    const initialKeys = options?.sensitiveKeys
      ? Array.from(options.sensitiveKeys)
      : DEFAULT_SENSITIVE_KEYS;
    this.#normalizedKeys = new Set(initialKeys.map(normalizeKey));
  }

  isSensitiveKey(key: string): boolean {
    if (!key) {
      return false;
    }
    return this.#normalizedKeys.has(normalizeKey(key));
  }

  redact<T>(input: T, options?: { maxDepth?: number }): T {
    const maxDepth = options?.maxDepth ?? this.#maxDepth;
    const seen = new WeakSet<object>();

    const traverse = (val: unknown, depth: number): unknown => {
      if (val === null || val === undefined) {
        return val;
      }

      if (isRedacted(val)) {
        return REDACTED_MARKER;
      }

      if (typeof val !== "object") {
        return val;
      }

      if (depth >= maxDepth) {
        return "[MaxDepthExceeded]";
      }

      if (seen.has(val)) {
        return CIRCULAR_MARKER;
      }
      seen.add(val);

      if (Array.isArray(val)) {
        return val.map((item) => traverse(item, depth + 1));
      }

      if (val instanceof Error) {
        const errObj: Record<string, unknown> = {
          name: val.name,
          message: this.scrubText(val.message),
        };
        if (val.stack) {
          errObj["stack"] = val.stack;
        }
        if ("cause" in val && val.cause !== undefined) {
          errObj["cause"] = traverse(val.cause, depth + 1);
        }
        return errObj;
      }

      const result: Record<string, unknown> = {};
      const entries = Object.entries(val as Record<string, unknown>);

      for (const [key, propVal] of entries) {
        if (this.isSensitiveKey(key)) {
          result[key] = REDACTED_MARKER;
        } else {
          result[key] = traverse(propVal, depth + 1);
        }
      }

      return result;
    };

    return traverse(input, 0) as T;
  }

  scrubText(text: string): string {
    if (!text) {
      return text;
    }

    let scrubbed = text;

    // 1. Bearer token
    scrubbed = scrubbed.replace(BEARER_SCRUB_REGEX, (match) => maskToken(match));

    // 2. Credit card (must run before Aadhaar to avoid masking 3 of 4 card chunks as Aadhaar)
    scrubbed = scrubbed.replace(CARD_SCRUB_REGEX, (match) => maskCreditCard(match));

    // 3. Aadhaar (guarded by negative lookahead to avoid 4-group cards)
    scrubbed = scrubbed.replace(AADHAAR_SCRUB_REGEX, (match) => maskAadhaar(match));

    // 4. PAN
    scrubbed = scrubbed.replace(PAN_SCRUB_REGEX, (match) => maskPan(match));

    // 5. Email (bounded to eliminate polynomial ReDoS)
    scrubbed = scrubbed.replace(EMAIL_SCRUB_REGEX, (match) => maskEmail(match));

    return scrubbed;
  }
}

export const defaultRedactionEngine = new RedactionEngine();
